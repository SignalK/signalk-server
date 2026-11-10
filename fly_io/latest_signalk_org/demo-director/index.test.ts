import { strict as assert } from 'node:assert'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it, mock } from 'node:test'
import type { Plugin, ServerAPI } from '@signalk/server-api'
import { magvar } from 'magvar'
import director, { DEMO_LOGIN } from './index.ts'

const FINAL_WAYPOINT = { latitude: 53.296, longitude: 5.086 }
// about 110 m south of the final waypoint
const NEAR_FINAL = { latitude: 53.295, longitude: 5.086 }
// about 1.1 km south of it
const FAR_FROM_FINAL = { latitude: 53.286, longitude: 5.086 }

interface RouteState {
  pointIndex: number
  pointTotal: number
  reverse: boolean
}

function fakeApp(
  route: RouteState,
  position: typeof FINAL_WAYPOINT,
  selfValues: Record<string, unknown> = {},
  configDir = tmpdir()
) {
  const activated: unknown[] = []
  const messages: unknown[] = []
  const app = {
    getSelfPath: (path: string) => selfValues[path] ?? position,
    handleMessage: (_id: string, delta: unknown) => {
      messages.push(delta)
    },
    setPluginStatus: () => {},
    getDataDirPath: () => join(configDir, 'plugin-config-data', 'director'),
    error: (msg: string) => assert.fail(msg),
    getCourse: async () => ({
      activeRoute: { href: '/resources/routes/demo', ...route },
      nextPoint: { position: FINAL_WAYPOINT }
    }),
    activateRoute: async (dest: unknown) => {
      activated.push(dest)
    }
  }
  return { app: app as unknown as ServerAPI, activated, messages }
}

