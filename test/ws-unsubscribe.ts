import { expect } from 'chai'
import WebSocket from 'ws'
import { startServer } from './ts-servertestutilities'
import { WsPromiser } from './servertestutilities'

const SOG_PATH = 'navigation.speedOverGround'
const HEADING_PATH = 'navigation.headingTrue'
const SOG = 3.4
const HEADING = 1.2
// Long enough for the server to act on a WebSocket message before a delta
// posted over HTTP, a separate connection, races it.
const SETTLE_MS = 50
const DELIVERY_TIMEOUT_MS = 2000
const POLL_MS = 10

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const settle = () => sleep(SETTLE_MS)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deltaPaths(messages: any[]): string[] {
  return messages
    .filter((m) => m.updates)
    .flatMap((m) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      m.updates.flatMap((u: any) => u.values.map((v: any) => v.path))
    )
}

// Deltas posted one after another reach a connection in order, so once the
// last one has arrived any earlier one that was going to arrive has too.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForDelta(ws: any, path: string) {
  await waitForDeltas(ws, path, 1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForDeltas(ws: any, path: string, count: number) {
  const deadline = Date.now() + DELIVERY_TIMEOUT_MS
  const arrived = () =>
    deltaPaths(ws.parsedMessages()).filter((p) => p === path).length
  while (arrived() < count) {
    if (Date.now() > deadline) {
      throw new Error(`${arrived()} of ${count} deltas for ${path}`)
    }
    await sleep(POLL_MS)
  }
}

describe('WebSocket unsubscribe', () => {
  let server: Awaited<ReturnType<typeof startServer>>

  beforeEach(async () => {
    server = await startServer()
  })

  afterEach(async () => {
    await server.stop()
  })

  const connect = (subscribe: string) =>
    new WsPromiser(
      server.host.replace('http', 'ws') +
        `/signalk/v1/stream?subscribe=${subscribe}&metaDeltas=none&sendCachedValues=false`
    )

  it('advertises granular unsubscribe in the hello message', async () => {
    const ws = connect('none')
    const hello = JSON.parse(await ws.nthMessage(1))

    expect(hello.capabilities).to.include('granularUnsubscribe')
    ws.close()
  })

  it('ends one path and keeps the connection open', async () => {
    const ws = connect('none')
    await ws.nthMessage(1)
    await ws.send({
      context: 'vessels.self',
      subscribe: [{ path: SOG_PATH }, { path: HEADING_PATH }]
    })
    await ws.send({
      context: 'vessels.self',
      unsubscribe: [{ path: SOG_PATH }]
    })
    await settle()

    await server.sendDelta(SOG_PATH, SOG)
    await server.sendDelta(HEADING_PATH, HEADING)
    await waitForDelta(ws, HEADING_PATH)

    expect(ws.ws.readyState).to.equal(WebSocket.OPEN)
    expect(deltaPaths(ws.parsedMessages())).to.deep.equal([HEADING_PATH])
    ws.close()
  })

  it('matches against the sourcePolicy the connection defaults to', async () => {
    const ws = connect('none&sourcePolicy=all')
    await ws.nthMessage(1)
    await ws.send({
      context: 'vessels.self',
      subscribe: [{ path: SOG_PATH }, { path: HEADING_PATH }]
    })
    await ws.send({
      context: 'vessels.self',
      unsubscribe: [{ path: SOG_PATH }]
    })
    await settle()

    await server.sendDelta(SOG_PATH, SOG)
    await server.sendDelta(HEADING_PATH, HEADING)
    await waitForDelta(ws, HEADING_PATH)

    expect(deltaPaths(ws.parsedMessages())).to.deep.equal([HEADING_PATH])
    ws.close()
  })

  it('delivers once to a path subscribed twice', async () => {
    await server.sendDelta(SOG_PATH, SOG)
    const ws = connect('none')
    await ws.nthMessage(1)
    const subscribe = {
      context: 'vessels.self',
      subscribe: [{ path: SOG_PATH }]
    }
    await ws.send(subscribe)
    await ws.send(subscribe)
    // Each subscribe replays the cached value, so two of them show that
    // both were handled before the live delta below.
    await waitForDeltas(ws, SOG_PATH, 2)

    await server.sendDelta(SOG_PATH, SOG)
    await server.sendDelta(HEADING_PATH, HEADING)
    await waitForDeltas(ws, SOG_PATH, 3)
    await settle()

    expect(deltaPaths(ws.parsedMessages())).to.deep.equal([
      SOG_PATH,
      SOG_PATH,
      SOG_PATH
    ])
    ws.close()
  })

  it('keeps the ?subscribe= stream after a per-path unsubscribe', async () => {
    const ws = connect('self')
    await ws.nthMessage(1)
    await ws.send({
      context: 'vessels.self',
      unsubscribe: [{ path: SOG_PATH }]
    })
    await settle()

    await server.sendDelta(SOG_PATH, SOG)
    await waitForDelta(ws, SOG_PATH)

    expect(deltaPaths(ws.parsedMessages())).to.deep.equal([SOG_PATH])
    ws.close()
  })
})
