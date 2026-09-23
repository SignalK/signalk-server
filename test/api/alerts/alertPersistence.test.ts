/**
 * The alert manager against real persistence.
 *
 * Every other alerts suite exercises one side of the seam: the manager tests
 * run on an in-memory double, and the store tests run without a manager. These
 * wire a real AlertStore on a temp file to a real AlertManager and restart the
 * pair, which is the only way to see whether what one wrote is what the other
 * reads back.
 */

import { expect } from 'chai'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  AlertManager,
  type AlertEvent,
  type AlertManagerConfig
} from '../../../src/api/alerts/alertManager'
import { AlertStore } from '../../../src/api/alerts/alertStore'
import type { Alert } from '../../../src/api/alerts/types'
import { FakeTimerFunctions } from './helpers/fakeTimerFunctions'
import {
  asPath,
  asSourceRef,
  captureConsole,
  presentAlert,
  raiseParams
} from './helpers/fixtures'

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const ESCALATION_TIMEOUT_MS = 300 * 1000

/** The window `escalationTimer.ts` falls back to for an unusable setting. */
const DEFAULT_ESCALATION_TIMEOUT_MS = 300 * 1000

/**
 * The daily retention prune a successful load arms, which every pending-timer
 * count below carries on top of the timers under test.
 */
const RETENTION_TIMERS = 1

