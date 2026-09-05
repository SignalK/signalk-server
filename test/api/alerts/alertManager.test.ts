import { expect } from 'chai'
import {
  AlertManager,
  type AlertManagerConfig,
  type AlertEvent,
  type StoreFailureEvent
} from '../../../src/api/alerts/alertManager'
import {
  AlertLimitReachedError,
  AlertNotFoundError,
  InvalidEscalationError,
  InvalidSilenceDurationError
} from '../../../src/api/alerts/errors'
import type { AlertTransition } from '../../../src/api/alerts/types'
import { FakeTimerFunctions } from './helpers/fakeTimerFunctions'
import {
  asContext,
  asPath,
  captureConsole,
  FailingAlertStore,
  MockAlertStore,
  presentAlert,
  raiseParams,
  storedAlert
} from './helpers/fixtures'

/**
 * Assert that a promise rejects with an error whose message contains `message`.
 */
async function expectRejection(promise: Promise<unknown>, message: string) {
  try {
    await promise
  } catch (err) {
    expect((err as Error).message).to.include(message)
    return
  }
  expect.fail(`expected rejection containing "${message}"`)
}

/** The error a promise rejected with, for assertions about its type. */
async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (err) {
    return err as Error
  }
  return expect.fail('expected a rejection, got a resolved promise')
}

/**
 * Persistence that runs a hook inside its commit, so a test can act on the
 * manager while a mutator is suspended on the store.
 */
class HookedAlertStore extends MockAlertStore {
  onCommit?: (transition: AlertTransition) => Promise<void> | void

  async commit(transition: AlertTransition): Promise<void> {
    await super.commit(transition)
    const hook = this.onCommit
    if (hook) {
      this.onCommit = undefined
      await hook(transition)
    }
  }
}

/**
 * Persistence whose commits fail on a schedule the test writes.
 *
 * Attempts are numbered from 1 in the order the manager makes them, and a
 * resync's re-commits are attempts like any other, so a test can fail the
 * recovery itself rather than only the write that triggered it.
 */
class ScriptedAlertStore extends MockAlertStore {
  failAttempt: (attempt: number) => boolean = () => false
  private attempts = 0

  commit(transition: AlertTransition): Promise<void> {
    this.attempts += 1
    if (this.failAttempt(this.attempts)) {
      return Promise.reject(new Error('SQLite disk I/O error'))
    }
    return super.commit(transition)
  }
}

/**
 * Persistence that lets a test run a lifecycle write while the resync sweep is
 * suspended mid-way, which is the only way to reach the sweep's own race.
 */
class RacingAlertStore extends MockAlertStore {
  failWhen: (transition: AlertTransition) => boolean = () => false
  duringSweep?: () => Promise<void>
  private raced = false

  async commit(transition: AlertTransition): Promise<void> {
    if (this.failWhen(transition)) {
      return Promise.reject(new Error('SQLite disk I/O error'))
    }
    await super.commit(transition)
    // A sweep re-commit carries no audit entries; a lifecycle write does.
    if (transition.history.length === 0 && !this.raced && this.duringSweep) {
      this.raced = true
      await this.duringSweep()
    }
  }
}

const SILENCE_DURATION_ERROR =
  'Silence duration must be a positive number of milliseconds'

