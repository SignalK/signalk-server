import { expect } from 'chai'
import * as fs from 'fs'
import * as path from 'path'
import type { Delta } from '@signalk/server-api'
import { freeport } from './ts-servertestutilities'
import {
  WsPromiser,
  startServerP,
  serverTestConfigDirectory
} from './servertestutilities'

const CONFIG_DIR = serverTestConfigDirectory()
const API = '/signalk/v2/api/alerts'

/** Longest an ingress round trip may take before the test gives up. */
const INGRESS_TIMEOUT_MS = 5000
const INGRESS_POLL_MS = 20

/**
 * Wait until `read` reports what the test is about to assert.
 *
 * Delta ingress is handed off the chain, so a fixed sleep either wastes time
 * or, on a loaded runner, expires before the manager has applied anything.
 */
async function eventually<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean
): Promise<T> {
  const deadline = Date.now() + INGRESS_TIMEOUT_MS
  for (;;) {
    const value = await read()
    if (done(value)) {
      return value
    }
    if (Date.now() > deadline) {
      return value
    }
    await new Promise((resolve) => setTimeout(resolve, INGRESS_POLL_MS))
  }
}

/**
 * The alerts subsystem on a running server: REST, the delta mirror, the v1
 * tree and the plugin surface, and what survives a restart.
 */
/** Only what this suite uses of a started server. */
interface RunningServer {
  stop: () => Promise<unknown>
}

/** Only what this suite uses of a WebSocket promiser. */
interface MessageCollector {
  parsedMessages: () => Delta[]
  nthMessage: (n: number) => Promise<unknown>
}

