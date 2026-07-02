import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'
import { WsPromiser } from './servertestutilities'
import { Delta, hasValues } from '@signalk/server-api'

describe('WebSocket sourcePolicy', () => {
  let stop: () => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendADelta: (delta: any) => Promise<Response>
  let host: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any

  before(async () => {
    const s = await startServer()
    stop = s.stop
    sendADelta = s.sendADelta
    host = s.host
    server = s.server
  })

  after(async () => {
    await stop()
  })

  it('sourcePolicy=all delivers deltas from all sources', async function () {
    const wsUrl =
      host.replace('http', 'ws') +
      '/signalk/v1/stream?subscribe=self&sourcePolicy=all&metaDeltas=none&sendCachedValues=false'
    const ws = new WsPromiser(wsUrl)

    const hello = JSON.parse(await ws.nthMessage(1))
    expect(hello).to.have.property('self')

    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'sensor.A',
          timestamp: '2024-01-15T10:00:00.000Z',
          values: [{ path: 'navigation.speedOverGround', value: 3.5 }]
        }
      ]
    })
    await ws.nthMessage(2)

    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'sensor.B',
          timestamp: '2024-01-15T10:00:01.000Z',
          values: [{ path: 'navigation.speedOverGround', value: 3.7 }]
        }
      ]
    })
    await ws.nthMessage(3)

    const deltas: Delta[] = ws
      .parsedMessages()
      .slice(1)
      .filter((m: Delta) => {
        const u = m.updates?.[0]
        return (
          u &&
          hasValues(u) &&
          u.values[0]?.path === 'navigation.speedOverGround'
        )
      })

    expect(deltas).to.have.lengthOf(2)
    const sources = deltas.map((d: Delta) => d.updates[0].$source).sort()
    expect(sources).to.deep.equal(['sensor.A', 'sensor.B'])

    ws.close()
  })

  it('default connection delivers deltas', async function () {
    const wsUrl =
      host.replace('http', 'ws') +
      '/signalk/v1/stream?subscribe=self&metaDeltas=none&sendCachedValues=false'
    const ws = new WsPromiser(wsUrl)

    const hello = JSON.parse(await ws.nthMessage(1))
    expect(hello).to.have.property('self')

    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'gps.X',
          timestamp: '2024-01-15T11:00:00.000Z',
          values: [{ path: 'navigation.courseOverGroundTrue', value: 1.1 }]
        }
      ]
    })
    await ws.nthMessage(2)

    const deltas: Delta[] = ws
      .parsedMessages()
      .slice(1)
      .filter((m: Delta) => {
        const u = m.updates?.[0]
        return (
          u &&
          hasValues(u) &&
          u.values[0]?.path === 'navigation.courseOverGroundTrue'
        )
      })

    expect(deltas.length).to.be.greaterThan(0)
    expect(deltas[0].updates[0]).to.have.property('$source')

    ws.close()
  })

  it('sourcePolicy=all bypasses the priority engine even when a group ranks one source above the other', async function () {
    // Configure a saved group that ranks plugin.B above plugin.A.
    // The engine will pick plugin.B as the live winner for any
    // multi-publisher path the group's sources both touch — but a
    // consumer that asks for sourcePolicy=all must still receive
    // every source's delta, so a plugin can implement its own
    // per-source selection (e.g. "give me navigation.depth from
    // plugin.A specifically, even though plugin.B is the engine's
    // preferred source").
    server.app.config.settings.priorityGroups = [
      { id: 'g1', sources: ['plugin.B', 'plugin.A'] }
    ]
    server.app.activateSourcePriorities()

    const wsUrl =
      host.replace('http', 'ws') +
      '/signalk/v1/stream?subscribe=self&sourcePolicy=all&metaDeltas=none&sendCachedValues=false'
    const ws = new WsPromiser(wsUrl)
    await ws.nthMessage(1) // hello

    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'plugin.A',
          timestamp: '2024-01-15T12:00:00.000Z',
          values: [{ path: 'environment.depth.belowKeel', value: 4.2 }]
        }
      ]
    })
    await ws.nthMessage(2)
    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'plugin.B',
          timestamp: '2024-01-15T12:00:01.000Z',
          values: [{ path: 'environment.depth.belowKeel', value: 4.1 }]
        }
      ]
    })
    await ws.nthMessage(3)

    const deltas: Delta[] = ws
      .parsedMessages()
      .slice(1)
      .filter((m: Delta) => {
        const u = m.updates?.[0]
        return (
          u &&
          hasValues(u) &&
          u.values[0]?.path === 'environment.depth.belowKeel'
        )
      })

    const sources = deltas.map((d: Delta) => d.updates[0].$source).sort()
    expect(sources).to.deep.equal(['plugin.A', 'plugin.B'])

    ws.close()
  })
})
