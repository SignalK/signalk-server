import { expect } from 'chai'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type {
  Context,
  Delta,
  Path,
  SourceRef,
  Timestamp
} from '@signalk/server-api'
import { AlertsApi, type AlertsApplication } from '../../../src/api/alerts'
import { MAX_SUPPRESSED_REPORTS } from '../../../src/api/alerts/deltas'
import type { Alert } from '../../../src/api/alerts/types'
import { callRoute, FakeApp } from './helpers/fakeApp'
import { captureConsole } from './helpers/fixtures'

/** What the server rewrites `vessels.self` to before the delta chain runs. */
const SELF_CONTEXT = 'vessels.urn:mrn:signalk:uuid:test-self'

/** A delta carrying one value under an explicit context. */
function deltaWithContext(
  alertPath: string,
  value: unknown,
  context: string,
  $source = 'n2k-1' as SourceRef
): Delta {
  return {
    context: context as Context,
    updates: [
      {
        $source,
        timestamp: '2026-09-01T12:00:00.000Z' as Timestamp,
        values: [{ path: alertPath as Path, value: value as never }]
      }
    ]
  } as Delta
}

/**
 * A delta as the ingress handler actually receives it. The server rewrites
 * `vessels.self` to the concrete self context before the chain runs, so a
 * helper sending the literal would exercise the other-vessel branch while
 * claiming to describe a device on this boat.
 */
function deltaWith(
  alertPath: string,
  value: unknown,
  $source = 'n2k-1' as SourceRef
): Delta {
  return {
    context: SELF_CONTEXT as Context,
    updates: [
      {
        $source,
        timestamp: '2026-09-01T12:00:00.000Z' as Timestamp,
        values: [{ path: alertPath as Path, value: value as never }]
      }
    ]
  } as Delta
}

