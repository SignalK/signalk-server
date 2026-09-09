import { expect } from 'chai'
import type { Delta } from '@signalk/server-api'
import { startServer } from '../../ts-servertestutilities'
import { WsPromiser } from '../../servertestutilities'

/**
 * The alerts API in a running server: present, announced, and persisting.
 * The route-level behaviour is covered without a server in routes.test.ts.
 */
/**
 * A delta as a device puts it on the wire. Not `Delta`: that type's identity
 * fields are branded, and a fixture writing plain strings would need a cast
 * per field to satisfy it.
 */
interface WireDelta {
  context: string
  updates: Array<{
    $source: string
    timestamp: string
    values: Array<{ path: string; value: unknown }>
  }>
}

const INGRESS_TIMEOUT_MS = 5000
const INGRESS_POLL_MS = 20

describe('alerts API in a running server', () => {
  let stop: () => Promise<unknown>
  let get: (path: string) => Promise<Response>
  let getFeatures: () => Promise<Response>
  let post: (path: string, body: object) => Promise<Response>
  let host: string
  let sendADelta: (delta: WireDelta) => Promise<unknown>

  before(async function () {
    const server = await startServer()
    stop = () => server.stop()
    get = server.get
    // Feature discovery sits outside the /api prefix the other helpers use.
    getFeatures = () =>
      fetch(server.host.replace(/\/$/, '') + '/signalk/v2/features')
    post = server.post
    host = server.host
    sendADelta = server.sendADelta
  })

  after(async function () {
    await stop()
  })

  it('announces itself among the server features', async () => {
    const features = await (await getFeatures()).json()

    expect(features.apis).to.include('alerts')
  })

  it('raises an alert and lists it back', async () => {
    const raised = await post('/alerts', {
      path: 'propulsion.port.oilPressureLow',
      priority: 'alarm',
      message: 'Oil pressure low'
    })
    expect(raised.status).to.equal(201)

    const listed = await (await get('/alerts')).json()
    expect(listed.map((alert: { path: string }) => alert.path)).to.deep.equal([
      'propulsion.port.oilPressureLow'
    ])
  })

  it('mirrors a raise onto the alerts path of the model', async () => {
    const ws = new WsPromiser(
      host.replace('http', 'ws') +
        '/signalk/v1/stream?subscribe=self&metaDeltas=none&sendCachedValues=false'
    )
    await ws.nthMessage(1) // hello

    await post('/alerts', {
      path: 'steering.rudderStuck',
      priority: 'warning',
      message: 'Rudder not responding'
    })
    await ws.nthMessage(2)

    const mirrored = ws
      .parsedMessages()
      .slice(1)
      .flatMap((message: Delta) => message.updates ?? [])
      .flatMap((update) => ('values' in update ? update.values : []))
      .filter((value) => value.path === 'alerts.steering.rudderStuck')
    expect(mirrored).to.have.lengthOf(1)
    expect((mirrored[0].value as { message: string }).message).to.equal(
      'Rudder not responding'
    )
  })

  it('manages an alert a device raises by delta, next to notifications', async () => {
    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'n2k-device',
          timestamp: '2026-09-01T12:00:00.000Z',
          values: [
            {
              path: 'alerts.electrical.batteryLow',
              value: { priority: 'warning', message: 'Battery low' }
            },
            {
              path: 'notifications.electrical.batteries.house.voltage',
              value: { state: 'alarm', message: 'Low voltage' }
            }
          ]
        }
      ]
    })
    // Ingress is handed off the delta chain, so wait for the result rather
    // than for a fixed time a loaded runner can outlast.
    const deadline = Date.now() + INGRESS_TIMEOUT_MS
    let alerts: Array<{ path: string; $source: string }> = []
    for (;;) {
      alerts = (await (await get('/alerts')).json()) as Array<{
        path: string
        $source: string
      }>
      if (
        alerts.some((alert) => alert.path === 'electrical.batteryLow') ||
        Date.now() > deadline
      ) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, INGRESS_POLL_MS))
    }
    expect(alerts.map((alert) => alert.path)).to.include(
      'electrical.batteryLow'
    )
    expect(
      alerts.find((alert) => alert.path === 'electrical.batteryLow')?.$source
    ).to.equal('n2k-device')

    const notifications = await (await get('/notifications')).json()
    expect(JSON.stringify(notifications)).to.include('Low voltage')
  })

  it('serves the static routes rather than reading them as an alert id', async () => {
    // Express matches in registration order, so /history reaching the :id
    // handler is a real hazard and only a real router can show it.
    const history = await (await get('/alerts/history')).json()

    expect(history).to.have.property('entries')
    expect(history).to.have.property('total')
  })

  it('reports a healthy store', async () => {
    const status = await (await get('/alerts/status')).json()

    expect(status).to.deep.equal({ store: { degraded: false } })
  })
})
