import { strict as assert } from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import type { Plugin, ServerAPI } from '@signalk/server-api'
import { magvar } from 'magvar'
import director from './index.ts'

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
  selfValues: Record<string, number> = {}
) {
  const activated: unknown[] = []
  const messages: unknown[] = []
  const app = {
    getSelfPath: (path: string) => selfValues[path] ?? position,
    handleMessage: (_id: string, delta: unknown) => {
      messages.push(delta)
    },
    setPluginStatus: () => {},
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

  afterEach(() => plugin?.stop())

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

  it('publishes a charging house battery', async () => {
    const { app, messages } = fakeApp(
      { pointIndex: 3, pointTotal: 5, reverse: false },
      NEAR_FINAL
    )
    await runFirstTick(app)
    const [charge] = published(
      messages,
      'electrical.batteries.house.capacity.stateOfCharge'
    )
    assert.ok(typeof charge === 'number' && charge >= 0.83 && charge < 0.84)
    const [current] = published(messages, 'electrical.batteries.house.current')
    assert.ok(typeof current === 'number' && current > 0)
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
})
