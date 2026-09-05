import { expect } from 'chai'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { AlertsApi, type AlertsApplication } from '../../../src/api/alerts'
import { callRoute, FakeApp, type Reply } from './helpers/fakeApp'
import type { Alert } from '../../../src/api/alerts/types'

/** One more than the manager's default cap, so the last raise is refused. */
const RAISES_PAST_CAP = 1001

/** Each raise writes an alert row and a history row; CI runners are slow. */
const CAP_TEST_TIMEOUT_MS = 30_000

const API = '/signalk/v2/api/alerts'

describe('AlertsApi routes', () => {
  let tempDir: string
  let app: FakeApp
  let api: AlertsApi

  const call = (
    route: string,
    options: {
      params?: Record<string, string>
      query?: Record<string, unknown>
      body?: unknown
    } = {}
  ): Promise<Reply> => callRoute(app, route, options)

  /** Raise an alert through the API and return it. */
  async function raise(body: Record<string, unknown>): Promise<Alert> {
    const reply = await call(`POST ${API}`, {
      body: { priority: 'alarm', message: 'Test alert', ...body }
    })
    expect(reply.status, JSON.stringify(reply.body)).to.equal(201)
    return reply.body as Alert
  }

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alerts-api-'))
    app = new FakeApp(tempDir)
    api = new AlertsApi(app as unknown as AlertsApplication)
    await api.start()
  })

  afterEach(async () => {
    await api.stop()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('start', () => {
    it('registers every route of the alerts surface', () => {
      expect(Array.from(app.routes.keys()).sort()).to.deep.equal(
        [
          `GET ${API}`,
          `GET ${API}/history`,
          `GET ${API}/status`,
          `GET ${API}/:id`,
          `POST ${API}`,
          `POST ${API}/silence-all`,
          `POST ${API}/:id/acknowledge`,
          `POST ${API}/:id/escalate`,
          `POST ${API}/:id/silence`,
          `PUT ${API}/:id/condition`
        ].sort()
      )
    })

    it('keeps its database under serverState', async () => {
      await raise({ path: 'test.alert' })

      expect(
        fs.existsSync(path.join(tempDir, 'serverState', 'alerts', 'alerts.db'))
      ).to.equal(true)
    })

    it('restores the active set of a previous run', async () => {
      const alert = await raise({ path: 'engine.overheat' })
      await api.stop()

      api = new AlertsApi(app as unknown as AlertsApplication)
      await api.start()

      const reply = await call(`GET ${API}`)
      expect((reply.body as Alert[]).map((a) => a.id)).to.deep.equal([alert.id])
    })
  })

  describe('raise', () => {
    it('creates an alert and returns it with 201', async () => {
      const alert = await raise({
        path: 'propulsion.port.oilPressureLow',
        references: ['propulsion.port.oilPressure']
      })

      expect(alert.path).to.equal('propulsion.port.oilPressureLow')
      expect(alert.references).to.deep.equal(['propulsion.port.oilPressure'])
      expect(alert.state).to.equal('unacknowledged')
    })

    it('updates the existing alert when the path repeats', async () => {
      const first = await raise({ path: 'engine.overheat' })
      const second = await raise({ path: 'engine.overheat', message: 'hotter' })

      expect(second.id).to.equal(first.id)
      expect((await call(`GET ${API}`)).body).to.have.lengthOf(1)
    })

    it('rejects a body that is missing or misuses a field', async () => {
      const bad: Array<Record<string, unknown>> = [
        { path: undefined },
        { path: '' },
        { path: 42 },
        { path: 'a..b' },
        { path: 'a.__proto__.b' },
        { path: 'a'.repeat(300) },
        { path: 'ok.path', priority: undefined },
        { path: 'ok.path', priority: 'urgent' },
        { path: 'ok.path', message: undefined },
        { path: 'ok.path', message: '' },
        { path: 'ok.path', references: 'not-an-array' },
        { path: 'ok.path', references: [42] }
      ]

      for (const body of bad) {
        const reply = await call(`POST ${API}`, {
          body: { priority: 'alarm', message: 'Test alert', ...body }
        })
        expect(reply.status, JSON.stringify(body)).to.equal(400)
        expect(reply.body.state).to.equal('FAILED')
      }
    })

    it('keeps the data a caller attaches', async () => {
      const alert = await raise({
        path: 'engine.overheat',
        data: { rpm: 4200, coolant: 'low' }
      })

      expect(alert.data).to.deep.equal({ rpm: 4200, coolant: 'low' })
    })

    it('refuses a description larger than the subsystem carries', async () => {
      // Every alert is held in memory, written to the database and pushed to
      // every subscriber, so an unbounded field costs three times over.
      const bad: Array<Record<string, unknown>> = [
        { message: 'x'.repeat(1001) },
        { group: 'g'.repeat(101) },
        { references: Array.from({ length: 51 }, () => 'a.b') },
        { data: { blob: 'x'.repeat(4097) } }
      ]

      for (const body of bad) {
        const reply = await call(`POST ${API}`, {
          body: {
            path: 'engine.overheat',
            priority: 'alarm',
            message: 'Hot',
            ...body
          }
        })
        expect(reply.status, JSON.stringify(Object.keys(body))).to.equal(400)
      }
    })

    it('refuses a raise past the active alert cap', async function () {
      this.timeout(CAP_TEST_TIMEOUT_MS)
      // The cap is the manager's; the route only maps its error to a status.
      const replies: Reply[] = []
      const logged = console.error
      console.error = () => {}
      try {
        for (let i = 0; i < RAISES_PAST_CAP; i++) {
          replies.push(
            await call(`POST ${API}`, {
              body: {
                path: `test.alert${String(i)}`,
                priority: 'caution',
                message: 'x'
              }
            })
          )
        }
      } finally {
        console.error = logged
      }

      expect(replies[RAISES_PAST_CAP - 2].status).to.equal(201)
      // Every raise here is a caution, so nothing outranks anything and the
      // set stays full.
      expect(replies[RAISES_PAST_CAP - 1].status).to.equal(409)
      expect(replies[RAISES_PAST_CAP - 1].body.message).to.include('limit')
    })
  })

  describe('list', () => {
    it('filters by state, priority and staleness', async () => {
      const acked = await raise({ path: 'one', priority: 'warning' })
      await raise({ path: 'two', priority: 'alarm' })
      await call(`POST ${API}/:id/acknowledge`, { params: { id: acked.id } })

      const byState = await call(`GET ${API}`, {
        query: { state: 'acknowledged' }
      })
      expect((byState.body as Alert[]).map((a) => a.path)).to.deep.equal([
        'one'
      ])

      const byPriority = await call(`GET ${API}`, {
        query: { priority: 'alarm' }
      })
      expect((byPriority.body as Alert[]).map((a) => a.path)).to.deep.equal([
        'two'
      ])

      const stale = await call(`GET ${API}`, { query: { stale: 'true' } })
      expect(stale.body).to.have.lengthOf(0)

      // Without this, the assertion above also passes for a filter that
      // returns nothing whatever it is asked for.
      const fresh = await call(`GET ${API}`, { query: { stale: 'false' } })
      expect((fresh.body as Alert[]).map((a) => a.path)).to.have.members([
        'one',
        'two'
      ])
    })

    it('rejects a filter value that is not a known state or priority', async () => {
      expect(
        (await call(`GET ${API}`, { query: { state: 'asleep' } })).status
      ).to.equal(400)
      expect(
        (await call(`GET ${API}`, { query: { priority: 'urgent' } })).status
      ).to.equal(400)
      expect(
        (await call(`GET ${API}`, { query: { stale: 'maybe' } })).status
      ).to.equal(400)
    })

    it('orders the list the way an operator reads it', async () => {
      const older = await raise({ path: 'older.alarm', priority: 'alarm' })
      const newer = await raise({ path: 'newer.alarm', priority: 'alarm' })
      const warning = await raise({ path: 'a.warning', priority: 'warning' })
      const emergency = await raise({
        path: 'the.emergency',
        priority: 'emergency'
      })
      // Acknowledging moves an alert below every unacknowledged one.
      await call(`POST ${API}/:id/acknowledge`, { params: { id: newer.id } })

      const listed = ((await call(`GET ${API}`)).body as Alert[]).map(
        (a) => a.path
      )

      expect(listed).to.deep.equal([
        'the.emergency',
        'older.alarm',
        'a.warning',
        'newer.alarm'
      ])
      expect(emergency.priority).to.equal('emergency')
      expect(older.state).to.equal('unacknowledged')
      expect(warning.priority).to.equal('warning')
    })

    it('keeps an acknowledged emergency above everything else', async () => {
      const emergency = await raise({
        path: 'the.emergency',
        priority: 'emergency'
      })
      await raise({ path: 'an.alarm', priority: 'alarm' })
      await call(`POST ${API}/:id/acknowledge`, {
        params: { id: emergency.id }
      })

      const listed = ((await call(`GET ${API}`)).body as Alert[]).map(
        (a) => a.path
      )

      expect(listed).to.deep.equal(['the.emergency', 'an.alarm'])
    })

    it('puts the most recent first among equals', async () => {
      await raise({ path: 'older.alarm', priority: 'alarm' })
      // The tie-break is a timestamp, so the two raises must not share one.
      await new Promise((resolve) => setTimeout(resolve, 2))
      await raise({ path: 'newer.alarm', priority: 'alarm' })

      const listed = ((await call(`GET ${API}`)).body as Alert[]).map(
        (a) => a.path
      )

      expect(listed).to.deep.equal(['newer.alarm', 'older.alarm'])
    })

    it('does not reorder when an alert is silenced', async () => {
      await raise({ path: 'first.alarm', priority: 'alarm' })
      await new Promise((resolve) => setTimeout(resolve, 2))
      const second = await raise({ path: 'second.alarm', priority: 'alarm' })
      const before = ((await call(`GET ${API}`)).body as Alert[]).map(
        (a) => a.path
      )
      // The newest is on top; silencing it must not push it down.
      expect(before[0]).to.equal('second.alarm')

      await call(`POST ${API}/:id/silence`, { params: { id: second.id } })

      const after = ((await call(`GET ${API}`)).body as Alert[]).map(
        (a) => a.path
      )
      expect(after).to.deep.equal(before)
    })
  })

  describe('single alert', () => {
    it('returns one alert and 404s an unknown id', async () => {
      const alert = await raise({ path: 'engine.overheat' })

      const found = await call(`GET ${API}/:id`, { params: { id: alert.id } })
      expect((found.body as Alert).path).to.equal('engine.overheat')

      const missing = await call(`GET ${API}/:id`, { params: { id: 'nope' } })
      expect(missing.status).to.equal(404)
    })
  })

  describe('lifecycle routes', () => {
    it('acknowledges an alert', async () => {
      const alert = await raise({ path: 'engine.overheat' })

      const reply = await call(`POST ${API}/:id/acknowledge`, {
        params: { id: alert.id }
      })

      expect(reply.status).to.equal(200)
      expect(reply.body.alert.state).to.equal('acknowledged')
    })

    it('records who acknowledged and who cleared', async () => {
      const alert = await raise({ path: 'engine.overheat' })

      const acknowledged = await call(`POST ${API}/:id/acknowledge`, {
        params: { id: alert.id }
      })
      // No security in this harness, so no principal: the field must still be
      // wired through rather than dropped.
      expect(acknowledged.body.alert).to.have.property('acknowledgedBy')

      await call(`PUT ${API}/:id/condition`, {
        params: { id: alert.id },
        body: { active: false }
      })
      const trail = (await call(`GET ${API}/history`)).body as {
        entries: Array<{ eventType: string; $source: string }>
      }
      const cleared = trail.entries.find((e) => e.eventType === 'clear')
      // An operator's clear is the operator's, not the device's.
      expect(cleared?.$source).to.equal('alerts-api')
    })

    it('escalates an alert and refuses a de-escalation', async () => {
      const alert = await raise({
        path: 'engine.overheat',
        priority: 'warning'
      })

      const up = await call(`POST ${API}/:id/escalate`, {
        params: { id: alert.id },
        body: { priority: 'alarm' }
      })
      expect(up.status).to.equal(200)
      expect((up.body as Alert).priority).to.equal('alarm')

      const down = await call(`POST ${API}/:id/escalate`, {
        params: { id: alert.id },
        body: { priority: 'warning' }
      })
      expect(down.status).to.equal(409)

      const bad = await call(`POST ${API}/:id/escalate`, {
        params: { id: alert.id },
        body: { priority: 'urgent' }
      })
      expect(bad.status).to.equal(400)
    })

    it('silences an alert for a duration in seconds', async () => {
      const alert = await raise({ path: 'engine.overheat' })

      const reply = await call(`POST ${API}/:id/silence`, {
        params: { id: alert.id },
        body: { duration: 30 }
      })

      expect(reply.status).to.equal(200)
      expect((reply.body as Alert).silenced).to.equal(true)

      const bad = await call(`POST ${API}/:id/silence`, {
        params: { id: alert.id },
        body: { duration: -1 }
      })
      expect(bad.status).to.equal(400)
    })

    it('silences every alert at once', async () => {
      await raise({ path: 'one' })
      await raise({ path: 'two' })

      const reply = await call(`POST ${API}/silence-all`)

      expect(reply.status).to.equal(200)
      expect(
        ((await call(`GET ${API}`)).body as Alert[]).every((a) => a.silenced)
      ).to.equal(true)
    })

    it('clears a condition and rejects a body that is not a boolean', async () => {
      const alert = await raise({ path: 'engine.overheat' })

      const cleared = await call(`PUT ${API}/:id/condition`, {
        params: { id: alert.id },
        body: { active: false }
      })
      expect(cleared.status).to.equal(200)
      expect(cleared.body.alert.state).to.equal('rtn-unacknowledged')

      const bad = await call(`PUT ${API}/:id/condition`, {
        params: { id: alert.id },
        body: { active: 'no' }
      })
      expect(bad.status).to.equal(400)
    })

    it('404s every lifecycle route for an unknown id', async () => {
      const calls = [
        call(`POST ${API}/:id/acknowledge`, { params: { id: 'nope' } }),
        call(`POST ${API}/:id/silence`, { params: { id: 'nope' } }),
        call(`POST ${API}/:id/escalate`, {
          params: { id: 'nope' },
          body: { priority: 'alarm' }
        }),
        call(`PUT ${API}/:id/condition`, {
          params: { id: 'nope' },
          body: { active: false }
        })
      ]

      for (const reply of await Promise.all(calls)) {
        expect(reply.status).to.equal(404)
      }
    })
  })

  describe('history', () => {
    it('returns the audit trail with its total', async () => {
      const alert = await raise({ path: 'engine.overheat' })
      await call(`POST ${API}/:id/acknowledge`, { params: { id: alert.id } })

      const reply = await call(`GET ${API}/history`)

      expect(reply.status).to.equal(200)
      expect(reply.body.total).to.equal(2)
      // Newest first, as the store serves it: an operator reading the trail
      // wants the last thing that happened at the top.
      expect(
        reply.body.entries.map((e: { eventType: string }) => e.eventType)
      ).to.deep.equal(['acknowledge', 'raise'])
    })

    it('rejects paging and date parameters it cannot use', async () => {
      for (const query of [
        { limit: 'ten' },
        { limit: '-1' },
        { offset: '1.5' },
        { from: 'yesterday' },
        { to: 'tomorrow' },
        { eventType: 'exploded' }
      ]) {
        expect(
          (await call(`GET ${API}/history`, { query })).status,
          JSON.stringify(query)
        ).to.equal(400)
      }
    })
  })

  describe('status', () => {
    it('reports a healthy store', async () => {
      const reply = await call(`GET ${API}/status`)

      expect(reply.status).to.equal(200)
      expect(reply.body).to.deep.equal({ store: { degraded: false } })
    })
  })
})