describe('alerts deltas', () => {
  let tempDir: string
  let app: FakeApp
  let api: AlertsApi

  /** The alert values published so far, in order. */
  function publishedAlerts(): Array<{ path: string; alert: Alert }> {
    return app.published.flatMap(({ delta }) =>
      (delta.updates ?? []).flatMap((update) =>
        'values' in update
          ? update.values.map((value) => ({
              path: value.path as string,
              alert: value.value as unknown as Alert
            }))
          : []
      )
    )
  }

  const API = '/signalk/v2/api/alerts'

  async function raiseViaRest(body: Record<string, unknown>): Promise<Alert> {
    const reply = await callRoute(app, `POST ${API}`, { body })
    expect(reply.status, JSON.stringify(reply.body)).to.equal(201)
    return reply.body as Alert
  }

  /** The active set, as the API serves it. */
  async function activeAlerts(): Promise<Alert[]> {
    return (await callRoute(app, `GET ${API}`)).body as Alert[]
  }

  /** The audit trail, as the API serves it. */
  async function history(): Promise<{
    entries: Array<{ eventType: string; $source: string }>
  }> {
    return (await callRoute(app, `GET ${API}/history`)).body as {
      entries: Array<{ eventType: string; $source: string }>
    }
  }

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alerts-deltas-'))
    app = new FakeApp(tempDir)
    api = new AlertsApi(app as unknown as AlertsApplication)
    await api.start()
    app.published.length = 0
  })

  afterEach(async () => {
    await api.stop()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('egress', () => {
    it('publishes the whole alert at its path', async () => {
      const alert = await raiseViaRest({
        path: 'propulsion.port.oilPressureLow',
        priority: 'alarm',
        message: 'Oil pressure low'
      })

      expect(publishedAlerts()).to.have.lengthOf(1)
      const [published] = publishedAlerts()
      expect(published.path).to.equal('alerts.propulsion.port.oilPressureLow')
      expect(published.alert.id).to.equal(alert.id)
      expect(published.alert.state).to.equal('unacknowledged')
      expect(app.published[0].id).to.equal('alertsApi')
    })

    it('publishes a resolved alert once, as normal', async () => {
      const alert = await raiseViaRest({
        path: 'engine.overheat',
        priority: 'caution',
        message: 'Hot'
      })
      app.published.length = 0

      await callRoute(app, `PUT ${API}/:id/condition`, {
        params: { id: alert.id },
        body: { active: false }
      })

      const published = publishedAlerts()
      expect(published).to.have.lengthOf(1)
      expect(published[0].alert.state).to.equal('normal')
    })

    it('republishes the active set at startup', async () => {
      await raiseViaRest({
        path: 'engine.overheat',
        priority: 'alarm',
        message: 'Hot'
      })
      await raiseViaRest({
        path: 'tank.empty',
        priority: 'warning',
        message: 'Empty'
      })
      await api.stop()
      app.published.length = 0

      api = new AlertsApi(app as unknown as AlertsApplication)
      await api.start()

      expect(publishedAlerts().map((p) => p.path)).to.have.members([
        'alerts.engine.overheat',
        'alerts.tank.empty'
      ])
    })
  })

  describe('identity across surfaces', () => {
    it('treats a delta on the self context as the same alert a REST raise makes', async () => {
      // The server rewrites vessels.self to vessels.<selfId> before the delta
      // chain runs, so ingress sees a concrete context where REST sees none.
      // One condition on one path is one alert whichever surface reports it.
      await raiseViaRest({
        path: 'engine.overheat',
        priority: 'alarm',
        message: 'from REST'
      })

      app.ingest(
        deltaWithContext(
          'alerts.engine.overheat',
          { priority: 'alarm', message: 'from the device' },
          SELF_CONTEXT
        )
      )
      await api.ingressSettled()

      const active = await activeAlerts()
      expect(active).to.have.lengthOf(1)
      expect(active[0].message).to.equal('from the device')
    })

    it('keeps an alert on another vessel separate', async () => {
      await raiseViaRest({
        path: 'engine.overheat',
        priority: 'alarm',
        message: 'ours'
      })

      app.ingest(
        deltaWithContext(
          'alerts.engine.overheat',
          { priority: 'alarm', message: 'theirs' },
          'vessels.urn:mrn:imo:mmsi:200000000'
        )
      )
      await api.ingressSettled()

      expect(await activeAlerts()).to.have.lengthOf(2)
    })
  })

  describe('source liveness', () => {
    it('marks a delta-raised alert stale when the source stops re-emitting', async () => {
      await api.stop()
      api = new AlertsApi(app as unknown as AlertsApplication, {
        sourceTimeoutSeconds: 0.05
      })
      await api.start()
      app.published.length = 0

      app.ingest(
        deltaWith('alerts.engine.overheat', {
          priority: 'alarm',
          message: 'Hot'
        })
      )
      await api.ingressSettled()
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect((await activeAlerts())[0].stale).to.equal(true)
      // The mirror has to learn about it too.
      const lastPublished = publishedAlerts().slice(-1)[0]
      expect(lastPublished.alert.stale).to.equal(true)
    })

    it('leaves a REST-raised alert alone however long it is quiet', async () => {
      await api.stop()
      api = new AlertsApi(app as unknown as AlertsApplication, {
        sourceTimeoutSeconds: 0.05
      })
      await api.start()

      await raiseViaRest({
        path: 'engine.overheat',
        priority: 'alarm',
        message: 'Hot'
      })
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect((await activeAlerts())[0].stale).to.equal(false)
    })
  })

  describe('ingress', () => {
    it('raises an alert from a delta and clears it with a null value', async () => {
      app.ingest(
        deltaWith('alerts.propulsion.port.oilPressureLow', {
          priority: 'alarm',
          message: 'Oil pressure low'
        })
      )
      await api.ingressSettled()

      const raised = await activeAlerts()
      expect(raised.map((a) => a.path)).to.deep.equal([
        'propulsion.port.oilPressureLow'
      ])
      expect(raised[0].$source).to.equal('n2k-1')

      app.ingest(deltaWith('alerts.propulsion.port.oilPressureLow', null))
      await api.ingressSettled()

      // An alarm whose condition ends waits for acknowledgment; it does not
      // disappear because the device stopped complaining.
      const cleared = await activeAlerts()
      expect(cleared.map((a) => a.state)).to.deep.equal(['rtn-unacknowledged'])
    })

    it('resolves a caution outright when the condition ends', async () => {
      app.ingest(
        deltaWith('alerts.tank.low', { priority: 'caution', message: 'Low' })
      )
      await api.ingressSettled()

      app.ingest(deltaWith('alerts.tank.low', null))
      await api.ingressSettled()

      expect(await activeAlerts()).to.have.lengthOf(0)
    })

    it('never lets an alerts value reach the model unmanaged', async () => {
      const passed = app.ingest(
        deltaWith('alerts.engine.overheat', {
          priority: 'alarm',
          message: 'Hot'
        })
      )
      await api.ingressSettled()

      expect(passed).to.have.lengthOf(0)
    })

    it('leaves a delta that carries no alert value alone', () => {
      const delta = deltaWith('navigation.speedOverGround', 4.2)

      const passed = app.ingest(delta)

      expect(passed).to.deep.equal([delta])
      expect(passed[0]).to.equal(delta)
    })

    it('keeps the non-alert values of a mixed delta', async () => {
      const delta = deltaWith('navigation.speedOverGround', 4.2)
      ;(delta.updates[0] as { values: unknown[] }).values.push({
        path: 'alerts.engine.overheat' as Path,
        value: { priority: 'alarm', message: 'Hot' } as never
      })

      const passed = app.ingest(delta)
      await api.ingressSettled()

      expect(passed).to.have.lengthOf(1)
      const values = (
        passed[0].updates[0] as { values: Array<{ path: string }> }
      ).values
      expect(values.map((v) => v.path)).to.deep.equal([
        'navigation.speedOverGround'
      ])
      expect(await activeAlerts()).to.have.lengthOf(1)
    })

    it('keeps an acknowledged alert acknowledged through a heartbeat', async () => {
      // The staleness contract asks a delta source to re-emit its alert value.
      // A repeat of an unchanged description is that heartbeat, not the
      // condition returning, so it must not re-alert the operator.
      const raise = () =>
        deltaWith('alerts.engine.overheat', {
          priority: 'alarm',
          message: 'Hot'
        })
      app.ingest(raise())
      await api.ingressSettled()
      const [alert] = await activeAlerts()
      await callRoute(app, `POST ${API}/:id/acknowledge`, {
        params: { id: alert.id }
      })
      await callRoute(app, `POST ${API}/:id/silence`, {
        params: { id: alert.id },
        body: { duration: 120 }
      })

      app.ingest(raise())
      await api.ingressSettled()

      const [after] = await activeAlerts()
      expect(after.state).to.equal('acknowledged')
      expect(after.silenced).to.equal(true)
    })

    it('re-alerts when the description actually changes', async () => {
      app.ingest(
        deltaWith('alerts.engine.overheat', {
          priority: 'warning',
          message: 'Warm'
        })
      )
      await api.ingressSettled()
      const [alert] = await activeAlerts()
      await callRoute(app, `POST ${API}/:id/acknowledge`, {
        params: { id: alert.id }
      })

      app.ingest(
        deltaWith('alerts.engine.overheat', {
          priority: 'alarm',
          message: 'Hot'
        })
      )
      await api.ingressSettled()

      const [after] = await activeAlerts()
      expect(after.state).to.equal('unacknowledged')
      expect(after.priority).to.equal('alarm')
    })

    it('does not publish anything for an unchanged heartbeat', async () => {
      const raise = () =>
        deltaWith('alerts.engine.overheat', {
          priority: 'alarm',
          message: 'Hot'
        })
      app.ingest(raise())
      await api.ingressSettled()
      app.published.length = 0

      for (let i = 0; i < 5; i++) {
        app.ingest(raise())
      }
      await api.ingressSettled()

      // Nothing changed, so there is nothing for the mirror to learn and
      // nothing to write.
      expect(publishedAlerts()).to.have.lengthOf(0)
    })

    it('ignores lifecycle fields a device claims', async () => {
      app.ingest(
        deltaWith('alerts.engine.overheat', {
          priority: 'alarm',
          message: 'Hot',
          state: 'acknowledged',
          silenced: true,
          id: 'device-chosen-id'
        })
      )
      await api.ingressSettled()

      const [alert] = await activeAlerts()
      expect(alert.state).to.equal('unacknowledged')
      expect(alert.silenced).to.equal(false)
      expect(alert.id).to.not.equal('device-chosen-id')
    })

    it('lets any source clear an alert another source raised', async () => {
      app.ingest(
        deltaWith(
          'alerts.engine.overheat',
          { priority: 'alarm', message: 'Hot' },
          'source-a' as SourceRef
        )
      )
      await api.ingressSettled()

      app.ingest(
        deltaWith('alerts.engine.overheat', null, 'source-b' as SourceRef)
      )
      await api.ingressSettled()

      const trail = await history()
      const clear = trail.entries.find((e) => e.eventType === 'clear')
      expect(clear?.$source).to.equal('source-b')
    })

    it('treats a delta claiming to be our own egress as ingress', async () => {
      const spoofed = deltaWith(
        'alerts.engine.overheat',
        { priority: 'alarm', message: 'Hot' },
        'alertsApi' as SourceRef
      )

      const passed = app.ingest(spoofed)
      await api.ingressSettled()

      expect(passed).to.have.lengthOf(0)
      expect(await activeAlerts()).to.have.lengthOf(1)
    })

    it('passes its own egress through untouched', async () => {
      await raiseViaRest({
        path: 'engine.overheat',
        priority: 'alarm',
        message: 'Hot'
      })
      const own = app.published[0].delta

      const passed = app.ingest(own)
      await api.ingressSettled()

      expect(passed).to.deep.equal([own])
      expect(await activeAlerts()).to.have.lengthOf(1)
    })

    it('treats a repeated clear as a heartbeat for a held alert', async () => {
      app.ingest(
        deltaWith('alerts.engine.overheat', {
          priority: 'alarm',
          message: 'Hot'
        })
      )
      await api.ingressSettled()

      app.ingest(deltaWith('alerts.engine.overheat', null))
      await api.ingressSettled()
      const [held] = await activeAlerts()

      // The alarm waits for acknowledgment while its source keeps reporting
      // the condition is over. It must not be marked stale for that.
      expect(held.state).to.equal('rtn-unacknowledged')
      expect(held.stale).to.equal(false)
      expect(held.sourceOnline).to.equal(true)
    })

    it('drops a value whose path is not usable', async () => {
      const { result: passed } = await captureConsole(async () => {
        const taken = app.ingest(
          deltaWith('alerts.engine..overheat', {
            priority: 'alarm',
            message: 'Hot'
          })
        )
        await api.ingressSettled()
        return taken
      })

      expect(passed).to.have.lengthOf(0)
      expect(await activeAlerts()).to.have.lengthOf(0)
    })

    it('takes the bare alerts path out of the chain rather than passing it on', async () => {
      // `alerts` names no alert, so it cannot be applied; passing it on would
      // put an unmanaged value in the namespace the manager owns.
      const { result: passed, warnings } = await captureConsole(async () => {
        const taken = app.ingest(deltaWith('alerts', { priority: 'alarm' }))
        await api.ingressSettled()
        return taken
      })

      expect(passed).to.have.lengthOf(0)
      expect(warnings).to.have.lengthOf(1)
      expect(await activeAlerts()).to.have.lengthOf(0)
    })

    it('forgets its oldest suppressed report rather than growing without limit', async () => {
      const unusable = { notADescription: true }
      const firstPath = 'alerts.probe.p0'

      const { warnings } = await captureConsole(async () => {
        for (let i = 0; i <= MAX_SUPPRESSED_REPORTS; i++) {
          app.ingest(deltaWith(`alerts.probe.p${String(i)}`, unusable))
        }
        await api.ingressSettled()
      })
      expect(warnings).to.have.lengthOf(MAX_SUPPRESSED_REPORTS + 1)

      // The first path's key was evicted to make room, so its source is heard
      // from once more instead of being suppressed for the life of the process.
      const { warnings: again } = await captureConsole(async () => {
        app.ingest(deltaWith(firstPath, unusable))
        await api.ingressSettled()
      })
      expect(again).to.have.lengthOf(1)
    })

    it('drops a value whose description is oversized', async () => {
      await captureConsole(async () => {
        app.ingest(
          deltaWith('alerts.engine.overheat', {
            priority: 'alarm',
            message: 'x'.repeat(1001)
          })
        )
        await api.ingressSettled()
      })

      expect(await activeAlerts()).to.have.lengthOf(0)
    })

    it('drops a value that does not describe an alert', async () => {
      await captureConsole(async () => {
        app.ingest(deltaWith('alerts.engine.overheat', { message: 'Hot' }))
        app.ingest(deltaWith('alerts.engine.overheat', 'just a string'))
        await api.ingressSettled()
      })

      expect(await activeAlerts()).to.have.lengthOf(0)
    })

    it('leaves the chain once stopped, and joins it once per start', async () => {
      // A stop that failed to unregister would keep swallowing alerts values
      // for a subsystem that is no longer running, and every restart would
      // stack another dead handler on the chain.
      await api.stop()
      expect(app.deltaInputHandlers).to.have.lengthOf(0)

      api = new AlertsApi(app as unknown as AlertsApplication)
      await api.start()
      expect(app.deltaInputHandlers).to.have.lengthOf(1)
    })

    it('applies a raise and a clear on one path in the order they arrived', async () => {
      app.ingest(
        deltaWith('alerts.engine.overheat', {
          priority: 'alarm',
          message: 'Hot'
        })
      )
      app.ingest(deltaWith('alerts.engine.overheat', null))
      await api.ingressSettled()

      const trail = await history()
      // The audit trail reads newest first.
      expect(trail.entries.map((e) => e.eventType)).to.deep.equal([
        'clear',
        'raise'
      ])
    })

    it('clears an alert restored from the store', async () => {
      app.ingest(
        deltaWith('alerts.engine.overheat', {
          priority: 'alarm',
          message: 'Hot'
        })
      )
      await api.ingressSettled()
      await api.stop()
      api = new AlertsApi(app as unknown as AlertsApplication)
      await api.start()

      app.ingest(deltaWith('alerts.engine.overheat', null))
      await api.ingressSettled()

      // The reference implementation lost the path-to-alert mapping across a
      // restart and silently re-raised instead of clearing.
      const trail = await history()
      // The audit trail reads newest first.
      expect(trail.entries.map((e) => e.eventType)).to.deep.equal([
        'clear',
        'raise'
      ])
      expect((await activeAlerts())[0].state).to.equal('rtn-unacknowledged')
    })
  })
})