describe('AlertManager', () => {
  let manager: AlertManager
  let fakeTimers: FakeTimerFunctions
  let events: AlertEvent[]
  let defaultConfig: AlertManagerConfig

  beforeEach(() => {
    fakeTimers = new FakeTimerFunctions()
    events = []
    defaultConfig = {
      escalation: {
        enabled: true,
        timeoutSeconds: 300
      },
      silencing: {
        defaultMaxSilenceSeconds: 120,
        emergencyMaxSilenceSeconds: 30
      }
    }
    manager = new AlertManager(defaultConfig, fakeTimers)
    manager.on('alert', (event: AlertEvent) => events.push(event))
  })

  afterEach(() => {
    manager.stop()
  })

  describe('typed errors', () => {
    it('rejects an unknown alert id with AlertNotFoundError everywhere', async () => {
      const mutators: Array<() => Promise<unknown>> = [
        () => manager.acknowledgeAlert('missing'),
        () => manager.escalateAlert('missing', 'alarm'),
        () => manager.silenceAlert('missing'),
        () => manager.unsilenceAlert('missing'),
        () => manager.clearCondition('missing')
      ]

      for (const mutate of mutators) {
        const error = await rejectionOf(mutate())
        expect(error).to.be.instanceOf(AlertNotFoundError)
        expect((error as AlertNotFoundError).code).to.equal('ALERT_NOT_FOUND')
        // The id belongs in the message: a REST layer selects on the code, an
        // operator reading a log needs to know which alert.
        expect(error.message).to.include('missing')
      }
    })

    it('rejects a de-escalation with InvalidEscalationError', async () => {
      const alert = await manager.raiseAlert(raiseParams({ priority: 'alarm' }))

      const error = await rejectionOf(
        manager.escalateAlert(alert.id, 'warning')
      )

      expect(error).to.be.instanceOf(InvalidEscalationError)
      expect((error as InvalidEscalationError).code).to.equal(
        'INVALID_ESCALATION'
      )
    })

    it('rejects a silence duration that is not positive with InvalidSilenceDurationError', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      const error = await rejectionOf(manager.silenceAlert(alert.id, 0))

      expect(error).to.be.instanceOf(InvalidSilenceDurationError)
      expect((error as InvalidSilenceDurationError).code).to.equal(
        'INVALID_SILENCE_DURATION'
      )
    })
  })

  describe('active alert cap', () => {
    beforeEach(() => {
      manager.stop()
      manager = new AlertManager(
        { ...defaultConfig, maxActiveAlerts: 2 },
        fakeTimers
      )
    })

    async function raisePath(path: string) {
      return manager.raiseAlert(raiseParams({ path }))
    }

    it('refuses a new alert past the cap and keeps the ones it has', async () => {
      await raisePath('one')
      await raisePath('two')

      const { result: error } = await captureConsole(() =>
        rejectionOf(raisePath('three'))
      )

      expect(error).to.be.instanceOf(AlertLimitReachedError)
      expect((error as AlertLimitReachedError).code).to.equal(
        'ALERT_LIMIT_REACHED'
      )
      expect(manager.getAlerts()).to.have.lengthOf(2)
    })

    it('still updates an alert that already exists at the cap', async () => {
      await raisePath('one')
      const two = await raisePath('two')

      const updated = await manager.raiseAlert(
        raiseParams({ path: 'two', message: 'louder' })
      )

      expect(updated.id).to.equal(two.id)
      expect(updated.message).to.equal('louder')
    })

    it('accepts a new alert again once one resolves', async () => {
      const one = await raisePath('one')
      await raisePath('two')
      await manager.clearCondition(one.id)
      await manager.acknowledgeAlert(one.id)

      const three = await raisePath('three')

      expect(three.path).to.equal('three')
    })

    it('logs the cap once, not once per refusal', async () => {
      await raisePath('one')
      await raisePath('two')

      const { errors, warnings } = await captureConsole(async () => {
        await rejectionOf(raisePath('three'))
        await rejectionOf(raisePath('four'))
      })

      expect([...errors, ...warnings]).to.have.lengthOf(1)
    })

    it('lets a more urgent alert displace the least urgent one', async () => {
      await manager.raiseAlert(
        raiseParams({ path: 'one', priority: 'caution' })
      )
      await manager.raiseAlert(
        raiseParams({ path: 'two', priority: 'caution' })
      )
      events = []

      const emergency = await captureConsole(() =>
        manager.raiseAlert(
          raiseParams({ path: 'flooding', priority: 'emergency' })
        )
      )

      expect(emergency.result.priority).to.equal('emergency')
      const active = manager.getAlerts().map((alert) => alert.path)
      expect(active).to.include('flooding')
      // Among equals the stalest gives way: the one whose state changed
      // longest ago.
      expect(active).to.deep.equal(['two', 'flooding'])
    })

    it('announces and records a displacement', async () => {
      const store = new MockAlertStore()
      manager.stop()
      manager = new AlertManager(
        { ...defaultConfig, maxActiveAlerts: 2 },
        fakeTimers,
        store
      )
      const seen: AlertEvent[] = []
      manager.on('alert', (event: AlertEvent) => seen.push(event))
      await manager.raiseAlert(
        raiseParams({ path: 'one', priority: 'caution' })
      )
      await manager.raiseAlert(
        raiseParams({ path: 'two', priority: 'caution' })
      )
      store.resetHistory()

      await captureConsole(() =>
        manager.raiseAlert(raiseParams({ path: 'flooding', priority: 'alarm' }))
      )

      // The mirror has to learn the displaced alert is gone.
      expect(seen.map((e) => e.type)).to.include('cleared')
      const displaced = store.history.find(
        (entry) => entry.details?.reason === 'displaced'
      )
      expect(displaced?.eventType).to.equal('clear')
    })

    it('still refuses an alert no less urgent than everything active', async () => {
      await manager.raiseAlert(raiseParams({ path: 'one', priority: 'alarm' }))
      await manager.raiseAlert(raiseParams({ path: 'two', priority: 'alarm' }))

      const { result: error } = await captureConsole(() =>
        rejectionOf(
          manager.raiseAlert(raiseParams({ path: 'three', priority: 'alarm' }))
        )
      )

      expect(error).to.be.instanceOf(AlertLimitReachedError)
      expect(manager.getAlerts()).to.have.lengthOf(2)
    })

    it('reports the cap again after a later episode', async () => {
      const one = await raisePath('one')
      await raisePath('two')
      await captureConsole(() => rejectionOf(raisePath('three')))
      await manager.clearCondition(one.id)
      await manager.acknowledgeAlert(one.id)
      await raisePath('four')

      const { errors } = await captureConsole(() =>
        rejectionOf(raisePath('five'))
      )

      expect(errors).to.have.lengthOf(1)
    })

    it('falls back to the default when the configured cap is unusable', async () => {
      for (const configured of [0, -1, 2.5, Number.NaN]) {
        manager.stop()
        const { result, errors } = await captureConsole(async () => {
          manager = new AlertManager(
            { ...defaultConfig, maxActiveAlerts: configured },
            fakeTimers
          )
          return manager.raiseAlert(raiseParams())
        })

        expect(result.path).to.equal('test.alert')
        expect(errors).to.have.lengthOf(1)
      }
    })

    it('restores every persisted alert even past the cap', async () => {
      const store = new MockAlertStore()
      store.prePopulate([
        storedAlert({ id: 'a', path: 'one' }),
        storedAlert({ id: 'b', path: 'two' }),
        storedAlert({ id: 'c', path: 'three' })
      ])
      manager.stop()
      manager = new AlertManager(
        { ...defaultConfig, maxActiveAlerts: 2 },
        fakeTimers,
        store
      )

      await manager.loadFromStore()

      expect(manager.getAlerts()).to.have.lengthOf(3)
    })

    it('keeps one alert per path when two raises race at the cap', async () => {
      const { errors } = await captureConsole(async () => {
        await raisePath('one')
        await raisePath('two')

        // Displacing an alert awaits a store commit. The raise that suspends
        // there resumes after the other has already created the alert and
        // claimed the index key, so it must join that alert rather than mint a
        // second one nothing can reach.
        await Promise.all([
          manager.raiseAlert(
            raiseParams({ path: 'three', priority: 'emergency' })
          ),
          manager.raiseAlert(
            raiseParams({ path: 'three', priority: 'emergency' })
          )
        ])
      })

      const onThree = manager
        .getAlerts()
        .filter((alert) => alert.path === asPath('three'))
      expect(onThree).to.have.lengthOf(1)
      expect(manager.getAlerts()).to.have.lengthOf(2)
      expect(manager.getAlertByPath(asPath('three'))?.id).to.equal(
        onThree[0].id
      )
      expect(errors).to.have.lengthOf(1)
    })
  })

  describe('raiseAlert', () => {
    it('should create a new alert with correct initial state', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      expect(alert.id).to.not.be.undefined
      expect(alert.$source).to.equal('test-source')
      expect(alert.priority).to.equal('alarm')
      expect(alert.state).to.equal('unacknowledged')
      expect(alert.condition).to.equal(true)
      expect(alert.message).to.equal('Test alert')
      expect(alert.sourceOnline).to.equal(true)
      expect(alert.stale).to.equal(false)
    })

    it('should emit alert-raised event', async () => {
      await manager.raiseAlert(raiseParams())

      expect(events).to.have.lengthOf(1)
      expect(events[0].type).to.equal('raised')
      expect(events[0].alert.message).to.equal('Test alert')
    })

    it('should store alert in internal collection', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      const retrieved = manager.getAlert(alert.id)
      expect(retrieved).to.deep.equal(alert)
    })

    it('should start escalation timer for warning priority', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )

      expect(fakeTimers.getPendingCount()).to.equal(1)

      // Advance time to trigger escalation
      fakeTimers.advanceTime(300 * 1000)

      const updated = manager.getAlert(alert.id)
      expect(updated?.priority).to.equal('alarm')
    })

    it('should not start escalation timer for alarm priority', async () => {
      await manager.raiseAlert(raiseParams({ message: 'Test alarm' }))

      expect(fakeTimers.getPendingCount()).to.equal(0)
    })

    it('should support optional group and data', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({
          message: 'Engine alert',
          group: 'engine',
          data: { temperature: 95, threshold: 90 }
        })
      )

      expect(alert.group).to.equal('engine')
      expect(alert.data).to.deep.equal({ temperature: 95, threshold: 90 })
    })

    it('should support latching alerts', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ message: 'Latching alert', latching: true })
      )

      expect(alert.latching).to.equal(true)
    })
  })

  describe('acknowledgeAlert', () => {
    it('should transition unacknowledged to acknowledged', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      const result = await manager.acknowledgeAlert(alert.id, 'user-1')

      expect(result.alert?.state).to.equal('acknowledged')
      expect(result.alert?.acknowledgedBy).to.equal('user-1')
      expect(result.alert?.acknowledgedAt).to.not.be.undefined
    })

    it('should emit alert-acknowledged event', async () => {
      const alert = await manager.raiseAlert(raiseParams())
      events = [] // Clear raise event

      await manager.acknowledgeAlert(alert.id)

      expect(events).to.have.lengthOf(1)
      expect(events[0].type).to.equal('acknowledged')
    })

    it('should cancel escalation timer on acknowledge', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )

      expect(fakeTimers.getPendingCount()).to.equal(1)

      await manager.acknowledgeAlert(alert.id)

      expect(fakeTimers.getPendingCount()).to.equal(0)
    })

    it('should clear RTN-unacknowledged alert on acknowledge', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.clearCondition(alert.id)
      const clearedAt = manager.getAlert(alert.id)?.clearedAt
      events = []

      const result = await manager.acknowledgeAlert(alert.id)

      expect(result.cleared).to.equal(true)
      expect(manager.getAlert(alert.id)).to.be.null

      // The alert is announced with its terminal value, not the state it held
      // before resolution.
      expect(events).to.have.lengthOf(1)
      expect(events[0].type).to.equal('cleared')
      expect(events[0].alert.state).to.equal('normal')
      expect(events[0].alert.condition).to.equal(false)
      expect(events[0].alert.clearedAt).to.equal(clearedAt)
      expect(Date.parse(events[0].alert.stateChangedAt)).to.be.at.least(
        Date.parse(alert.stateChangedAt)
      )
    })

    it('should throw for non-existent alert', async () => {
      await expectRejection(
        manager.acknowledgeAlert('non-existent'),
        'Alert not found'
      )
    })
  })

  describe('silenceAlert', () => {
    it('should set silenced flag and silencedUntil', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      const silenced = await manager.silenceAlert(alert.id, 30000)

      expect(silenced.silenced).to.equal(true)
      expect(silenced.silencedUntil).to.not.be.undefined
    })

    it('should emit alert-silenced event', async () => {
      const alert = await manager.raiseAlert(raiseParams())
      events = []

      await manager.silenceAlert(alert.id)

      expect(events).to.have.lengthOf(1)
      expect(events[0].type).to.equal('silenced')
    })

    it('should use default duration from config for alarm', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      const silenced = await manager.silenceAlert(alert.id)

      // Default is 120 seconds for alarm
      if (silenced.silencedUntil === undefined) {
        throw new Error('Expected silencedUntil to be defined')
      }
      const silencedUntil = new Date(silenced.silencedUntil).getTime()
      const now = Date.now()
      expect(silencedUntil - now).to.be.at.most(120000)
      expect(silencedUntil - now).to.be.greaterThan(119000)
    })

    it('should use shorter duration for emergency', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'emergency', message: 'Test emergency' })
      )

      const silenced = await manager.silenceAlert(alert.id)

      // Default is 30 seconds for emergency
      if (silenced.silencedUntil === undefined) {
        throw new Error('Expected silencedUntil to be defined')
      }
      const silencedUntil = new Date(silenced.silencedUntil).getTime()
      const now = Date.now()
      expect(silencedUntil - now).to.be.at.most(30000)
      expect(silencedUntil - now).to.be.greaterThan(29000)
    })

    it('should clamp a duration longer than the configured maximum', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      const silenced = await manager.silenceAlert(alert.id, 10 * 60 * 1000)

      if (silenced.silencedUntil === undefined) {
        throw new Error('Expected silencedUntil to be defined')
      }
      const silencedUntil = new Date(silenced.silencedUntil).getTime()
      const now = Date.now()
      expect(silencedUntil - now).to.be.at.most(120000)
      expect(silencedUntil - now).to.be.greaterThan(119000)

      // The expiration timer obeys the same cap.
      fakeTimers.advanceTime(119000)
      expect(manager.getAlert(alert.id)?.silenced).to.equal(true)
      fakeTimers.advanceTime(2000)
      expect(manager.getAlert(alert.id)?.silenced).to.equal(false)
    })

    it('should reject a zero, negative or NaN duration', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await expectRejection(
        manager.silenceAlert(alert.id, 0),
        SILENCE_DURATION_ERROR
      )
      await expectRejection(
        manager.silenceAlert(alert.id, -1000),
        SILENCE_DURATION_ERROR
      )
      await expectRejection(
        manager.silenceAlert(alert.id, Number.NaN),
        SILENCE_DURATION_ERROR
      )

      expect(manager.getAlert(alert.id)?.silenced).to.equal(false)
    })

    it('should throw for non-existent alert', async () => {
      await expectRejection(
        manager.silenceAlert('non-existent'),
        'Alert not found'
      )
    })
  })

  describe('clearCondition', () => {
    it('should transition acknowledged alert to cleared', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.acknowledgeAlert(alert.id)
      const result = await manager.clearCondition(alert.id)

      expect(result.cleared).to.equal(true)
      expect(manager.getAlert(alert.id)).to.be.null
    })

    it('should transition unacknowledged to rtn-unacknowledged', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      const result = await manager.clearCondition(alert.id)

      expect(result.cleared).to.equal(false)
      expect(result.alert?.state).to.equal('rtn-unacknowledged')
    })

    it('should auto-clear caution alerts', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'caution', message: 'Test caution' })
      )

      const result = await manager.clearCondition(alert.id)

      expect(result.cleared).to.equal(true)
      expect(manager.getAlert(alert.id)).to.be.null
    })

    it('should emit alert-cleared event when removed', async () => {
      const alert = await manager.raiseAlert(raiseParams())
      await manager.acknowledgeAlert(alert.id)
      events = []

      await manager.clearCondition(alert.id)

      expect(events).to.have.lengthOf(1)
      expect(events[0].type).to.equal('cleared')

      // The event carries the terminal value of the resolved alert.
      const cleared = events[0].alert
      expect(cleared.id).to.equal(alert.id)
      expect(cleared.state).to.equal('normal')
      expect(cleared.condition).to.equal(false)
      expect(cleared.clearedAt).to.equal(cleared.stateChangedAt)
      expect(Date.parse(cleared.stateChangedAt)).to.be.at.least(
        Date.parse(alert.stateChangedAt)
      )
    })

    it('should not re-announce a repeat clear of an already-cleared condition', async () => {
      const store = new MockAlertStore()
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)
      manager.on('alert', (event: AlertEvent) => events.push(event))

      const alert = await manager.raiseAlert(raiseParams())
      await manager.clearCondition(alert.id)
      const commitsAfterFirstClear = store.commitCount
      store.resetHistory()
      events = []

      const result = await manager.clearCondition(alert.id)

      expect(result.cleared).to.equal(false)
      expect(result.alert?.state).to.equal('rtn-unacknowledged')
      expect(events).to.have.lengthOf(0)
      expect(store.history).to.have.lengthOf(0)
      expect(store.commitCount).to.equal(commitsAfterFirstClear)
    })

    it('should cancel escalation timer when clearing warning', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )

      expect(fakeTimers.getPendingCount()).to.equal(1)

      await manager.clearCondition(alert.id)

      expect(fakeTimers.getPendingCount()).to.equal(0)
    })

    it('should throw for non-existent alert', async () => {
      await expectRejection(
        manager.clearCondition('non-existent'),
        'Alert not found'
      )
    })
  })

  describe('updateDescription', () => {
    it('refreshes the descriptive fields without re-alerting', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ group: 'engine', data: { rpm: 1000 } })
      )
      await manager.acknowledgeAlert(alert.id, 'operator')
      events.length = 0

      const updated = await manager.updateDescription(alert.id, {
        data: { rpm: 1200 },
        references: [asPath('propulsion.port.revolutions')]
      })

      expect(updated.data).to.deep.equal({ rpm: 1200 })
      expect(updated.references).to.deep.equal([
        asPath('propulsion.port.revolutions')
      ])
      // The point of the method: an acknowledged alert stays acknowledged.
      expect(updated.state).to.equal('acknowledged')
      expect(updated.group).to.equal('engine')
      expect(events.map((event) => event.type)).to.deep.equal(['updated'])
    })

    it('does nothing at all when the description is unchanged', async () => {
      const store = new MockAlertStore()
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)
      manager.on('alert', (event: AlertEvent) => events.push(event))
      const alert = await manager.raiseAlert(
        raiseParams({ group: 'engine', data: { rpm: 1000 } })
      )
      const commitsAfterRaise = store.commitCount
      events.length = 0

      const same = await manager.updateDescription(alert.id, {
        $source: alert.$source,
        group: 'engine',
        data: { rpm: 1000 }
      })

      // A source re-emitting an identical alert is the common case. It must
      // cost neither a delta to every subscriber nor a durable write.
      expect(same).to.equal(alert)
      expect(events).to.have.lengthOf(0)
      expect(store.commitCount).to.equal(commitsAfterRaise)
    })

    it('brings a stale alert back when its source speaks again', async () => {
      const store = new MockAlertStore()
      manager.stop()
      manager = new AlertManager(
        { ...defaultConfig, sourceTimeoutSeconds: 60 },
        fakeTimers,
        store
      )
      manager.on('alert', (event: AlertEvent) => events.push(event))
      const alert = await manager.raiseAlert(
        raiseParams({ data: { rpm: 1000 } })
      )
      manager.noteSourceUpdate(alert.id)
      fakeTimers.advanceTime(60 * 1000)
      expect(presentAlert(manager.getAlert(alert.id)).stale).to.equal(true)
      events.length = 0

      // The description has not moved, but the source coming back is the
      // whole point of the message: staying stale would misreport a live
      // source for as long as it keeps saying the same thing.
      const recovered = await manager.updateDescription(alert.id, {
        data: { rpm: 1000 }
      })

      expect(recovered.stale).to.equal(false)
      expect(recovered.sourceOnline).to.equal(true)
      expect(events.map((event) => event.type)).to.deep.equal(['updated'])
      expect(store.getStoredAlert(alert.id)?.stale).to.equal(false)
    })

    it('publishes a changed structured source', async () => {
      const alert = await manager.raiseAlert(raiseParams())
      events.length = 0

      const updated = await manager.updateDescription(alert.id, {
        source: { label: 'n2k', pgn: 127489 }
      })

      expect(updated.source).to.deep.equal({ label: 'n2k', pgn: 127489 })
      expect(events.map((event) => event.type)).to.deep.equal(['updated'])
    })

    it('records nothing in the audit trail', async () => {
      const store = new MockAlertStore()
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)
      const alert = await manager.raiseAlert(raiseParams())
      store.resetHistory()

      await manager.updateDescription(alert.id, { data: { rpm: 1200 } })

      expect(store.eventTypes()).to.deep.equal([])
      expect(store.getStoredAlert(alert.id)?.data).to.deep.equal({ rpm: 1200 })
    })

    it('rejects an unknown alert', async () => {
      await expectRejection(
        manager.updateDescription('non-existent', { data: {} }),
        'Alert not found'
      )
    })
  })

  describe('escalation', () => {
    it('does not report a silent source as live when an operator escalates', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )
      const reportedAt = alert.lastSourceUpdate

      await new Promise((resolve) => setTimeout(resolve, 2))
      const escalated = await manager.escalateAlert(alert.id, 'alarm')

      // lastSourceUpdate answers "when did the source last speak". The
      // operator escalating is not the source speaking.
      expect(escalated.lastSourceUpdate).to.equal(reportedAt)
      expect(escalated.stateChangedAt).to.not.equal(alert.stateChangedAt)
    })

    it('announces a source re-raise at a higher priority as escalated', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )
      events.length = 0

      const raised = await manager.raiseAlert(
        raiseParams({ priority: 'emergency', message: 'Test warning' })
      )

      // The audit trail records this as an escalation, and a listener driving
      // renewed annunciation reads the event stream, so the two must agree.
      expect(raised.id).to.equal(alert.id)
      expect(raised.priority).to.equal('emergency')
      expect(events.map((event) => event.type)).to.deep.equal(['escalated'])
      expect(events[0].previousState).to.equal('unacknowledged')
    })

    it('moves an escalated alert to the front of its new priority group', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )

      await new Promise((resolve) => setTimeout(resolve, 2))
      const escalated = await manager.raiseAlert(
        raiseParams({ priority: 'alarm', message: 'Test warning' })
      )

      // Escalation is a state change, and display order reads stateChangedAt
      // within a priority group. The timer and operator routes both bump it,
      // so a source-driven escalation has to as well.
      expect(escalated.priority).to.equal('alarm')
      expect(escalated.stateChangedAt).to.not.equal(alert.stateChangedAt)
    })

    it('still announces an unchanged re-raise as updated', async () => {
      await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )
      events.length = 0

      await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )

      expect(events.map((event) => event.type)).to.deep.equal(['updated'])
    })

    it('should escalate warning to alarm after timeout', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )
      events = []

      fakeTimers.advanceTime(300 * 1000)

      const updated = manager.getAlert(alert.id)
      expect(updated?.priority).to.equal('alarm')
      expect(events).to.have.lengthOf(1)
      expect(events[0].type).to.equal('escalated')
    })

    it('advances stateChangedAt when the escalation timer fires', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )
      const before = alert.stateChangedAt
      // Guarantee the wall clock advances past the raise timestamp.
      await new Promise<void>((resolve) => setTimeout(resolve, 5))

      fakeTimers.advanceTime(300 * 1000)

      const updated = manager.getAlert(alert.id)
      expect(updated?.priority).to.equal('alarm')
      expect((updated?.stateChangedAt ?? '') > before).to.equal(true)
    })

    it('should unsilence a warning the timer escalates', async () => {
      // A silence that outlasts the escalation window is the only way to reach
      // this: the timer fires precisely because nobody attended to the warning,
      // so the alarm it produces must be audible.
      manager.stop()
      manager = new AlertManager(
        {
          ...defaultConfig,
          silencing: {
            defaultMaxSilenceSeconds: 600,
            emergencyMaxSilenceSeconds: 30
          }
        },
        fakeTimers
      )
      events = []
      manager.on('alert', (event: AlertEvent) => events.push(event))

      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )
      await manager.silenceAlert(alert.id)
      expect(manager.getAlert(alert.id)?.silenced).to.equal(true)
      events = []

      fakeTimers.advanceTime(300 * 1000)

      const escalated = manager.getAlert(alert.id)
      expect(escalated?.priority).to.equal('alarm')
      expect(escalated?.silenced).to.equal(false)
      expect(escalated?.silencedUntil).to.be.undefined
      expect(events).to.have.lengthOf(1)
      expect(events[0].type).to.equal('escalated')
      expect(events[0].alert.silenced).to.equal(false)

      // The pending unsilence timer went with it, so nothing fires later.
      fakeTimers.advanceTime(600 * 1000)
      expect(events).to.have.lengthOf(1)
    })

    it('should not escalate if acknowledged before timeout', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )

      await manager.acknowledgeAlert(alert.id)
      fakeTimers.advanceTime(300 * 1000)

      const updated = manager.getAlert(alert.id)
      expect(updated?.priority).to.equal('warning')
    })

    it('should not escalate a latched warning whose condition cleared', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({
          priority: 'warning',
          message: 'Test warning',
          latching: true
        })
      )

      expect(fakeTimers.getPendingCount()).to.equal(1)

      await manager.clearCondition(alert.id)
      events = []

      // Still unacknowledged and still a warning, but the condition is gone:
      // the alert waits for acknowledgment, not for urgency.
      expect(manager.getAlert(alert.id)?.state).to.equal('unacknowledged')
      expect(fakeTimers.getPendingCount()).to.equal(0)

      fakeTimers.advanceTime(300 * 1000)

      expect(manager.getAlert(alert.id)?.priority).to.equal('warning')
      expect(events.filter((e) => e.type === 'escalated')).to.have.lengthOf(0)
    })

    it('should not escalate if disabled in config', async () => {
      manager.stop()
      manager = new AlertManager(
        {
          ...defaultConfig,
          escalation: { enabled: false, timeoutSeconds: 300 }
        },
        fakeTimers
      )

      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )

      fakeTimers.advanceTime(300 * 1000)

      const updated = manager.getAlert(alert.id)
      expect(updated?.priority).to.equal('warning')
    })
  })

  describe('source liveness', () => {
    /** Raise through the delta convention: re-emission is the heartbeat. */
    async function raiseFromDelta(overrides = {}) {
      const alert = await manager.raiseAlert(raiseParams(overrides))
      manager.noteSourceUpdate(alert.id)
      return alert
    }

    it('keeps an alert fresh while its source keeps re-emitting', async () => {
      const alert = await raiseFromDelta()

      for (let i = 0; i < 4; i++) {
        fakeTimers.advanceTime(30 * 1000)
        await raiseFromDelta()
      }
      fakeTimers.advanceTime(30 * 1000)

      expect(manager.getAlert(alert.id)?.stale).to.equal(false)
    })

    it('marks an alert stale when its source goes quiet', async () => {
      const alert = await raiseFromDelta()
      events = []

      fakeTimers.advanceTime(61 * 1000)
      await Promise.resolve()

      const stale = manager.getAlert(alert.id)
      expect(stale?.stale).to.equal(true)
      expect(stale?.sourceOnline).to.equal(false)
      // The mirror has to learn about it, so the transition is announced.
      expect(events.map((e) => e.type)).to.deep.equal(['updated'])
    })

    it('clears staleness when the source comes back', async () => {
      const alert = await raiseFromDelta()
      fakeTimers.advanceTime(61 * 1000)
      await Promise.resolve()
      expect(manager.getAlert(alert.id)?.stale).to.equal(true)

      await raiseFromDelta()

      const recovered = manager.getAlert(alert.id)
      expect(recovered?.stale).to.equal(false)
      expect(recovered?.sourceOnline).to.equal(true)
    })

    it('never marks a REST or plugin alert stale', async () => {
      // Neither surface has a re-emission convention, so silence says nothing.
      const alert = await manager.raiseAlert(raiseParams())

      fakeTimers.advanceTime(600 * 1000)
      await Promise.resolve()

      expect(manager.getAlert(alert.id)?.stale).to.equal(false)
    })

    it('follows the source that owns the alert now', async () => {
      const alert = await raiseFromDelta({ $source: 'source-a' })

      for (let i = 0; i < 3; i++) {
        fakeTimers.advanceTime(30 * 1000)
        // Source B takes the path over and keeps it alive.
        await raiseFromDelta({ $source: 'source-b' })
      }
      await Promise.resolve()

      const current = manager.getAlert(alert.id)
      expect(current?.$source).to.equal('source-b')
      expect(current?.stale).to.equal(false)
    })

    it('does not touch lifecycle state, silencing or the condition', async () => {
      const alert = await raiseFromDelta()
      await manager.silenceAlert(alert.id, 300 * 1000)
      const before = manager.getAlert(alert.id)

      fakeTimers.advanceTime(61 * 1000)
      await Promise.resolve()

      const after = manager.getAlert(alert.id)
      expect(after?.state).to.equal(before?.state)
      expect(after?.silenced).to.equal(true)
      expect(after?.condition).to.equal(true)
      expect(after?.stale).to.equal(true)
    })
  })

  describe('getAlerts', () => {
    it('should return all active alerts', async () => {
      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.1',
          $source: 'source-1',
          message: 'Alert 1'
        })
      )
      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.2',
          $source: 'source-2',
          priority: 'warning',
          message: 'Alert 2'
        })
      )

      const alerts = manager.getAlerts()

      expect(alerts).to.have.lengthOf(2)
    })

    it('should filter by state', async () => {
      const alert1 = await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.1',
          $source: 'source-1',
          message: 'Alert 1'
        })
      )
      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.2',
          $source: 'source-2',
          message: 'Alert 2'
        })
      )

      await manager.acknowledgeAlert(alert1.id)

      const unacked = manager.getAlerts({ state: 'unacknowledged' })
      const acked = manager.getAlerts({ state: 'acknowledged' })

      expect(unacked).to.have.lengthOf(1)
      expect(acked).to.have.lengthOf(1)
    })

    it('should filter by priority', async () => {
      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.1',
          $source: 'source-1',
          message: 'Alert 1'
        })
      )
      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.2',
          $source: 'source-2',
          priority: 'warning',
          message: 'Alert 2'
        })
      )

      const alarms = manager.getAlerts({ priority: 'alarm' })

      expect(alarms).to.have.lengthOf(1)
      expect(alarms[0].priority).to.equal('alarm')
    })

    it('should filter by group', async () => {
      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.1',
          $source: 'source-1',
          message: 'Alert 1',
          group: 'engine'
        })
      )
      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.2',
          $source: 'source-2',
          message: 'Alert 2',
          group: 'navigation'
        })
      )

      const engineAlerts = manager.getAlerts({ group: 'engine' })

      expect(engineAlerts).to.have.lengthOf(1)
      expect(engineAlerts[0].group).to.equal('engine')
    })

    it('should filter by stale', async () => {
      const alert1 = await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.1',
          $source: 'source-1',
          message: 'Alert 1'
        })
      )
      const alert2 = await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.2',
          $source: 'source-2',
          message: 'Alert 2'
        })
      )

      // Only alert1 follows the delta convention, so only it can go stale.
      manager.noteSourceUpdate(alert1.id)
      fakeTimers.advanceTime(61 * 1000)
      await Promise.resolve()

      expect(manager.getAlerts({ stale: true }).map((a) => a.id)).to.deep.equal(
        [alert1.id]
      )
      expect(
        manager.getAlerts({ stale: false }).map((a) => a.id)
      ).to.deep.equal([alert2.id])
    })
  })

  describe('getAlertByPath', () => {
    it('should resolve the active alert on a path', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          message: 'Oil pressure low'
        })
      )

      expect(
        manager.getAlertByPath(asPath('propulsion.port.oilPressureLow'))?.id
      ).to.equal(alert.id)
    })

    it('should return null for a path with no active alert', () => {
      expect(manager.getAlertByPath(asPath('propulsion.port.oilPressureLow')))
        .to.be.null
    })

    it('should scope the lookup by context', async () => {
      const context = 'vessels.urn:mrn:signalk:uuid:test'
      const alert = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          message: 'Oil pressure low',
          context
        })
      )

      expect(manager.getAlertByPath(asPath('propulsion.port.oilPressureLow')))
        .to.be.null
      expect(
        manager.getAlertByPath(
          asPath('propulsion.port.oilPressureLow'),
          asContext(context)
        )?.id
      ).to.equal(alert.id)
    })

    it('should not let a path containing a separator collide with a context-scoped key', async () => {
      const scoped = await manager.raiseAlert(
        raiseParams({
          path: 'oilPressureLow',
          context: 'vessels.self',
          message: 'Scoped'
        })
      )
      const literal = await manager.raiseAlert(
        raiseParams({
          path: 'vessels.self::oilPressureLow',
          message: 'Literal'
        })
      )

      expect(literal.id).to.not.equal(scoped.id)
      expect(manager.getAlerts()).to.have.lengthOf(2)
      expect(
        manager.getAlertByPath(asPath('vessels.self::oilPressureLow'))?.id
      ).to.equal(literal.id)
      expect(
        manager.getAlertByPath(
          asPath('oilPressureLow'),
          asContext('vessels.self')
        )?.id
      ).to.equal(scoped.id)
    })

    it('should treat an empty context as no context', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          message: 'Oil pressure low',
          context: ''
        })
      )

      expect(alert.context).to.be.undefined
      expect(
        manager.getAlertByPath(asPath('propulsion.port.oilPressureLow'))?.id
      ).to.equal(alert.id)

      // The empty context keys the index the same way an absent one does, so
      // neither a repeat empty-context raise nor a context-less one duplicates.
      const reraisedEmpty = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          message: 'Oil pressure low',
          context: ''
        })
      )
      expect(reraisedEmpty.id).to.equal(alert.id)

      const reraisedWithout = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          message: 'Oil pressure low'
        })
      )
      expect(reraisedWithout.id).to.equal(alert.id)
      expect(manager.getAlerts()).to.have.lengthOf(1)
    })

    it('should return null once the alert is cleared', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          priority: 'caution',
          message: 'Oil pressure low'
        })
      )

      await manager.clearCondition(alert.id)

      expect(manager.getAlertByPath(asPath('propulsion.port.oilPressureLow')))
        .to.be.null
    })

    it('should resolve alerts restored from the store', async () => {
      const store = new MockAlertStore()
      store.prePopulate([
        storedAlert({
          id: 'restored-1',
          path: 'propulsion.port.oilPressureLow',
          message: 'Oil pressure low'
        })
      ])

      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)
      manager.on('alert', (event: AlertEvent) => events.push(event))
      await manager.loadFromStore()

      expect(
        manager.getAlertByPath(asPath('propulsion.port.oilPressureLow'))?.id
      ).to.equal('restored-1')
    })
  })

  describe('duplicate handling', () => {
    it('should update existing alert with same path', async () => {
      const alert1 = await manager.raiseAlert(
        raiseParams({ priority: 'warning', data: { value: 1 } })
      )

      const alert2 = await manager.raiseAlert(
        raiseParams({ priority: 'warning', data: { value: 2 } })
      )

      // Same alert ID - updated, not duplicated
      expect(alert2.id).to.equal(alert1.id)
      expect(alert2.data).to.deep.equal({ value: 2 })
      expect(manager.getAlerts()).to.have.lengthOf(1)
    })

    it('should create separate alerts for different paths', async () => {
      await manager.raiseAlert(
        raiseParams({ path: 'test.alert.msg1', message: 'Alert 1' })
      )

      await manager.raiseAlert(
        raiseParams({ path: 'test.alert.msg2', message: 'Alert 2' })
      )

      expect(manager.getAlerts()).to.have.lengthOf(2)
    })

    it('should emit alert-updated event for duplicate', async () => {
      await manager.raiseAlert(raiseParams({ priority: 'warning' }))
      events = []

      await manager.raiseAlert(raiseParams({ priority: 'warning' }))

      expect(events).to.have.lengthOf(1)
      expect(events[0].type).to.equal('updated')
    })

    it('should dedup by path regardless of message', async () => {
      const alert1 = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.main.coolantTemperature',
          priority: 'warning',
          message: 'Coolant temp high'
        })
      )

      const alert2 = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.main.coolantTemperature',
          priority: 'warning',
          message: 'Coolant temp very high'
        })
      )

      expect(alert2.id).to.equal(alert1.id)
      expect(alert2.message).to.equal('Coolant temp very high')
      expect(manager.getAlerts()).to.have.lengthOf(1)
    })

    it('should dedup by path across different sources', async () => {
      const alert1 = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.main.coolantTemperature',
          $source: 'source-A',
          priority: 'warning',
          message: 'From source A'
        })
      )

      const alert2 = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.main.coolantTemperature',
          $source: 'source-B',
          message: 'From source B'
        })
      )

      expect(alert2.id).to.equal(alert1.id)
      expect(manager.getAlerts()).to.have.lengthOf(1)
    })

    it('should update message on re-raise', async () => {
      await manager.raiseAlert(
        raiseParams({
          path: 'engine.overheating',
          priority: 'warning',
          message: 'Temperature 85°C'
        })
      )

      const updated = await manager.raiseAlert(
        raiseParams({
          path: 'engine.overheating',
          priority: 'warning',
          message: 'Temperature 92°C'
        })
      )

      expect(updated.message).to.equal('Temperature 92°C')
      expect(manager.getAlert(updated.id)?.message).to.equal('Temperature 92°C')
    })

    it('should update group on re-raise', async () => {
      const first = await manager.raiseAlert(raiseParams({ group: 'engine' }))

      const updated = await manager.raiseAlert(
        raiseParams({ group: 'navigation' })
      )

      expect(updated.id).to.equal(first.id)
      expect(updated.group).to.equal('navigation')
      expect(manager.getAlert(first.id)?.group).to.equal('navigation')
    })

    it('should update latching on re-raise', async () => {
      const first = await manager.raiseAlert(raiseParams({ latching: false }))

      const updated = await manager.raiseAlert(raiseParams({ latching: true }))

      expect(updated.id).to.equal(first.id)
      expect(updated.latching).to.equal(true)
      expect(manager.getAlert(first.id)?.latching).to.equal(true)
    })

    it('should keep data when a re-raise omits it', async () => {
      const first = await manager.raiseAlert(
        raiseParams({ data: { temperature: 95 } })
      )

      const updated = await manager.raiseAlert(raiseParams())

      expect(updated.id).to.equal(first.id)
      expect(updated.data).to.deep.equal({ temperature: 95 })
    })
  })

  describe('references', () => {
    it('should store every reference given at raise', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          references: [
            'propulsion.port.oilPressure',
            'propulsion.port.revolutions'
          ],
          message: 'Oil pressure low'
        })
      )

      expect(alert.references).to.deep.equal([
        'propulsion.port.oilPressure',
        'propulsion.port.revolutions'
      ])
    })

    it('should leave references absent when none are given', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          message: 'Oil pressure low'
        })
      )

      expect(alert.references).to.be.undefined
    })

    it('should not use references for dedup', async () => {
      const first = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          references: ['propulsion.port.oilPressure'],
          message: 'Oil pressure low'
        })
      )

      const second = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          references: ['propulsion.port.oilPressure.secondary'],
          message: 'Oil pressure low'
        })
      )

      expect(second.id).to.equal(first.id)
      expect(manager.getAlerts()).to.have.lengthOf(1)
      expect(second.references).to.deep.equal([
        'propulsion.port.oilPressure.secondary'
      ])
    })

    it('should keep alerts on distinct paths that share a reference separate', async () => {
      const low = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          references: ['propulsion.port.oilPressure'],
          priority: 'warning',
          message: 'Oil pressure low'
        })
      )

      const critical = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureCritical',
          references: ['propulsion.port.oilPressure'],
          message: 'Oil pressure critical'
        })
      )

      expect(critical.id).to.not.equal(low.id)
      expect(manager.getAlerts()).to.have.lengthOf(2)
    })

    it('should keep references when a re-raise omits them', async () => {
      await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          references: ['propulsion.port.oilPressure'],
          message: 'Oil pressure low'
        })
      )

      const reraised = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          message: 'Oil pressure low'
        })
      )

      expect(reraised.references).to.deep.equal(['propulsion.port.oilPressure'])
    })

    it('should clear references when a re-raise sends an empty list', async () => {
      await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          references: ['propulsion.port.oilPressure'],
          message: 'Oil pressure low'
        })
      )

      const reraised = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          references: [],
          message: 'Oil pressure low'
        })
      )

      expect(reraised.references).to.deep.equal([])
    })
  })

  describe('multiple sources on one path', () => {
    it('should keep one alert and hand ownership to the later source', async () => {
      const first = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          $source: 'source-A',
          message: 'From A'
        })
      )

      const second = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          $source: 'source-B',
          message: 'From B'
        })
      )

      expect(second.id).to.equal(first.id)
      expect(manager.getAlerts()).to.have.lengthOf(1)
      expect(second.$source).to.equal('source-B')
    })

    it('should record the ownership change in history', async () => {
      const store = new MockAlertStore()
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)
      manager.on('alert', (event: AlertEvent) => events.push(event))

      await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          $source: 'source-A',
          message: 'From A'
        })
      )
      await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          $source: 'source-B',
          message: 'From B'
        })
      )

      const raises = store.entriesOfType('raise')
      expect(raises).to.have.lengthOf(2)
      expect(raises[1].path).to.equal('propulsion.port.oilPressureLow')
      expect(raises[1].$source).to.equal('source-B')
      expect(raises[1].priority).to.equal('alarm')
      expect(raises[1].message).to.equal('From B')
      expect(raises[1].details).to.deep.equal({ previousSource: 'source-A' })
    })

    it('should not record history when the same source re-raises', async () => {
      const store = new MockAlertStore()
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)
      manager.on('alert', (event: AlertEvent) => events.push(event))

      await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          $source: 'source-A',
          message: 'From A'
        })
      )
      await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          $source: 'source-A',
          message: 'From A again'
        })
      )

      expect(store.entriesOfType('raise')).to.have.lengthOf(1)
    })
  })

  describe('persistence', () => {
    let store: MockAlertStore

    beforeEach(() => {
      store = new MockAlertStore()
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)
      manager.on('alert', (event: AlertEvent) => events.push(event))
    })

    it('should save alert to store on raise', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      expect(store.getStoredAlert(alert.id)).to.not.be.undefined
      expect(store.getStoredAlert(alert.id)?.message).to.equal('Test alert')
    })

    it('should update store on acknowledge', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.acknowledgeAlert(alert.id)

      expect(store.getStoredAlert(alert.id)?.state).to.equal('acknowledged')
    })

    it('should delete from store when alert is cleared', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.acknowledgeAlert(alert.id)
      await manager.clearCondition(alert.id)

      expect(store.getStoredAlert(alert.id)).to.be.undefined
    })

    it('should not report a degraded store before a write fails', async () => {
      await manager.raiseAlert(raiseParams())

      expect(manager.isStoreDegraded()).to.equal(false)
    })

    it('should raise, announce and escalate even when the store write fails', async () => {
      manager.stop()
      manager = new AlertManager(
        defaultConfig,
        fakeTimers,
        new FailingAlertStore()
      )
      manager.on('alert', (event: AlertEvent) => events.push(event))
      events = []

      const { result: alert, errors } = await captureConsole(() =>
        manager.raiseAlert(
          raiseParams({ priority: 'warning', message: 'Test warning' })
        )
      )

      expect(alert.message).to.equal('Test warning')
      expect(manager.getAlert(alert.id)?.message).to.equal('Test warning')
      expect(events.filter((e) => e.type === 'raised')).to.have.lengthOf(1)
      expect(fakeTimers.getPendingCount()).to.equal(1)
      expect(manager.isStoreDegraded()).to.equal(true)
      expect(errors).to.have.lengthOf(1)
    })

    it('should emit storeError describing the failed write', async () => {
      manager.stop()
      manager = new AlertManager(
        defaultConfig,
        fakeTimers,
        new FailingAlertStore()
      )
      const failures: StoreFailureEvent[] = []
      manager.on('storeError', (event: StoreFailureEvent) =>
        failures.push(event)
      )

      const { result: alert } = await captureConsole(() =>
        manager.raiseAlert(raiseParams())
      )

      expect(failures).to.have.lengthOf(1)
      expect(failures[0].operation).to.equal('commit')
      expect(failures[0].alertId).to.equal(alert.id)
      expect(failures[0].error.message).to.equal('SQLite disk I/O error')
    })

    it('should work without store (in-memory only)', async () => {
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers) // No store
      manager.on('alert', (event: AlertEvent) => events.push(event))

      const alert = await manager.raiseAlert(raiseParams())

      const kept = manager.getAlert(alert.id)
      expect(kept).to.not.be.null
      expect(kept?.message).to.equal('Test alert')
    })
  })

  describe('store recovery', () => {
    let store: ScriptedAlertStore
    let failures: StoreFailureEvent[]

    beforeEach(() => {
      store = new ScriptedAlertStore()
      failures = []
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)
      manager.on('alert', (event: AlertEvent) => events.push(event))
      manager.on('storeError', (event: StoreFailureEvent) =>
        failures.push(event)
      )
    })

    it('should re-commit the active set once a write succeeds again', async () => {
      // The first write fails, so its alert lives only in memory. The next
      // write that lands has to carry it into the store with it.
      store.failAttempt = (attempt) => attempt === 1

      const { result: lost } = await captureConsole(() =>
        manager.raiseAlert(
          raiseParams({ path: 'test.alert.1', message: 'Lost write' })
        )
      )

      expect(manager.isStoreDegraded()).to.equal(true)
      expect(store.getStoredAlert(lost.id)).to.be.undefined
      expect(failures.map((f) => f.operation)).to.deep.equal(['commit'])

      const written = await manager.raiseAlert(
        raiseParams({ path: 'test.alert.2', message: 'Good write' })
      )

      expect(store.getStoredAlertCount()).to.equal(2)
      expect(store.getStoredAlert(lost.id)).to.deep.equal(
        manager.getAlert(lost.id)
      )
      expect(store.getStoredAlert(written.id)).to.deep.equal(
        manager.getAlert(written.id)
      )
      expect(manager.isStoreDegraded()).to.equal(false)
    })

    it('should re-commit a removal the store rejected', async () => {
      const removed = await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.1',
          priority: 'caution',
          message: 'Goes away'
        })
      )
      const kept = await manager.raiseAlert(
        raiseParams({ path: 'test.alert.2', message: 'Stays' })
      )
      expect(store.getStoredAlertCount()).to.equal(2)

      // Only the removal fails. Its alert leaves the registry, so no later
      // transition names it again and the row outlives the alert unless the
      // resync repeats the removal.
      store.failAttempt = (attempt) => attempt === 3
      const { result } = await captureConsole(() =>
        manager.clearCondition(removed.id)
      )

      expect(result.cleared).to.equal(true)
      expect(manager.getAlert(removed.id)).to.be.null
      expect(store.getStoredAlert(removed.id)?.message).to.equal('Goes away')
      expect(manager.isStoreDegraded()).to.equal(true)

      await manager.acknowledgeAlert(kept.id)

      expect(store.getStoredAlert(removed.id)).to.be.undefined
      expect(store.getStoredAlertCount()).to.equal(1)
      expect(store.getStoredAlert(kept.id)?.state).to.equal('acknowledged')
      expect(manager.isStoreDegraded()).to.equal(false)
    })

    it('stays degraded when a write fails while the resync sweep runs', async () => {
      const racing = new RacingAlertStore()
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, racing)

      racing.failWhen = (transition) =>
        transition.history.some((entry) => entry.message === 'Lost write')
      const lost = await captureConsole(() =>
        manager.raiseAlert(
          raiseParams({ path: 'test.alert.1', message: 'Lost write' })
        )
      )
      expect(manager.isStoreDegraded()).to.equal(true)

      // The sweep is about to succeed. A lifecycle write fails while it is in
      // flight, so the sweep must not report the store healthy on the strength
      // of its own writes alone.
      racing.failWhen = (transition) =>
        transition.history.some((entry) => entry.eventType === 'acknowledge')
      racing.duringSweep = async () => {
        await captureConsole(() =>
          manager.acknowledgeAlert(lost.result.id, 'operator')
        )
      }

      await manager.raiseAlert(
        raiseParams({ path: 'test.alert.2', message: 'Good write' })
      )
      // The sweep is detached, so let it run to its end before asking.
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(manager.isStoreDegraded()).to.equal(true)
    })

    it('abandons the resync sweep when the manager stops under it', async () => {
      const racing = new RacingAlertStore()
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, racing)
      const stopped: StoreFailureEvent[] = []
      manager.on('storeError', (event: StoreFailureEvent) =>
        stopped.push(event)
      )

      racing.failWhen = (transition) =>
        transition.history.some((entry) => entry.message === 'Lost write')
      await captureConsole(() =>
        manager.raiseAlert(
          raiseParams({ path: 'test.alert.1', message: 'Lost write' })
        )
      )
      expect(manager.isStoreDegraded()).to.equal(true)

      // A stop closes the store under the detached sweep, so every write it
      // makes afterwards fails. Standing in for that: the store rejects
      // everything from the moment the manager stops.
      racing.duringSweep = () => {
        manager.stop()
        racing.failWhen = () => true
        return Promise.resolve()
      }
      stopped.length = 0

      await manager.raiseAlert(
        raiseParams({ path: 'test.alert.2', message: 'Good write' })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(stopped.map((f) => f.operation)).to.deep.equal([])
      expect(manager.isStoreDegraded()).to.equal(true)
    })

    it('should report a failed resync and stay degraded', async () => {
      // The write that triggers the resync lands; the resync's own re-commit
      // does not.
      store.failAttempt = (attempt) => attempt === 1 || attempt >= 3

      const { result: lost } = await captureConsole(() =>
        manager.raiseAlert(
          raiseParams({ path: 'test.alert.1', message: 'Lost write' })
        )
      )
      const { result: written } = await captureConsole(() =>
        manager.raiseAlert(
          raiseParams({ path: 'test.alert.2', message: 'Good write' })
        )
      )

      expect(store.getStoredAlert(written.id)?.message).to.equal('Good write')
      expect(store.getStoredAlert(lost.id)).to.be.undefined
      expect(manager.isStoreDegraded()).to.equal(true)

      expect(failures.map((f) => f.operation)).to.deep.equal([
        'commit',
        'resync'
      ])
      expect(failures[1].alertId).to.be.null
      expect(failures[1].error.message).to.equal('SQLite disk I/O error')
    })
  })

  describe('transition commits', () => {
    let store: MockAlertStore

    beforeEach(() => {
      store = new MockAlertStore()
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)
      manager.on('alert', (event: AlertEvent) => events.push(event))
    })

    it('should commit a raise as one transition holding the alert and its raise entry', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      expect(store.commitCount).to.equal(1)
      expect(store.getStoredAlert(alert.id)).to.deep.equal(alert)
      expect(store.history).to.have.lengthOf(1)
      expect(store.history[0].eventType).to.equal('raise')
      expect(store.history[0].alertId).to.equal(alert.id)
      expect(store.history[0].newState).to.equal('unacknowledged')
    })

    it('should commit a clear as one transition that drops the alert and holds its clear entry', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'caution' })
      )
      store.resetHistory()
      const commitsAfterRaise = store.commitCount

      const result = await manager.clearCondition(alert.id)

      expect(result.cleared).to.equal(true)
      expect(store.commitCount).to.equal(commitsAfterRaise + 1)
      // The mock only drops a row for a transition whose alert is null.
      expect(store.getStoredAlert(alert.id)).to.be.undefined
      expect(store.getStoredAlertCount()).to.equal(0)
      expect(store.history).to.have.lengthOf(1)
      expect(store.history[0].eventType).to.equal('clear')
      expect(store.history[0].newState).to.equal('normal')
    })

    it('should commit an escalating owner change as one transition carrying both entries', async () => {
      await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          $source: 'source-A',
          priority: 'warning',
          message: 'From A'
        })
      )
      store.resetHistory()
      const commitsAfterRaise = store.commitCount

      const updated = await manager.raiseAlert(
        raiseParams({
          path: 'propulsion.port.oilPressureLow',
          $source: 'source-B',
          priority: 'alarm',
          message: 'From B'
        })
      )

      expect(store.commitCount).to.equal(commitsAfterRaise + 1)
      expect(store.eventTypes()).to.deep.equal(['escalate', 'raise'])
      expect(store.history[0].previousPriority).to.equal('warning')
      expect(store.history[0].newPriority).to.equal('alarm')
      expect(store.history[1].$source).to.equal('source-B')
      expect(store.history[1].details).to.deep.equal({
        previousSource: 'source-A'
      })
      expect(store.getStoredAlert(updated.id)).to.deep.equal(updated)
    })

    it('should commit a stale mark as a transition with no audit entries', async () => {
      const alert = await manager.raiseAlert(raiseParams())
      manager.noteSourceUpdate(alert.id)
      store.resetHistory()
      const commitsAfterRaise = store.commitCount

      fakeTimers.advanceTime(61 * 1000)
      await Promise.resolve()

      expect(store.commitCount).to.equal(commitsAfterRaise + 1)
      // Staleness is a fact about the source, not a lifecycle event.
      expect(store.history).to.have.lengthOf(0)
      expect(store.getStoredAlert(alert.id)?.stale).to.equal(true)
    })
  })

  describe('stop', () => {
    it('should cancel all escalation timers on stop', async () => {
      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.1',
          $source: 'source-1',
          priority: 'warning',
          message: 'Warning 1'
        })
      )
      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.2',
          $source: 'source-2',
          priority: 'warning',
          message: 'Warning 2'
        })
      )

      expect(fakeTimers.getPendingCount()).to.equal(2)

      manager.stop()

      expect(fakeTimers.getPendingCount()).to.equal(0)
    })

    it('should cancel silence expiration timers on stop', async () => {
      const alert = await manager.raiseAlert(raiseParams())
      await manager.silenceAlert(alert.id, 5000)

      expect(fakeTimers.getPendingCount()).to.equal(1)

      manager.stop()

      expect(fakeTimers.getPendingCount()).to.equal(0)
    })

    it('should not emit events after stop', async () => {
      await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )
      events = []

      manager.stop()
      fakeTimers.advanceTime(300 * 1000)

      expect(events).to.have.lengthOf(0)
    })
  })

  describe('silenceAll', () => {
    it('should skip an alert acknowledged while an earlier write awaited', async () => {
      // silenceAll snapshots its candidates, then awaits a store write per
      // alert. An acknowledge landing in that window must not be overwritten by
      // the stale snapshot.
      const store = new HookedAlertStore()
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)
      events = []
      manager.on('alert', (event: AlertEvent) => events.push(event))

      const first = await manager.raiseAlert(
        raiseParams({ path: 'test.alert.1', message: 'Alert 1' })
      )
      const second = await manager.raiseAlert(
        raiseParams({ path: 'test.alert.2', message: 'Alert 2' })
      )

      store.onCommit = async () => {
        await manager.acknowledgeAlert(second.id, 'operator')
      }

      await manager.silenceAll()

      expect(manager.getAlert(first.id)?.silenced).to.equal(true)
      const secondAfter = manager.getAlert(second.id)
      expect(secondAfter?.state).to.equal('acknowledged')
      expect(secondAfter?.acknowledgedBy).to.equal('operator')
      expect(secondAfter?.silenced).to.equal(false)
    })

    it('should silence all unacknowledged alerts', async () => {
      const alert1 = await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.1',
          $source: 'source-1',
          message: 'Alert 1'
        })
      )
      const alert2 = await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.2',
          $source: 'source-2',
          message: 'Alert 2'
        })
      )

      await manager.silenceAll()

      expect(manager.getAlert(alert1.id)?.silenced).to.equal(true)
      expect(manager.getAlert(alert2.id)?.silenced).to.equal(true)
    })

    it('should emit silenced events for each alert', async () => {
      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.1',
          $source: 'source-1',
          message: 'Alert 1'
        })
      )
      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.2',
          $source: 'source-2',
          message: 'Alert 2'
        })
      )
      events = []

      await manager.silenceAll()

      const silencedEvents = events.filter((e) => e.type === 'silenced')
      expect(silencedEvents).to.have.lengthOf(2)
    })

    it('should not silence acknowledged alerts', async () => {
      const acknowledged = await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.1',
          $source: 'source-1',
          message: 'Alert 1'
        })
      )
      const unacknowledged = await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.2',
          $source: 'source-2',
          message: 'Alert 2'
        })
      )
      await manager.acknowledgeAlert(acknowledged.id)
      events = []

      await manager.silenceAll()

      expect(manager.getAlert(acknowledged.id)?.silenced).to.equal(false)
      expect(manager.getAlert(unacknowledged.id)?.silenced).to.equal(true)
      expect(events.filter((e) => e.type === 'silenced')).to.have.lengthOf(1)
    })

    it('should not silence already silenced alerts', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.silenceAlert(alert.id)
      events = []

      await manager.silenceAll()

      expect(events.filter((e) => e.type === 'silenced')).to.have.lengthOf(0)
    })
  })

  describe('getActiveAlertCount', () => {
    it('should return count of active alerts', async () => {
      expect(manager.getActiveAlertCount()).to.equal(0)

      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.1',
          $source: 'source-1',
          message: 'Alert 1'
        })
      )

      expect(manager.getActiveAlertCount()).to.equal(1)

      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.2',
          $source: 'source-2',
          message: 'Alert 2'
        })
      )

      expect(manager.getActiveAlertCount()).to.equal(2)
    })
  })

  describe('getUnacknowledgedCount', () => {
    it('should return count of unacknowledged alerts', async () => {
      const alert1 = await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.1',
          $source: 'source-1',
          message: 'Alert 1'
        })
      )
      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.2',
          $source: 'source-2',
          message: 'Alert 2'
        })
      )

      expect(manager.getUnacknowledgedCount()).to.equal(2)

      await manager.acknowledgeAlert(alert1.id)

      expect(manager.getUnacknowledgedCount()).to.equal(1)
    })
  })

  describe('unsilenceAlert', () => {
    it('should remove silenced flag from alert', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.silenceAlert(alert.id)
      expect(manager.getAlert(alert.id)?.silenced).to.equal(true)

      const unsilenced = await manager.unsilenceAlert(alert.id)

      expect(unsilenced.silenced).to.equal(false)
      expect(unsilenced.silencedUntil).to.be.undefined
    })

    it('should emit unsilenced event', async () => {
      const alert = await manager.raiseAlert(raiseParams())
      await manager.silenceAlert(alert.id)
      events = []

      await manager.unsilenceAlert(alert.id)

      expect(events).to.have.lengthOf(1)
      expect(events[0].type).to.equal('unsilenced')
    })

    it('should throw for non-existent alert', async () => {
      await expectRejection(
        manager.unsilenceAlert('non-existent'),
        'Alert not found'
      )
    })
  })

  describe('silence expiration', () => {
    it('should automatically unsilence alert after duration', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.silenceAlert(alert.id, 5000) // 5 second silence
      expect(manager.getAlert(alert.id)?.silenced).to.equal(true)

      fakeTimers.advanceTime(5000)

      expect(manager.getAlert(alert.id)?.silenced).to.equal(false)
    })

    it('should emit unsilenced event on expiration', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.silenceAlert(alert.id, 5000)
      events = []

      fakeTimers.advanceTime(5000)

      expect(events).to.have.lengthOf(1)
      expect(events[0].type).to.equal('unsilenced')
    })

    it('should cancel expiration timer when manually unsilenced', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.silenceAlert(alert.id, 5000)
      await manager.unsilenceAlert(alert.id)
      events = []

      fakeTimers.advanceTime(5000)

      // Should not emit another unsilenced event
      expect(events).to.have.lengthOf(0)
    })

    it('should cancel expiration timer when alert is cleared', async () => {
      // Caution auto-clears, so the condition going away removes the alert
      // outright. An acknowledge first would unsilence it and the removal
      // would never have a silence timer left to cancel.
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'caution' })
      )

      await manager.silenceAlert(alert.id, 5000)
      expect(fakeTimers.getPendingCount()).to.equal(1)

      const result = await manager.clearCondition(alert.id)

      expect(result.cleared).to.equal(true)
      expect(manager.getAlert(alert.id)).to.be.null
      expect(fakeTimers.getPendingCount()).to.equal(0)
    })

    it('should cancel silence timer and clear flags on acknowledge', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.silenceAlert(alert.id, 5000)
      expect(manager.getAlert(alert.id)?.silenced).to.equal(true)

      await manager.acknowledgeAlert(alert.id)

      // Silence flags should be cleared immediately on acknowledge
      const acknowledged = manager.getAlert(alert.id)
      expect(acknowledged?.silenced).to.equal(false)
      expect(acknowledged?.silencedUntil).to.be.undefined

      // Advancing past silence duration should not emit unsilenced event
      events = []
      fakeTimers.advanceTime(5000)
      expect(events.filter((e) => e.type === 'unsilenced')).to.have.lengthOf(0)
    })

    it('should clear silenced rtn-unacknowledged alert without emitting unsilenced event', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      // Silence, then clear condition -> rtn-unacknowledged (still silenced)
      await manager.silenceAlert(alert.id, 10000)
      await manager.clearCondition(alert.id)
      expect(manager.getAlert(alert.id)?.state).to.equal('rtn-unacknowledged')
      expect(manager.getAlert(alert.id)?.silenced).to.equal(true)
      const clearedAt = manager.getAlert(alert.id)?.clearedAt

      // Acknowledge clears the alert entirely (rtn-unacknowledged -> cleared)
      events = []
      await manager.acknowledgeAlert(alert.id)

      // Should emit 'cleared' but NOT 'unsilenced'
      const clearedEvents = events.filter((e) => e.type === 'cleared')
      expect(clearedEvents).to.have.lengthOf(1)
      expect(clearedEvents[0].alert.state).to.equal('normal')
      expect(clearedEvents[0].alert.condition).to.equal(false)
      expect(clearedEvents[0].alert.clearedAt).to.equal(clearedAt)
      expect(events.filter((e) => e.type === 'unsilenced')).to.have.lengthOf(0)
      expect(manager.getAlert(alert.id)).to.be.null

      // Silence timer should not fire
      fakeTimers.advanceTime(10000)
      expect(events.filter((e) => e.type === 'unsilenced')).to.have.lengthOf(0)
    })
  })

  describe('priority escalation on update', () => {
    it('should allow source to escalate priority', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning' })
      )

      const updated = await manager.raiseAlert(raiseParams())

      expect(updated.id).to.equal(alert.id)
      expect(updated.priority).to.equal('alarm')
    })

    it('should not allow priority reduction', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      const updated = await manager.raiseAlert(
        raiseParams({ priority: 'warning' })
      )

      expect(updated.id).to.equal(alert.id)
      expect(updated.priority).to.equal('alarm') // Stays at alarm
    })

    it('should cancel escalation timer when priority is escalated by source', async () => {
      await manager.raiseAlert(raiseParams({ priority: 'warning' }))

      expect(fakeTimers.getPendingCount()).to.equal(1)

      await manager.raiseAlert(raiseParams())

      // Escalation timer should be cancelled since priority was manually escalated
      expect(fakeTimers.getPendingCount()).to.equal(0)
    })

    it('should start escalation timer when a re-raise promotes caution to warning', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'caution' })
      )

      // Caution does not escalate
      expect(fakeTimers.getPendingCount()).to.equal(0)

      const updated = await manager.raiseAlert(
        raiseParams({ priority: 'warning' })
      )

      expect(updated.id).to.equal(alert.id)
      expect(updated.priority).to.equal('warning')
      expect(fakeTimers.getPendingCount()).to.equal(1)

      fakeTimers.advanceTime(300 * 1000)
      expect(manager.getAlert(alert.id)?.priority).to.equal('alarm')
    })
  })

  describe('explicit escalateAlert', () => {
    it('should escalate from warning to alarm', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning' })
      )

      const updated = await manager.escalateAlert(alert.id, 'alarm')
      expect(updated.id).to.equal(alert.id)
      expect(updated.priority).to.equal('alarm')
    })

    it('should reject escalation to same priority', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await expectRejection(
        manager.escalateAlert(alert.id, 'alarm'),
        'Cannot escalate'
      )
    })

    it('should reject de-escalation', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await expectRejection(
        manager.escalateAlert(alert.id, 'warning'),
        'Cannot escalate'
      )
    })

    it('should throw for non-existent alert', async () => {
      await expectRejection(
        manager.escalateAlert('non-existent', 'alarm'),
        'Alert not found'
      )
    })

    it('should cancel escalation timer on explicit escalation', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning' })
      )

      expect(fakeTimers.getPendingCount()).to.equal(1)

      await manager.escalateAlert(alert.id, 'alarm')

      expect(fakeTimers.getPendingCount()).to.equal(0)
    })

    it('should emit escalated event', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning' })
      )
      events = []

      await manager.escalateAlert(alert.id, 'alarm')

      expect(events).to.have.lengthOf(1)
      expect(events[0].type).to.equal('escalated')
      expect(events[0].alert.priority).to.equal('alarm')
    })

    it('should reactivate acknowledged alert on escalation', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning' })
      )

      await manager.acknowledgeAlert(alert.id)
      const acked = manager.getAlert(alert.id)
      expect(acked?.state).to.equal('acknowledged')

      const updated = await manager.escalateAlert(alert.id, 'alarm')
      expect(updated.state).to.equal('unacknowledged')
      expect(updated.priority).to.equal('alarm')
    })

    it('should clear silence when escalating a silenced alert', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning' })
      )

      await manager.silenceAlert(alert.id)
      const silenced = manager.getAlert(alert.id)
      expect(silenced?.silenced).to.equal(true)

      const updated = await manager.escalateAlert(alert.id, 'alarm')
      expect(updated.silenced).to.equal(false)
      expect(updated.silencedUntil).to.be.undefined
      expect(updated.priority).to.equal('alarm')
    })

    it('advances stateChangedAt when escalating an unacknowledged alert', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )
      const before = alert.stateChangedAt
      // Guarantee the wall clock advances past the raise timestamp.
      await new Promise<void>((resolve) => setTimeout(resolve, 5))

      const updated = await manager.escalateAlert(alert.id, 'alarm')

      expect(updated.state).to.equal('unacknowledged')
      expect(updated.priority).to.equal('alarm')
      expect(updated.stateChangedAt > before).to.equal(true)
    })

    it('should start escalation timer when escalating caution to warning', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'caution' })
      )

      // Caution does not start an escalation timer
      expect(fakeTimers.getPendingCount()).to.equal(0)

      await manager.escalateAlert(alert.id, 'warning')

      // Warning should start an escalation timer
      expect(fakeTimers.getPendingCount()).to.equal(1)

      // Advance time to trigger escalation to alarm
      fakeTimers.advanceTime(300 * 1000)
      expect(manager.getAlert(alert.id)?.priority).to.equal('alarm')
    })
  })

  describe('escalation persistence', () => {
    let store: MockAlertStore

    beforeEach(() => {
      store = new MockAlertStore()
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)
      manager.on('alert', (event: AlertEvent) => events.push(event))
    })

    it('should persist escalation to store', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )

      fakeTimers.advanceTime(300 * 1000)

      // Give async store.update a chance to complete
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(store.getStoredAlert(alert.id)?.priority).to.equal('alarm')
    })
  })

  describe('edge cases', () => {
    it('should not raise alerts after stop', async () => {
      manager.stop()

      const alert = await manager.raiseAlert(raiseParams())

      // Alert is still created in memory but no events are emitted
      expect(alert).to.not.be.undefined
      expect(events.filter((e) => e.type === 'raised')).to.have.lengthOf(0)
    })

    it('should handle silencing an already silenced alert', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.silenceAlert(alert.id, 10000)
      const firstSilencedUntil = manager.getAlert(alert.id)?.silencedUntil

      await manager.silenceAlert(alert.id, 20000)
      const secondSilencedUntil = manager.getAlert(alert.id)?.silencedUntil

      // Second silence should update the silencedUntil
      expect(secondSilencedUntil).to.not.equal(firstSilencedUntil)
    })
  })

  describe('loadFromStore', () => {
    const TIMEOUT_MS = 300 * 1000
    // A load that succeeds arms the daily retention prune, so every pending
    // count below is the timers under test plus that one.
    const RETENTION_TIMERS = 1
    let store: MockAlertStore

    beforeEach(() => {
      store = new MockAlertStore()
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)
      manager.on('alert', (event: AlertEvent) => events.push(event))
    })

    it('should load alerts from store into memory', async () => {
      store.prePopulate([
        storedAlert({
          id: 'stored-1',
          path: 'stored.alert.1',
          message: 'Alert 1'
        }),
        storedAlert({
          id: 'stored-2',
          path: 'stored.alert.2',
          message: 'Alert 2'
        })
      ])

      await manager.loadFromStore()

      expect(manager.getActiveAlertCount()).to.equal(2)
      expect(manager.getAlert('stored-1')?.message).to.equal('Alert 1')
      expect(manager.getAlert('stored-2')?.message).to.equal('Alert 2')
    })

    it('should rebuild alert index for duplicate detection', async () => {
      store.prePopulate([
        storedAlert({
          id: 'stored-1',
          $source: 'test-source',
          message: 'Test message'
        })
      ])

      await manager.loadFromStore()

      // Raising an alert with the same path should update the existing one
      const updated = await manager.raiseAlert(
        raiseParams({ path: 'stored.alert', message: 'Test message' })
      )

      // Should be the same alert, not a new one
      expect(updated.id).to.equal('stored-1')
      expect(manager.getActiveAlertCount()).to.equal(1)
    })

    it('should restart escalation timers for unacknowledged warnings', async () => {
      store.prePopulate([
        storedAlert({
          id: 'warning-1',
          priority: 'warning',
          state: 'unacknowledged'
        })
      ])

      await manager.loadFromStore()

      // Should have started an escalation timer
      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS + 1)

      // Advance time to trigger escalation
      fakeTimers.advanceTime(TIMEOUT_MS)

      // Should have escalated to alarm
      expect(manager.getAlert('warning-1')?.priority).to.equal('alarm')
    })

    it('should account for elapsed time when restarting escalation timers', async () => {
      // A warning that last changed state 250 seconds ago (50 seconds
      // remaining)
      const pastTimestamp = new Date(Date.now() - 250 * 1000).toISOString()
      store.prePopulate([
        storedAlert({
          id: 'old-warning',
          priority: 'warning',
          state: 'unacknowledged',
          raisedAt: pastTimestamp,
          stateChangedAt: pastTimestamp
        })
      ])

      await manager.loadFromStore()

      // Timer should be set for remaining ~50 seconds, not full 300 seconds
      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS + 1)

      // Should NOT escalate after 40 seconds (still 10 seconds remaining)
      fakeTimers.advanceTime(40 * 1000)
      expect(manager.getAlert('old-warning')?.priority).to.equal('warning')

      // Should escalate after another 20 seconds (total 60 seconds, past remaining 50)
      fakeTimers.advanceTime(20 * 1000)
      expect(manager.getAlert('old-warning')?.priority).to.equal('alarm')
    })

    it('should escalate warnings that have exceeded timeout on the next tick', async () => {
      // A warning that last changed state 400 seconds ago (already past
      // the 300s timeout)
      const oldTimestamp = new Date(Date.now() - 400 * 1000).toISOString()
      store.prePopulate([
        storedAlert({
          id: 'very-old-warning',
          priority: 'warning',
          state: 'unacknowledged',
          raisedAt: oldTimestamp,
          stateChangedAt: oldTimestamp
        })
      ])

      await manager.loadFromStore()

      // A spent window escalates through a zero-delay timer, so the restore
      // finishes before the escalation rather than inside it.
      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS + 1)
      expect(manager.getAlert('very-old-warning')?.priority).to.equal('warning')

      fakeTimers.advanceTime(0)

      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS)
      expect(manager.getAlert('very-old-warning')?.priority).to.equal('alarm')
    })

    it('should give a full window to a stateChangedAt ahead of the clock', async () => {
      // A Raspberry Pi boots before NTP steps its clock, so a stored timestamp
      // can sit in the future. That must not read as an overdue escalation.
      const futureTimestamp = new Date(Date.now() + 600 * 1000).toISOString()
      store.prePopulate([
        storedAlert({
          id: 'future-warning',
          priority: 'warning',
          state: 'unacknowledged',
          raisedAt: futureTimestamp,
          stateChangedAt: futureTimestamp
        })
      ])

      await manager.loadFromStore()

      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS + 1)
      expect(manager.getAlert('future-warning')?.priority).to.equal('warning')

      fakeTimers.advanceTime(TIMEOUT_MS - 2000)
      expect(manager.getAlert('future-warning')?.priority).to.equal('warning')

      fakeTimers.advanceTime(4000)
      expect(manager.getAlert('future-warning')?.priority).to.equal('alarm')
    })

    it('should give a full window to a malformed stateChangedAt', async () => {
      store.prePopulate([
        storedAlert({
          id: 'malformed-warning',
          priority: 'warning',
          state: 'unacknowledged',
          stateChangedAt: 'not-a-timestamp'
        })
      ])

      await manager.loadFromStore()

      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS + 1)

      fakeTimers.advanceTime(TIMEOUT_MS - 2000)
      expect(manager.getAlert('malformed-warning')?.priority).to.equal(
        'warning'
      )

      fakeTimers.advanceTime(4000)
      expect(manager.getAlert('malformed-warning')?.priority).to.equal('alarm')
    })

    it('should give a full window to an unusable configured timeout', async () => {
      // resumeEscalation must read the window the timer resolved, not the raw
      // setting: a NaN reaches setTimeout and escalates every restored warning
      // on the next tick, which is the guard's whole purpose.
      manager.stop()
      manager = await captureConsole(() => {
        const started = new AlertManager(
          {
            ...defaultConfig,
            escalation: { enabled: true, timeoutSeconds: Number.NaN }
          },
          fakeTimers,
          store
        )
        store.prePopulate([
          storedAlert({
            id: 'nan-timeout-warning',
            priority: 'warning',
            state: 'unacknowledged'
          })
        ])
        return started.loadFromStore().then(() => started)
      }).then((captured) => captured.result)

      fakeTimers.advanceTime(0)
      expect(manager.getAlert('nan-timeout-warning')?.priority).to.equal(
        'warning'
      )

      fakeTimers.advanceTime(TIMEOUT_MS)
      expect(manager.getAlert('nan-timeout-warning')?.priority).to.equal(
        'alarm'
      )
    })

    it('should not start escalation timers for caution priority', async () => {
      store.prePopulate([
        storedAlert({
          id: 'caution-1',
          priority: 'caution',
          state: 'unacknowledged'
        })
      ])

      await manager.loadFromStore()

      // Caution alerts don't escalate
      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS)
    })

    it('should not start escalation timers for rtn-unacknowledged state', async () => {
      store.prePopulate([
        storedAlert({
          id: 'rtn-warning',
          priority: 'warning',
          state: 'rtn-unacknowledged'
        })
      ])

      await manager.loadFromStore()

      // RTN alerts have cleared condition, no need to escalate
      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS)
    })

    it('should not start escalation timers for acknowledged alerts', async () => {
      store.prePopulate([
        storedAlert({
          id: 'warning-1',
          priority: 'warning',
          state: 'acknowledged'
        })
      ])

      await manager.loadFromStore()

      // Should not have started an escalation timer
      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS)
    })

    it('should not start escalation timers for a latched warning whose condition cleared', async () => {
      store.prePopulate([
        storedAlert({
          id: 'latched-warning',
          priority: 'warning',
          state: 'unacknowledged',
          condition: false,
          latching: true,
          clearedAt: new Date().toISOString()
        })
      ])

      await manager.loadFromStore()

      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS)

      fakeTimers.advanceTime(TIMEOUT_MS)
      expect(manager.getAlert('latched-warning')?.priority).to.equal('warning')
    })

    it('should escalate a restored warning after its remaining time', async () => {
      const stateChangedAt = new Date(Date.now() - 200_000).toISOString()
      store.prePopulate([
        storedAlert({
          id: 'restored-warning',
          path: 'propulsion.port.oilPressureLow',
          priority: 'warning',
          state: 'unacknowledged',
          raisedAt: stateChangedAt,
          stateChangedAt
        })
      ])

      await manager.loadFromStore()

      fakeTimers.advanceTime(TIMEOUT_MS - 200_000 - 2_000)
      expect(events.filter((e) => e.type === 'escalated')).to.have.lengthOf(0)

      fakeTimers.advanceTime(4_000)
      expect(events.filter((e) => e.type === 'escalated')).to.have.lengthOf(1)
      expect(manager.getAlert('restored-warning')?.priority).to.equal('alarm')
    })

    it('should not escalate a warning that changed state just before the reload', async () => {
      // Raised long ago, reactivated 5 s before the restart: escalation is
      // owed from the reactivation, not from the original raise.
      store.prePopulate([
        storedAlert({
          id: 'restored-warning',
          path: 'propulsion.port.oilPressureLow',
          priority: 'warning',
          state: 'unacknowledged',
          raisedAt: new Date(Date.now() - 10 * TIMEOUT_MS).toISOString(),
          stateChangedAt: new Date(Date.now() - 5_000).toISOString()
        })
      ])

      await manager.loadFromStore()

      expect(events.filter((e) => e.type === 'escalated')).to.have.lengthOf(0)
      expect(manager.getAlert('restored-warning')?.priority).to.equal('warning')

      fakeTimers.advanceTime(TIMEOUT_MS - 5_000 - 2_000)
      expect(events.filter((e) => e.type === 'escalated')).to.have.lengthOf(0)

      fakeTimers.advanceTime(4_000)
      expect(events.filter((e) => e.type === 'escalated')).to.have.lengthOf(1)
    })

    it('should restart silence expiration timers for silenced alerts', async () => {
      const futureTime = new Date(Date.now() + 15000).toISOString() // 15 seconds from now
      store.prePopulate([
        storedAlert({
          id: 'silenced-1',
          silenced: true,
          silencedUntil: futureTime
        })
      ])

      await manager.loadFromStore()

      // Should have started a silence timer
      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS + 1)

      // Verify it unsilences when time expires
      fakeTimers.advanceTime(16000)
      expect(manager.getAlert('silenced-1')?.silenced).to.equal(false)
    })

    it('should clamp a resumed silence to the configured maximum', async () => {
      // 10 minutes of silence remaining, against a 120 s alarm maximum.
      store.prePopulate([
        storedAlert({
          id: 'over-silenced',
          silenced: true,
          silencedUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        })
      ])

      await manager.loadFromStore()

      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS + 1)

      fakeTimers.advanceTime(119_000)
      expect(manager.getAlert('over-silenced')?.silenced).to.equal(true)

      fakeTimers.advanceTime(2_000)
      expect(manager.getAlert('over-silenced')?.silenced).to.equal(false)
    })

    it('should immediately unsilence alerts with expired silence time', async () => {
      const pastTime = new Date(Date.now() - 1000).toISOString() // 1 second ago
      store.prePopulate([
        storedAlert({
          id: 'expired-silenced',
          silenced: true,
          silencedUntil: pastTime
        })
      ])

      await manager.loadFromStore()

      // Should have immediately unsilenced
      expect(manager.getAlert('expired-silenced')?.silenced).to.equal(false)
    })

    it('should immediately unsilence alerts with a malformed silencedUntil', async () => {
      store.prePopulate([
        storedAlert({
          id: 'malformed-silenced',
          silenced: true,
          silencedUntil: 'not-a-timestamp'
        })
      ])

      await manager.loadFromStore()

      const loaded = manager.getAlert('malformed-silenced')
      expect(loaded?.silenced).to.equal(false)
      expect(loaded?.silencedUntil).to.be.undefined
      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS)
    })

    it('should emit unsilenced event for expired silences', async () => {
      const pastTime = new Date(Date.now() - 1000).toISOString()
      store.prePopulate([
        storedAlert({
          id: 'expired-with-event',
          silenced: true,
          silencedUntil: pastTime
        })
      ])

      await manager.loadFromStore()

      // Should have emitted unsilenced event
      const unsilencedEvents = events.filter((e) => e.type === 'unsilenced')
      expect(unsilencedEvents).to.have.lengthOf(1)
      expect(unsilencedEvents[0].alert.id).to.equal('expired-with-event')
    })

    it('should escalate and unsilence an alert that is overdue for both', async () => {
      // The registry is populated first and the timers resumed per alert
      // afterwards, so the unsilence builds on the escalated value instead of
      // reverting it.
      store.prePopulate([
        storedAlert({
          id: 'overdue-both',
          priority: 'warning',
          state: 'unacknowledged',
          condition: true,
          stateChangedAt: new Date(Date.now() - 400 * 1000).toISOString(),
          silenced: true,
          silencedUntil: new Date(Date.now() - 1000).toISOString()
        })
      ])

      await manager.loadFromStore()
      fakeTimers.advanceTime(0)

      const loaded = manager.getAlert('overdue-both')
      expect(loaded?.priority).to.equal('alarm')
      expect(loaded?.silenced).to.equal(false)
      expect(loaded?.silencedUntil).to.be.undefined
      expect(events.filter((e) => e.type === 'escalated')).to.have.lengthOf(1)
    })

    it('should leave silenced alerts without silencedUntil as silenced', async () => {
      store.prePopulate([
        storedAlert({
          id: 'silenced-no-until',
          silenced: true
          // silencedUntil intentionally undefined
        })
      ])

      await manager.loadFromStore()

      // Should remain silenced (no timer started, no unsilencing)
      expect(manager.getAlert('silenced-no-until')?.silenced).to.equal(true)
      expect(fakeTimers.getPendingCount()).to.equal(RETENTION_TIMERS)
    })

    it('should handle empty store gracefully', async () => {
      await manager.loadFromStore()

      expect(manager.getActiveAlertCount()).to.equal(0)
    })

    it('should fail loudly when store.getAll() fails', async () => {
      // Deliberate behavior: an unreadable store must surface as a startup
      // failure rather than silently presenting an empty alert set.
      store.getAll = () => Promise.reject(new Error('SQLite disk I/O error'))

      const { errors } = await captureConsole(() =>
        expectRejection(manager.loadFromStore(), 'SQLite disk I/O error')
      )

      expect(manager.getActiveAlertCount()).to.equal(0)
      expect(errors).to.have.lengthOf(1)
    })

    it('should work without store configured', async () => {
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers) // No store

      // Should not throw
      await manager.loadFromStore()
      expect(manager.getActiveAlertCount()).to.equal(0)
    })

    it('should preserve all alert fields when loading', async () => {
      const fullAlert = storedAlert({
        id: 'full-alert',
        $source: 'source-123',
        priority: 'emergency',
        state: 'acknowledged',
        condition: false,
        latching: true,
        silenced: false,
        message: 'Full alert message',
        group: 'engine',
        data: { temperature: 95 },
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: 'user-1',
        context: 'vessels.self'
      })
      store.prePopulate([fullAlert])

      await manager.loadFromStore()

      const loaded = manager.getAlert('full-alert')
      expect(loaded).to.deep.equal(fullAlert)
    })

    it('should survive manager restart with persisted alerts', async () => {
      // Create an alert
      const alert = await manager.raiseAlert(
        raiseParams({ message: 'Persistent alert' })
      )

      // Stop and create a new manager with the same store
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)

      // Load from store
      await manager.loadFromStore()

      // Alert should be restored
      expect(manager.getActiveAlertCount()).to.equal(1)
      expect(manager.getAlert(alert.id)?.message).to.equal('Persistent alert')
    })
  })

  describe('history logging', () => {
    let store: MockAlertStore

    beforeEach(() => {
      store = new MockAlertStore()
      manager.stop()
      manager = new AlertManager(
        { ...defaultConfig, retentionDays: 90 },
        fakeTimers,
        store
      )
      manager.on('alert', (event: AlertEvent) => events.push(event))
    })

    it('should log raise event', async () => {
      const context = 'vessels.urn:mrn:signalk:uuid:test'
      await manager.raiseAlert(raiseParams({ group: 'engine', context }))

      expect(store.history).to.have.lengthOf(1)
      const entry = store.history[0]
      expect(entry.eventType).to.equal('raise')
      expect(entry.newState).to.equal('unacknowledged')

      // The alert's identity is copied onto the entry as first-class fields.
      expect(entry.path).to.equal('test.alert')
      expect(entry.context).to.equal(context)
      expect(entry.priority).to.equal('alarm')
      expect(entry.message).to.equal('Test alert')
      expect(entry.$source).to.equal('test-source')
      expect(entry.details).to.be.undefined
    })

    it('should log acknowledge event', async () => {
      const alert = await manager.raiseAlert(raiseParams())
      store.resetHistory()

      await manager.acknowledgeAlert(alert.id, 'user-1')

      expect(store.history).to.have.lengthOf(1)
      expect(store.history[0].eventType).to.equal('acknowledge')
      expect(store.history[0].userId).to.equal('user-1')
      expect(store.history[0].previousState).to.equal('unacknowledged')
      expect(store.history[0].newState).to.equal('acknowledged')
    })

    it('should log clear event with newState cleared when RTN alert is acknowledged', async () => {
      const alert = await manager.raiseAlert(raiseParams({ group: 'engine' }))
      await manager.clearCondition(alert.id)
      store.resetHistory()

      await manager.acknowledgeAlert(alert.id)

      expect(store.history).to.have.lengthOf(1)
      const entry = store.history[0]
      expect(entry.eventType).to.equal('clear')
      expect(entry.newState).to.equal('normal')
      expect(entry.path).to.equal('test.alert')
      expect(entry.priority).to.equal('alarm')
      expect(entry.message).to.equal('Test alert')
      expect(entry.$source).to.equal('test-source')
      expect(entry.details).to.be.undefined
    })

    it('should log silence event', async () => {
      const alert = await manager.raiseAlert(raiseParams())
      store.resetHistory()

      await manager.silenceAlert(alert.id, 30000)

      expect(store.history).to.have.lengthOf(1)
      expect(store.history[0].eventType).to.equal('silence')
      expect(store.history[0].details).to.have.property('silencedUntil')
    })

    it('should log unsilence event', async () => {
      const alert = await manager.raiseAlert(raiseParams())
      await manager.silenceAlert(alert.id, 30000)
      store.resetHistory()

      await manager.unsilenceAlert(alert.id)

      expect(store.history).to.have.lengthOf(1)
      expect(store.history[0].eventType).to.equal('unsilence')
    })

    it('should log clear event with newState cleared on clearCondition (when alert is removed)', async () => {
      const alert = await manager.raiseAlert(raiseParams({ group: 'engine' }))
      await manager.acknowledgeAlert(alert.id)
      store.resetHistory()

      await manager.clearCondition(alert.id)

      expect(store.history).to.have.lengthOf(1)
      const entry = store.history[0]
      expect(entry.eventType).to.equal('clear')
      expect(entry.newState).to.equal('normal')
      expect(entry.path).to.equal('test.alert')
      expect(entry.priority).to.equal('alarm')
      expect(entry.message).to.equal('Test alert')
      expect(entry.$source).to.equal('test-source')
      expect(entry.details).to.be.undefined
    })

    it('should log clear event on clearCondition (RTN transition)', async () => {
      const alert = await manager.raiseAlert(raiseParams({ group: 'engine' }))
      store.resetHistory()

      await manager.clearCondition(alert.id)

      expect(store.history).to.have.lengthOf(1)
      const entry = store.history[0]
      expect(entry.eventType).to.equal('clear')
      expect(entry.newState).to.equal('rtn-unacknowledged')
      expect(entry.path).to.equal('test.alert')
      expect(entry.priority).to.equal('alarm')
      expect(entry.message).to.equal('Test alert')
      expect(entry.$source).to.equal('test-source')
      expect(entry.details).to.be.undefined
    })

    it('should log escalate event', async () => {
      await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )
      store.resetHistory()

      fakeTimers.advanceTime(300 * 1000)

      // Give fire-and-forget a chance to resolve
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(store.history).to.have.lengthOf(1)
      expect(store.history[0].eventType).to.equal('escalate')
      expect(store.history[0].previousPriority).to.equal('warning')
      expect(store.history[0].newPriority).to.equal('alarm')
    })

    it('should log unsilence event on silence expiration', async () => {
      const alert = await manager.raiseAlert(raiseParams())
      await manager.silenceAlert(alert.id, 5000)
      store.resetHistory()

      fakeTimers.advanceTime(5000)

      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(store.history).to.have.lengthOf(1)
      expect(store.history[0].eventType).to.equal('unsilence')
    })

    it('should log silence events for each alert in silenceAll', async () => {
      await manager.raiseAlert(
        raiseParams({ path: 'test.alert.1', message: 'Alert 1' })
      )
      await manager.raiseAlert(
        raiseParams({
          path: 'test.alert.2',
          priority: 'warning',
          message: 'Alert 2'
        })
      )
      store.resetHistory()

      await manager.silenceAll()

      const silenceEntries = store.entriesOfType('silence')
      expect(silenceEntries).to.have.lengthOf(2)
      expect(silenceEntries.every((e) => e.details?.silencedUntil)).to.equal(
        true
      )
    })

    it('should log escalate event when re-raising with higher priority', async () => {
      await manager.raiseAlert(raiseParams({ priority: 'warning' }))
      store.resetHistory()

      await manager.raiseAlert(raiseParams())

      const escalateEntries = store.entriesOfType('escalate')
      expect(escalateEntries).to.have.lengthOf(1)
      expect(escalateEntries[0].previousPriority).to.equal('warning')
      expect(escalateEntries[0].newPriority).to.equal('alarm')
    })

    it('should log unsilence event for expired silence on loadFromStore', async () => {
      // Seed a silenced alert with expired silencedUntil directly into the store
      store.prePopulate([
        storedAlert({
          id: 'expired-silence-1',
          path: 'test.expired.silence',
          $source: 'test-source',
          silenced: true,
          silencedUntil: new Date(Date.now() - 1000).toISOString(),
          raisedAt: new Date(Date.now() - 60000).toISOString(),
          stateChangedAt: new Date(Date.now() - 60000).toISOString()
        })
      ])
      store.resetHistory()

      // Create a new manager and load from store
      const newManager = new AlertManager(
        { ...defaultConfig, retentionDays: 90 },
        fakeTimers,
        store
      )
      await newManager.loadFromStore()

      expect(store.entriesOfType('unsilence')).to.have.lengthOf(1)
      newManager.stop()
    })

    it('should keep the alert when its transition fails to commit', async () => {
      // The audit entries travel with the alert write, so a rejecting store
      // loses both together — the alert itself survives in the registry.
      manager.stop()
      manager = new AlertManager(
        { ...defaultConfig, retentionDays: 90 },
        fakeTimers,
        new FailingAlertStore()
      )
      manager.on('alert', (event: AlertEvent) => events.push(event))
      const failures: StoreFailureEvent[] = []
      manager.on('storeError', (event: StoreFailureEvent) =>
        failures.push(event)
      )

      const { result: alert, errors } = await captureConsole(() =>
        manager.raiseAlert(raiseParams())
      )

      // The alert survives the failed commit, intact.
      const kept = manager.getAlert(alert.id)
      expect(kept).to.not.be.null
      expect(kept?.message).to.equal('Test alert')

      // The failure is recorded rather than swallowed silently.
      expect(manager.isStoreDegraded()).to.equal(true)
      expect(failures.map((f) => f.operation)).to.deep.equal(['commit'])
      expect(failures[0].alertId).to.equal(alert.id)
      expect(errors).to.have.lengthOf(1)
    })

    it('should prune history on loadFromStore', async () => {
      await manager.loadFromStore()

      // Give fire-and-forget a chance to resolve
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(store.pruneCalledWith).to.deep.equal([90])
    })

    it('should work without a store (no errors)', async () => {
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers)
      manager.on('alert', (event: AlertEvent) => events.push(event))

      const alert = await manager.raiseAlert(raiseParams())

      const kept = manager.getAlert(alert.id)
      expect(kept).to.not.be.null
      expect(kept?.message).to.equal('Test alert')
    })
  })

  describe('history retention', () => {
    const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000
    const DEFAULT_RETENTION_DAYS = 90
    let store: MockAlertStore

    beforeEach(() => {
      store = new MockAlertStore()
      manager.stop()
    })

    it('should keep pruning every 24 hours after the initial load', async () => {
      manager = new AlertManager(
        { ...defaultConfig, retentionDays: 90 },
        fakeTimers,
        store
      )

      await manager.loadFromStore()

      expect(store.pruneCalledWith).to.deep.equal([90])

      fakeTimers.advanceTime(PRUNE_INTERVAL_MS)
      expect(store.pruneCalledWith).to.deep.equal([90, 90])

      fakeTimers.advanceTime(PRUNE_INTERVAL_MS)
      expect(store.pruneCalledWith).to.deep.equal([90, 90, 90])
    })

    it('should stop the repeating prune when the manager stops', async () => {
      manager = new AlertManager(
        { ...defaultConfig, retentionDays: 90 },
        fakeTimers,
        store
      )
      await manager.loadFromStore()
      fakeTimers.advanceTime(PRUNE_INTERVAL_MS)
      expect(store.pruneCalledWith).to.deep.equal([90, 90])

      manager.stop()

      fakeTimers.advanceTime(3 * PRUNE_INTERVAL_MS)
      expect(store.pruneCalledWith).to.deep.equal([90, 90])
      expect(fakeTimers.getPendingCount()).to.equal(0)
    })

    it('should apply the default window when none is configured', async () => {
      // Unbounded is the wrong default on a device whose root filesystem is an
      // SD card, so an absent setting means 90 days rather than never.
      manager = new AlertManager(defaultConfig, fakeTimers, store)

      await manager.loadFromStore()

      expect(store.pruneCalledWith).to.deep.equal([DEFAULT_RETENTION_DAYS])

      fakeTimers.advanceTime(PRUNE_INTERVAL_MS)
      expect(store.pruneCalledWith).to.deep.equal([
        DEFAULT_RETENTION_DAYS,
        DEFAULT_RETENTION_DAYS
      ])
    })

    it('should prefer a configured window over the default', async () => {
      manager = new AlertManager(
        { ...defaultConfig, retentionDays: 7 },
        fakeTimers,
        store
      )

      await manager.loadFromStore()

      expect(store.pruneCalledWith).to.deep.equal([7])

      fakeTimers.advanceTime(PRUNE_INTERVAL_MS)
      expect(store.pruneCalledWith).to.deep.equal([7, 7])
    })

    for (const retentionDays of [0, -1, 1.5, NaN]) {
      it(`should refuse a retention window of ${String(retentionDays)} as a configuration error`, async () => {
        manager = new AlertManager(
          { ...defaultConfig, retentionDays },
          fakeTimers,
          store
        )

        const { errors } = await captureConsole(() => manager.loadFromStore())

        expect(store.pruneCalledWith).to.deep.equal([])
        expect(fakeTimers.getPendingCount()).to.equal(0)
        // A bad setting is the operator's to fix, not lost durability.
        expect(manager.isStoreDegraded()).to.equal(false)
        expect(errors).to.have.lengthOf(1)
        expect(String(errors[0][0])).to.include(
          'must be a whole number of days'
        )

        fakeTimers.advanceTime(2 * PRUNE_INTERVAL_MS)
        expect(store.pruneCalledWith).to.deep.equal([])
      })
    }

    it('should not prune or schedule when the load fails', async () => {
      // A store this server has decided it cannot use is left alone, and no
      // timer outlives the aborted startup.
      store.getAll = () => Promise.reject(new Error('SQLite disk I/O error'))
      manager = new AlertManager(
        { ...defaultConfig, retentionDays: 30 },
        fakeTimers,
        store
      )

      const { errors } = await captureConsole(() =>
        expectRejection(manager.loadFromStore(), 'SQLite disk I/O error')
      )

      expect(store.pruneCalledWith).to.deep.equal([])
      expect(fakeTimers.getPendingCount()).to.equal(0)
      expect(errors).to.have.lengthOf(1)
    })

    it('should keep one prune timer when the store is loaded twice', async () => {
      manager = new AlertManager(
        { ...defaultConfig, retentionDays: 30 },
        fakeTimers,
        store
      )

      await manager.loadFromStore()
      await manager.loadFromStore()

      expect(store.pruneCalledWith).to.deep.equal([30, 30])
      expect(fakeTimers.getPendingCount()).to.equal(1)

      fakeTimers.advanceTime(PRUNE_INTERVAL_MS)

      expect(store.pruneCalledWith).to.deep.equal([30, 30, 30])
      expect(fakeTimers.getPendingCount()).to.equal(1)
    })

    it('should report a failed prune without preventing the load', async () => {
      store.pruneHistory = () =>
        Promise.reject(new Error('SQLite disk I/O error'))
      store.prePopulate([storedAlert({ id: 'kept-1', message: 'Kept alert' })])
      manager = new AlertManager(
        { ...defaultConfig, retentionDays: 30 },
        fakeTimers,
        store
      )
      const failures: StoreFailureEvent[] = []
      manager.on('storeError', (event: StoreFailureEvent) =>
        failures.push(event)
      )

      const { errors } = await captureConsole(async () => {
        await manager.loadFromStore()
        // The prune is fire-and-forget; let its rejection settle.
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(manager.getAlert('kept-1')?.message).to.equal('Kept alert')
      // An unpruned trail is not a durability failure: the store and the
      // registry still agree about every active alert.
      expect(manager.isStoreDegraded()).to.equal(false)
      expect(failures).to.have.lengthOf(1)
      expect(failures[0].operation).to.equal('prune')
      expect(failures[0].alertId).to.be.null
      expect(errors).to.have.lengthOf(1)
    })
  })

  describe('re-raise reactivation', () => {
    it('should reactivate acknowledged alert to unacknowledged on re-raise', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.acknowledgeAlert(alert.id, 'user-1')
      expect(manager.getAlert(alert.id)?.state).to.equal('acknowledged')

      const reraised = await manager.raiseAlert(
        raiseParams({ message: 'Test alert re-raised' })
      )

      expect(reraised.id).to.equal(alert.id)
      expect(reraised.state).to.equal('unacknowledged')
      expect(reraised.acknowledgedAt).to.be.undefined
      expect(reraised.acknowledgedBy).to.be.undefined
    })

    it('should reactivate rtn-unacknowledged alert to unacknowledged on re-raise', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.clearCondition(alert.id)
      expect(manager.getAlert(alert.id)?.state).to.equal('rtn-unacknowledged')

      const reraised = await manager.raiseAlert(
        raiseParams({ message: 'Test alert re-raised' })
      )

      expect(reraised.id).to.equal(alert.id)
      expect(reraised.state).to.equal('unacknowledged')
      expect(reraised.clearedAt).to.be.undefined
    })

    it('should emit raised event on reactivation (not updated)', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.acknowledgeAlert(alert.id)
      events = []

      await manager.raiseAlert(raiseParams({ message: 'Test alert re-raised' }))

      expect(events).to.have.lengthOf(1)
      expect(events[0].type).to.equal('raised')
      expect(events[0].previousState).to.equal('acknowledged')
    })

    it('should emit updated event for unacknowledged re-raise (no state change)', async () => {
      await manager.raiseAlert(raiseParams())
      events = []

      await manager.raiseAlert(raiseParams({ message: 'Test alert updated' }))

      expect(events).to.have.lengthOf(1)
      expect(events[0].type).to.equal('updated')
    })

    it('should restart escalation timer for reactivated warning', async () => {
      const alert = await manager.raiseAlert(
        raiseParams({ priority: 'warning', message: 'Test warning' })
      )

      expect(fakeTimers.getPendingCount()).to.equal(1)

      await manager.acknowledgeAlert(alert.id)
      expect(fakeTimers.getPendingCount()).to.equal(0)

      await manager.raiseAlert(
        raiseParams({
          priority: 'warning',
          message: 'Test warning re-raised'
        })
      )

      // Escalation timer should be restarted
      expect(fakeTimers.getPendingCount()).to.equal(1)

      // Verify it fires
      fakeTimers.advanceTime(300 * 1000)
      expect(manager.getAlert(alert.id)?.priority).to.equal('alarm')
    })

    it('should un-silence and cancel silence timer on re-raise', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      await manager.acknowledgeAlert(alert.id)
      // Silence the acknowledged alert
      await manager.silenceAlert(alert.id, 30000)
      expect(manager.getAlert(alert.id)?.silenced).to.equal(true)

      await manager.raiseAlert(raiseParams({ message: 'Test alert re-raised' }))

      const reactivated = manager.getAlert(alert.id)
      expect(reactivated?.silenced).to.equal(false)
      expect(reactivated?.silencedUntil).to.be.undefined

      // Silence timer should not fire (was cancelled)
      events = []
      fakeTimers.advanceTime(30000)
      expect(events.filter((e) => e.type === 'unsilenced')).to.have.lengthOf(0)
    })

    it('should un-silence on idempotent re-raise of unacknowledged alert', async () => {
      const alert = await manager.raiseAlert(raiseParams())

      // Silence without acknowledging first
      await manager.silenceAlert(alert.id, 30000)
      expect(manager.getAlert(alert.id)?.silenced).to.equal(true)
      expect(manager.getAlert(alert.id)?.state).to.equal('unacknowledged')

      // Re-raise the same alert (idempotent reactivation)
      await manager.raiseAlert(raiseParams({ message: 'Test alert re-raised' }))

      const reactivated = manager.getAlert(alert.id)
      expect(reactivated?.state).to.equal('unacknowledged')
      expect(reactivated?.silenced).to.equal(false)
      expect(reactivated?.silencedUntil).to.be.undefined

      // Silence timer should not fire (was cancelled)
      events = []
      fakeTimers.advanceTime(30000)
      expect(events.filter((e) => e.type === 'unsilenced')).to.have.lengthOf(0)
    })

    it('should preserve raisedAt on reactivation', async () => {
      const alert = await manager.raiseAlert(raiseParams())
      const originalRaisedAt = alert.raisedAt

      await manager.acknowledgeAlert(alert.id)

      const reraised = await manager.raiseAlert(
        raiseParams({ message: 'Test alert re-raised' })
      )

      expect(reraised.raisedAt).to.equal(originalRaisedAt)
    })

    it('should log raise history event on reactivation', async () => {
      const store = new MockAlertStore()
      manager.stop()
      manager = new AlertManager(defaultConfig, fakeTimers, store)
      manager.on('alert', (event: AlertEvent) => events.push(event))

      const alert = await manager.raiseAlert(raiseParams())
      await manager.acknowledgeAlert(alert.id)
      store.resetHistory()

      await manager.raiseAlert(raiseParams({ message: 'Test alert re-raised' }))

      const raiseEntries = store.entriesOfType('raise')
      expect(raiseEntries).to.have.lengthOf(1)
      expect(raiseEntries[0].previousState).to.equal('acknowledged')
      expect(raiseEntries[0].newState).to.equal('unacknowledged')
    })
  })
})
