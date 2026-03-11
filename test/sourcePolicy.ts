import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'
import { WsPromiser } from './servertestutilities'
import { Delta, hasValues } from '@signalk/server-api'

describe('WebSocket sourcePolicy', () => {
  let stop: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendADelta: (delta: any) => Promise<Response>
  let host: string

  before(async () => {
    const s = await startServer()
    stop = s.stop
    sendADelta = s.sendADelta
    host = s.host
  })

  after(() => stop())

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
  })
})
