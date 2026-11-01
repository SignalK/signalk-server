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

function fakeApp(route: RouteState, position: typeof FINAL_WAYPOINT) {
  const activated: unknown[] = []
  const messages: unknown[] = []
  const app = {
    getSelfPath: () => position,
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

  it('publishes the magnetic variation at the boat on the first tick', async () => {
    const { app, messages } = fakeApp(
      { pointIndex: 3, pointTotal: 5, reverse: false },
      NEAR_FINAL
    )
    await runFirstTick(app)
    assert.deepEqual(messages, [
      {
        updates: [
          {
            values: [
              {
                path: 'navigation.magneticVariation',
                value:
                  (magvar(NEAR_FINAL.latitude, NEAR_FINAL.longitude) *
                    Math.PI) /
                  180
              }
            ]
          }
        ]
      }
    ])
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