/**
 * Let a fire-and-forget store write settle before reading the file back.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('alerts persistence', () => {
  let tempDir: string
  let dbPath: string
  let stores: AlertStore[]
  let managers: AlertManager[]

  const config: AlertManagerConfig = {
    escalation: {
      enabled: true,
      timeoutSeconds: ESCALATION_TIMEOUT_MS / 1000
    },
    silencing: {
      defaultMaxSilenceSeconds: 120,
      emergencyMaxSilenceSeconds: 30
    }
  }

  async function openStore(): Promise<AlertStore> {
    const store = new AlertStore(dbPath)
    stores.push(store)
    await store.initialize()
    return store
  }

  function openManager(
    store: AlertStore,
    timers: FakeTimerFunctions,
    overrides: Partial<AlertManagerConfig> = {}
  ): AlertManager {
    const manager = new AlertManager({ ...config, ...overrides }, timers, store)
    managers.push(manager)
    return manager
  }

  /**
   * Rewrite an alert's row as a restart would find it after downtime.
   *
   * Timestamps are the one part of a restart a test cannot produce by waiting,
   * so the row the manager wrote is put back with the clock moved on.
   */
  function afterDowntime(
    store: AlertStore,
    alert: Alert,
    changes: Partial<Alert>
  ): Promise<void> {
    return store.commit({
      alertId: alert.id,
      alert: { ...alert, ...changes },
      history: []
    })
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alerts-persistence-'))
    dbPath = path.join(tempDir, 'alerts.db')
    stores = []
    managers = []
  })

  afterEach(async () => {
    try {
      for (const manager of managers) {
        manager.stop()
      }
      for (const store of stores) {
        await store.close()
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('restores an alert across a restart exactly as it was raised', async () => {
    const first = await openStore()
    const firstManager = openManager(first, new FakeTimerFunctions())

    const raised = await firstManager.raiseAlert(
      raiseParams({
        path: 'propulsion.port.oilPressureLow',
        references: [
          'propulsion.port.oilPressure',
          'propulsion.port.revolutions'
        ],
        context: 'vessels.urn:mrn:imo:mmsi:230099999',
        $source: 'n2k-on-ve.can-bus.115',
        source: { label: 'n2k-on-ve.can-bus', pgn: 127489 },
        priority: 'alarm',
        message: 'Oil pressure low',
        group: 'engine',
        latching: true,
        data: { pressure: 84000, threshold: 100000 }
      })
    )
    const silenced = await firstManager.silenceAlert(raised.id, 60_000)

    const other = await firstManager.raiseAlert(
      raiseParams({
        path: 'electrical.batteries.house.lowVoltage',
        references: ['electrical.batteries.house.voltage'],
        context: 'vessels.urn:mrn:imo:mmsi:230099999',
        $source: 'n2k-on-ve.can-bus.16',
        source: { label: 'n2k-on-ve.can-bus', pgn: 127508 },
        priority: 'warning',
        message: 'House bank low',
        group: 'electrical',
        latching: false,
        data: { voltage: 11.4 }
      })
    )
    await firstManager.acknowledgeAlert(other.id, 'user-1')
    const acknowledged = presentAlert(firstManager.getAlert(other.id))

    firstManager.stop()
    await first.close()

    const second = await openStore()
    const secondManager = openManager(second, new FakeTimerFunctions())
    await secondManager.loadFromStore()

    expect(secondManager.getActiveAlertCount()).to.equal(2)
    expect(presentAlert(secondManager.getAlert(raised.id))).to.deep.equal(
      silenced
    )
    expect(presentAlert(secondManager.getAlert(other.id))).to.deep.equal(
      acknowledged
    )

    // Spelled out as well as deep-compared, so a fixture that quietly stopped
    // populating one of these cannot make the comparison vacuous.
    const restored = presentAlert(secondManager.getAlert(raised.id))
    expect(restored.state).to.equal('unacknowledged')
    expect(restored.silenced).to.equal(true)
    expect(restored.silencedUntil).to.equal(silenced.silencedUntil)
    expect(restored.latching).to.equal(true)
    expect(restored.group).to.equal('engine')
    expect(restored.references).to.deep.equal([
      'propulsion.port.oilPressure',
      'propulsion.port.revolutions'
    ])
    expect(restored.context).to.equal('vessels.urn:mrn:imo:mmsi:230099999')
    expect(restored.source).to.deep.equal({
      label: 'n2k-on-ve.can-bus',
      pgn: 127489
    })
    expect(restored.data).to.deep.equal({ pressure: 84000, threshold: 100000 })
    expect(
      presentAlert(secondManager.getAlert(other.id)).acknowledgedBy
    ).to.equal('user-1')
  })

  it('unsilences a silence that ran out during the downtime and records it', async () => {
    const first = await openStore()
    const firstManager = openManager(first, new FakeTimerFunctions())

    const raised = await firstManager.raiseAlert(
      raiseParams({ path: 'test.alert.silenced' })
    )
    const silenced = await firstManager.silenceAlert(raised.id, 60_000)
    await afterDowntime(first, silenced, {
      silencedUntil: new Date(Date.now() - 1000).toISOString()
    })

    firstManager.stop()
    await first.close()

    const second = await openStore()
    const secondManager = openManager(second, new FakeTimerFunctions())
    const events: AlertEvent[] = []
    secondManager.on('alert', (event: AlertEvent) => events.push(event))
    await secondManager.loadFromStore()

    const restored = presentAlert(secondManager.getAlert(raised.id))
    expect(restored.silenced).to.equal(false)
    expect(restored.silencedUntil).to.be.undefined
    expect(events.map((event) => event.type)).to.deep.equal(['unsilenced'])

    // The unsilence is a transition like any other, so it has to reach both
    // the row and the audit trail rather than only the registry.
    expect(
      (await second.getAll()).map((alert) => alert.silenced)
    ).to.deep.equal([false])
    const { entries } = await second.queryHistory({ alertId: raised.id })
    expect(entries.map((entry) => entry.eventType)).to.deep.equal([
      'unsilence',
      'silence',
      'raise'
    ])
  })

  it('re-arms a silence that is still running for the time it has left', async () => {
    const first = await openStore()
    const firstManager = openManager(first, new FakeTimerFunctions())

    const raised = await firstManager.raiseAlert(
      raiseParams({ path: 'test.alert.silenced' })
    )
    const silenced = await firstManager.silenceAlert(raised.id, 60_000)
    // Down for 45 of the 60 seconds.
    await afterDowntime(first, silenced, {
      silencedUntil: new Date(Date.now() + 15_000).toISOString()
    })

    firstManager.stop()
    await first.close()

    const second = await openStore()
    const timers = new FakeTimerFunctions()
    const secondManager = openManager(second, timers)
    await secondManager.loadFromStore()

    expect(timers.getPendingCount()).to.equal(RETENTION_TIMERS + 1)
    expect(presentAlert(secondManager.getAlert(raised.id)).silenced).to.equal(
      true
    )

    timers.advanceTime(14_000)
    expect(presentAlert(secondManager.getAlert(raised.id)).silenced).to.equal(
      true
    )

    timers.advanceTime(2_000)
    expect(presentAlert(secondManager.getAlert(raised.id)).silenced).to.equal(
      false
    )
  })

  it('escalates a restored warning when the rest of its window runs out', async () => {
    const first = await openStore()
    const firstManager = openManager(first, new FakeTimerFunctions())

    const raised = await firstManager.raiseAlert(
      raiseParams({
        path: 'propulsion.port.coolantTemperatureHigh',
        priority: 'warning',
        message: 'Coolant temperature high'
      })
    )
    // Down for 250 of the 300 second escalation window.
    await afterDowntime(first, raised, {
      stateChangedAt: new Date(Date.now() - 250_000).toISOString()
    })

    firstManager.stop()
    await first.close()

    const second = await openStore()
    const timers = new FakeTimerFunctions()
    const secondManager = openManager(second, timers)
    await secondManager.loadFromStore()

    expect(presentAlert(secondManager.getAlert(raised.id)).priority).to.equal(
      'warning'
    )

    timers.advanceTime(40_000)
    expect(presentAlert(secondManager.getAlert(raised.id)).priority).to.equal(
      'warning'
    )

    timers.advanceTime(20_000)
    expect(presentAlert(secondManager.getAlert(raised.id)).priority).to.equal(
      'alarm'
    )

    await settle()
    expect(
      (await second.getAll()).map((alert) => alert.priority)
    ).to.deep.equal(['alarm'])
  })

  it('resumes a restored warning on the fallback window when the configured one is unusable', async () => {
    const first = await openStore()
    const firstManager = openManager(first, new FakeTimerFunctions())

    const raised = await firstManager.raiseAlert(
      raiseParams({
        path: 'propulsion.port.coolantTemperatureHigh',
        priority: 'warning',
        message: 'Coolant temperature high'
      })
    )

    firstManager.stop()
    await first.close()

    const second = await openStore()
    const timers = new FakeTimerFunctions()
    const { result: secondManager } = await captureConsole(async () => {
      const manager = openManager(second, timers, {
        escalation: { enabled: true, timeoutSeconds: Number.NaN }
      })
      await manager.loadFromStore()
      return manager
    })

    // An unresolved NaN reaches setTimeout through the resumed window and
    // escalates every restored warning on the next tick.
    timers.advanceTime(1)
    expect(presentAlert(secondManager.getAlert(raised.id)).priority).to.equal(
      'warning'
    )

    timers.advanceTime(DEFAULT_ESCALATION_TIMEOUT_MS)
    expect(presentAlert(secondManager.getAlert(raised.id)).priority).to.equal(
      'alarm'
    )
  })

  it('gives a restored warning the window it has left rather than escalating it at once', async () => {
    const first = await openStore()
    const firstManager = openManager(first, new FakeTimerFunctions())

    const raised = await firstManager.raiseAlert(
      raiseParams({
        path: 'propulsion.port.coolantTemperatureHigh',
        priority: 'warning',
        message: 'Coolant temperature high'
      })
    )

    firstManager.stop()
    await first.close()

    const second = await openStore()
    const timers = new FakeTimerFunctions()
    const secondManager = openManager(second, timers)
    const events: AlertEvent[] = []
    secondManager.on('alert', (event: AlertEvent) => events.push(event))
    await secondManager.loadFromStore()

    expect(
      events.filter((event) => event.type === 'escalated')
    ).to.have.lengthOf(0)
    expect(presentAlert(secondManager.getAlert(raised.id)).priority).to.equal(
      'warning'
    )
    expect(timers.getPendingCount()).to.equal(RETENTION_TIMERS + 1)

    timers.advanceTime(ESCALATION_TIMEOUT_MS - 5_000)
    expect(presentAlert(secondManager.getAlert(raised.id)).priority).to.equal(
      'warning'
    )

    timers.advanceTime(10_000)
    expect(presentAlert(secondManager.getAlert(raised.id)).priority).to.equal(
      'alarm'
    )
  })

  it('reads the audit trail back in the order the transitions happened', async () => {
    const first = await openStore()
    const firstManager = openManager(first, new FakeTimerFunctions())

    const raised = await firstManager.raiseAlert(
      raiseParams({
        path: 'propulsion.port.oilPressureLow',
        $source: 'source-A',
        priority: 'warning',
        message: 'From A'
      })
    )
    await firstManager.silenceAlert(raised.id, 30_000)
    // One transition, two entries: the priority rises and a second source
    // takes the alert over.
    await firstManager.raiseAlert(
      raiseParams({
        path: 'propulsion.port.oilPressureLow',
        $source: 'source-B',
        priority: 'alarm',
        message: 'From B'
      })
    )
    await firstManager.acknowledgeAlert(raised.id, 'user-1')
    await firstManager.clearCondition(raised.id)

    firstManager.stop()
    await first.close()

    const second = await openStore()
    const { entries, total } = await second.queryHistory({ alertId: raised.id })

    expect(total).to.equal(6)
    // Newest first, and the two entries one transition appended keep the order
    // they happened in even though they share a millisecond.
    expect(entries.map((entry) => entry.eventType)).to.deep.equal([
      'clear',
      'acknowledge',
      'raise',
      'escalate',
      'silence',
      'raise'
    ])
    expect(entries[3].previousPriority).to.equal('warning')
    expect(entries[3].newPriority).to.equal('alarm')
    expect(entries[2].$source).to.equal('source-B')
    expect(entries[2].details).to.deep.equal({ previousSource: 'source-A' })
    expect(entries[5].$source).to.equal('source-A')
    expect(entries[1].userId).to.equal('user-1')
    expect(entries[0].newState).to.equal('normal')

    // The alert resolved, so the trail is all that is left of it.
    expect(await second.getAll()).to.deep.equal([])
  })

  it('prunes audit entries past the retention window on the daily timer', async () => {
    const store = await openStore()
    const timers = new FakeTimerFunctions()
    const manager = openManager(store, timers, { retentionDays: 1 })
    await manager.loadFromStore()

    const raised = await manager.raiseAlert(
      raiseParams({ path: 'test.alert.kept' })
    )
    // An entry from three days ago, as a server left running would hold.
    await store.commit({
      alertId: 'ancient-alert',
      alert: null,
      history: [
        {
          alertId: 'ancient-alert',
          path: asPath('test.alert.ancient'),
          priority: 'caution',
          message: 'Ancient alert',
          $source: asSourceRef('test-source'),
          eventType: 'raise',
          timestamp: new Date(
            Date.now() - 3 * MILLISECONDS_PER_DAY
          ).toISOString()
        }
      ]
    })

    expect((await store.queryHistory({})).total).to.equal(2)

    timers.advanceTime(PRUNE_INTERVAL_MS)
    await settle()

    const { entries, total } = await store.queryHistory({})
    expect(total).to.equal(1)
    expect(entries.map((entry) => entry.alertId)).to.deep.equal([raised.id])
  })
})