describe('demo director', () => {
  let plugin: Plugin | undefined

  afterEach(() => {
    plugin?.stop()
    mock.reset()
    mock.timers.reset()
  })

  async function runFirstTick(app: ServerAPI) {
    plugin = director(app)
    await plugin.start({}, () => {})
    await new Promise((resolve) => setImmediate(resolve))
  }

  for (const reverse of [false, true]) {
    it(`turns a ${reverse ? 'reversed' : 'forward'} route round near its final waypoint`, async () => {
      const { app, activated } = fakeApp(
        { pointIndex: 4, pointTotal: 5, reverse },
        NEAR_FINAL
      )
      await runFirstTick(app)
      assert.deepEqual(activated, [
        { href: '/resources/routes/demo', reverse: !reverse, pointIndex: 1 }
      ])
    })
  }

  function published(messages: unknown[], path: string) {
    const values = messages.flatMap(
      (m) =>
        (m as { updates: { values: { path: string; value: unknown }[] }[] })
          .updates[0].values
    )
    return values.filter((v) => v.path === path).map((v) => v.value)
  }

  it('publishes the magnetic variation at the boat on the first tick', async () => {
    const { app, messages } = fakeApp(
      { pointIndex: 3, pointTotal: 5, reverse: false },
      NEAR_FINAL
    )
    await runFirstTick(app)
    assert.deepEqual(published(messages, 'navigation.magneticVariation'), [
      (magvar(NEAR_FINAL.latitude, NEAR_FINAL.longitude) * Math.PI) / 180
    ])
  })

  it('publishes a Pi health reading in Signal K units', async () => {
    const { app, messages } = fakeApp(
      { pointIndex: 3, pointTotal: 5, reverse: false },
      NEAR_FINAL
    )
    await runFirstTick(app)
    const [kelvin] = published(messages, 'environment.rpi.cpu.temperature')
    assert.ok(typeof kelvin === 'number' && kelvin > 320 && kelvin < 335)
    const [cpu] = published(messages, 'environment.rpi.cpu.utilisation')
    assert.ok(typeof cpu === 'number' && cpu > 0 && cpu < 1)
  })

  it('fills in a week of Pi history, slowly, after the first live readings', async () => {
    mock.timers.enable({
      apis: ['Date', 'setInterval', 'setTimeout'],
      now: 1e12
    })
    const { app, messages } = fakeApp(
      { pointIndex: 3, pointTotal: 5, reverse: false },
      NEAR_FINAL,
      {
        'steering.autopilot.mode.value': 'route',
        'steering.autopilot.engaged.value': true
      }
    )
    plugin = director(app)
    await plugin.start({}, () => {})
    // timers set while ticking run from the next tick on
    for (let s = 0; s < 10 * 60; s++) mock.timers.tick(1000)
    const HOUR = 3600 * 1000
    // the history starts 30 s after the plugin
    const START = 1e12 + 30 * 1000
    const readings = messages.flatMap((m) => {
      const update = (
        m as {
          updates: {
            timestamp?: string
            values: { path: string; value: number }[]
          }[]
        }
      ).updates[0]
      const uptime = update.values.find(
        (v) => v.path === 'environment.rpi.uptime'
      )
      return uptime && update.timestamp
        ? [{ time: Date.parse(update.timestamp), uptime: uptime.value }]
        : []
    })
    const history = readings.filter((r) => r.time < 1e12)
    assert.equal(history.length, 144 + 144)
    assert.equal(history[0].time, START - 7 * 24 * HOUR)
    assert.equal(history[144].time, START - 24 * HOUR)
    for (let i = 1; i < history.length; i++) {
      assert.ok(history[i].time > history[i - 1].time)
      assert.ok(history[i].uptime > history[i - 1].uptime)
    }
    assert.ok(history[0].uptime > 0)
    // a live reading came first, so the recorder knows the paths
    assert.ok(readings[0].time >= 1e12)
    for (const core of [0, 1, 2, 3]) {
      for (const value of published(
        messages,
        `environment.rpi.cpu.core.${core}.utilisation`
      )) {
        assert.ok(typeof value === 'number' && value >= 0 && value <= 1)
      }
    }
  })

  it('publishes polar speeds that match the boat speed and the ratio', async () => {
    const stw = 3
    const { app, messages } = fakeApp(
      { pointIndex: 3, pointTotal: 5, reverse: false },
      NEAR_FINAL,
      {
        'navigation.speedThroughWater.value': stw,
        'environment.wind.angleTrueWater.value': Math.PI / 3
      }
    )
    await runFirstTick(app)
    const [ratio] = published(messages, 'performance.polarSpeedRatio')
    const [polarSpeed] = published(messages, 'performance.polarSpeed')
    assert.ok(typeof ratio === 'number' && ratio > 0.8 && ratio < 1.05)
    assert.ok(typeof polarSpeed === 'number')
    assert.ok(Math.abs(polarSpeed * ratio - stw) < 1e-9)
    const [vmgRatio] = published(
      messages,
      'performance.polarVelocityMadeGoodRatio'
    )
    const [polarVmg] = published(messages, 'performance.polarVelocityMadeGood')
    assert.ok(typeof vmgRatio === 'number' && typeof polarVmg === 'number')
    assert.ok(Math.abs(polarVmg * vmgRatio - stw * 0.5) < 1e-9)
  })

  it('publishes no polar performance without boat speed and wind', async () => {
    const { app, messages } = fakeApp(
      { pointIndex: 3, pointTotal: 5, reverse: false },
      NEAR_FINAL
    )
    await runFirstTick(app)
    assert.deepEqual(published(messages, 'performance.polarSpeedRatio'), [])
  })

  it('keeps the route while the boat is short of the final waypoint', async () => {
    const { app, activated } = fakeApp(
      { pointIndex: 4, pointTotal: 5, reverse: false },
      FAR_FROM_FINAL
    )
    await runFirstTick(app)
    assert.deepEqual(activated, [])
  })

  it('keeps the route before its final leg', async () => {
    const { app, activated } = fakeApp(
      { pointIndex: 3, pointTotal: 5, reverse: false },
      NEAR_FINAL
    )
    await runFirstTick(app)
    assert.deepEqual(activated, [])
  })

  describe('when a visitor steers', () => {
    const FIVE_MINUTES = 5 * 60 * 1000
    const TICK = 5000

    function steeredBy(mode: string, engaged = true) {
      return {
        'steering.autopilot.mode.value': mode,
        'steering.autopilot.engaged.value': engaged,
        'steering.autopilot.state.value': engaged ? 'auto' : 'standby',
        'steering.autopilot.target.value': 1.2
      }
    }

    function fakeServer() {
      const calls: { url: string; init?: RequestInit }[] = []
      mock.method(
        globalThis,
        'fetch',
        async (url: string, init?: RequestInit) => {
          calls.push({ url, init })
          return url.endsWith('/auth/login')
            ? Response.json({ token: 'demo-token' })
            : Response.json({ state: 'COMPLETED' })
        }
      )
      return calls
    }

    async function startAt(app: ServerAPI) {
      mock.timers.enable({ apis: ['Date', 'setInterval'] })
      plugin = director(app)
      await plugin.start({}, () => {})
    }

    async function advance(ms: number) {
      mock.timers.tick(ms)
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setImmediate(resolve))
      }
    }

    it('takes the boat back to the route after five idle minutes', async () => {
      const configDir = mkdtempSync(join(tmpdir(), 'director-'))
      const userData = join(
        configDir,
        'applicationData/users',
        DEMO_LOGIN.username
      )
      mkdirSync(userData, { recursive: true })
      const calls = fakeServer()
      const { app } = fakeApp(
        { pointIndex: 2, pointTotal: 5, reverse: false },
        FAR_FROM_FINAL,
        steeredBy('compass'),
        configDir
      )
      await startAt(app)
      await advance(FIVE_MINUTES - TICK)
      assert.equal(calls.length, 0)
      await advance(TICK)
      assert.deepEqual(
        calls.map((c) => c.url.replace(/^http:\/\/[^/]+/, '')),
        [
          '/signalk/v1/auth/login',
          '/signalk/v2/api/vessels/self/autopilots/_default/courseCurrentPoint'
        ]
      )
      assert.deepEqual(JSON.parse(String(calls[0].init?.body)), DEMO_LOGIN)
      assert.deepEqual(calls[1].init?.headers, {
        Authorization: 'Bearer demo-token'
      })
      assert.equal(existsSync(userData), false)
    })

    it('waits while the visitor keeps adjusting the autopilot', async () => {
      const calls = fakeServer()
      const values = steeredBy('compass')
      const { app } = fakeApp(
        { pointIndex: 2, pointTotal: 5, reverse: false },
        FAR_FROM_FINAL,
        values
      )
      await startAt(app)
      await advance(FIVE_MINUTES - TICK)
      values['steering.autopilot.target.value'] = 1.4
      await advance(FIVE_MINUTES - TICK)
      assert.equal(calls.length, 0)
    })

    it('leaves a boat alone that already follows the route', async () => {
      const calls = fakeServer()
      const { app } = fakeApp(
        { pointIndex: 2, pointTotal: 5, reverse: false },
        FAR_FROM_FINAL,
        steeredBy('route')
      )
      await startAt(app)
      await advance(2 * FIVE_MINUTES)
      assert.equal(calls.length, 0)
    })

    it('takes back a boat left in standby', async () => {
      const calls = fakeServer()
      const { app } = fakeApp(
        { pointIndex: 2, pointTotal: 5, reverse: false },
        FAR_FROM_FINAL,
        steeredBy('route', false)
      )
      await startAt(app)
      await advance(FIVE_MINUTES)
      assert.equal(calls.length, 2)
    })
  })
})