describe('alerts end to end', function () {
  let server: RunningServer
  let port: number
  let url: string

  const get = (route: string) => fetch(`${url}${route}`)
  const post = (route: string, body: object = {}) =>
    fetch(`${url}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

  const wsUrl = () =>
    `${url.replace('http', 'ws')}/signalk/v1/stream?subscribe=self&metaDeltas=none&sendCachedValues=false`

  interface AlertValue {
    path: string
    value: { state?: string; message?: string } | null
  }

  /** Alert values carried by the messages a WS promiser collected. */
  const alertValues = (ws: MessageCollector): AlertValue[] =>
    ws
      .parsedMessages()
      .slice(1)
      .flatMap((message) => message.updates ?? [])
      .flatMap((update) =>
        'values' in update ? (update.values as unknown as AlertValue[]) : []
      )
      .filter((value) => value.path.startsWith('alerts.'))

  /** Boot on the same port and config directory, keeping stored state. */
  const startServer = async () => {
    server = await startServerP(port, false, {
      settings: { interfaces: { plugins: true } }
    })
  }

  const sendDelta = (delta: object) =>
    fetch(`${url}/signalk/v1/api/_test/delta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(delta)
    })

  before(async function () {
    fs.rmSync(path.join(CONFIG_DIR, 'serverState', 'alerts'), {
      recursive: true,
      force: true
    })
    port = await freeport()
    url = `http://127.0.0.1:${port}`
    await startServer()
  })

  after(async function () {
    await server.stop()
    fs.rmSync(path.join(CONFIG_DIR, 'serverState', 'alerts'), {
      recursive: true,
      force: true
    })
  })

  it('mirrors a raise into the delta stream and the v1 tree', async function () {
    const ws = new WsPromiser(wsUrl())
    await ws.nthMessage(1)

    const raised = await post(`${API}`, {
      path: 'propulsion.port.oilPressureLow',
      priority: 'alarm',
      message: 'Oil pressure low'
    })
    expect(raised.status).to.equal(201)
    await ws.nthMessage(2)

    const mirrored = alertValues(ws).filter(
      (value) => value.path === 'alerts.propulsion.port.oilPressureLow'
    )
    expect(mirrored).to.have.lengthOf(1)

    const tree = (await (
      await fetch(
        `${url}/signalk/v1/api/vessels/self/alerts/propulsion/port/oilPressureLow`
      )
    ).json()) as { value: { message: string } }
    expect(tree.value.message).to.equal('Oil pressure low')
  })

  it('announces an acknowledgement and reorders the list behind it', async function () {
    await post(`${API}`, {
      path: 'engine.overheat',
      priority: 'alarm',
      message: 'Engine hot'
    })
    const before = (await (await get(API)).json()) as Array<{ path: string }>
    const acknowledged = before.find(
      (alert) => alert.path === 'propulsion.port.oilPressureLow'
    ) as unknown as { id: string }

    const ws = new WsPromiser(wsUrl())
    await ws.nthMessage(1)
    const response = await post(`${API}/${acknowledged.id}/acknowledge`)
    expect(response.status).to.equal(200)
    await ws.nthMessage(2)

    const announced = alertValues(ws).map((value) => value.value?.state)
    expect(announced).to.include('acknowledged')

    // An acknowledged alarm sits below every unacknowledged one.
    const after = (await (await get(API)).json()) as Array<{ path: string }>
    expect(after[after.length - 1].path).to.equal(
      'propulsion.port.oilPressureLow'
    )
  })

  it('shows a device alert on REST and in the v1 tree', async function () {
    await sendDelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'n2k-device',
          timestamp: '2026-09-01T12:00:00.000Z',
          values: [
            {
              path: 'alerts.electrical.batteryLow',
              value: { priority: 'warning', message: 'Battery low' }
            }
          ]
        }
      ]
    })
    const listed = await eventually(
      async () =>
        (await (await get(API)).json()) as Array<{
          path: string
          $source: string
        }>,
      (alerts) => alerts.some((alert) => alert.path === 'electrical.batteryLow')
    )
    const raisedByDevice = listed.find(
      (alert) => alert.path === 'electrical.batteryLow'
    )
    expect(raisedByDevice?.$source).to.equal('n2k-device')

    // The v1 tree is the third surface here; the plugin surface reads the
    // same set in pluginApi.test.ts, where the fixture plugins live.
    const tree = (await (
      await fetch(
        `${url}/signalk/v1/api/vessels/self/alerts/electrical/batteryLow`
      )
    ).json()) as { value: { message: string } }
    expect(tree.value.message).to.equal('Battery low')
  })

  it('restores the active set and keeps it clearable after a restart', async function () {
    const before = (await (await get(API)).json()) as Array<{
      path: string
      state: string
    }>
    const acknowledged = before.filter(
      (alert) => alert.state === 'acknowledged'
    )
    expect(acknowledged).to.have.lengthOf(1)

    await server.stop()
    await startServer()

    // Republication happens as the server starts, so a subscriber that asks
    // for cached values is what "a fresh subscriber sees it" means.
    const ws = new WsPromiser(
      `${url.replace('http', 'ws')}/signalk/v1/stream?subscribe=self&metaDeltas=none`
    )
    await ws.nthMessage(1)
    const restored = (await (await get(API)).json()) as Array<{
      path: string
      state: string
    }>
    expect(restored.map((alert) => alert.path)).to.have.members(
      before.map((alert) => alert.path)
    )
    expect(
      restored.find((alert) => alert.path === 'propulsion.port.oilPressureLow')
        ?.state
    ).to.equal('acknowledged')

    const republished = alertValues(ws).map((value) => value.path)
    expect(republished).to.include('alerts.propulsion.port.oilPressureLow')

    await sendDelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'n2k-device',
          timestamp: '2026-09-01T12:05:00.000Z',
          values: [{ path: 'alerts.electrical.batteryLow', value: null }]
        }
      ]
    })
    const cleared = await eventually(
      async () =>
        (await (await get(API)).json()) as Array<{
          path: string
          state: string
        }>,
      (alerts) =>
        alerts.find((alert) => alert.path === 'electrical.batteryLow')
          ?.state === 'rtn-unacknowledged'
    )
    expect(
      cleared.find((alert) => alert.path === 'electrical.batteryLow')?.state
    ).to.equal('rtn-unacknowledged')
  })
})
