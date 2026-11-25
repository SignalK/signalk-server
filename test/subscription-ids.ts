import { expect } from 'chai'
import WebSocket from 'ws'
import {
  Context,
  Delta,
  Path,
  SubscribeMessage,
  Unsubscribes
} from '@signalk/server-api'
import { startServer } from './ts-servertestutilities'
import { WsPromiser } from './servertestutilities'

const SOG_PATH = 'navigation.speedOverGround'
const HEADING_PATH = 'navigation.headingTrue'
const SOG = 3.4
const HEADING = 1.2
const DELIVERY_TIMEOUT_MS = 2000
const POLL_MS = 10

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
async function waitFor(condition: () => boolean, what: string) {
  const deadline = Date.now() + DELIVERY_TIMEOUT_MS
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`)
    }
    await sleep(POLL_MS)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const waitForDelta = (ws: any, path: string) =>
  waitFor(() => deltaPaths(ws.parsedMessages()).includes(path), path)

// A connection's messages are handled in order, and a subscribe with an empty
// id is answered with an error at once and changes nothing. Once that answer
// is back, the server has acted on everything sent before it, so a delta
// posted over HTTP, a separate connection, can no longer race it.
const EMPTY_ID_ERROR = 'subscriptionId must be a non-empty string'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function settle(...connections: any[]) {
  for (const ws of connections) {
    const count = () =>
      ws.messages.filter((m: string) => m.includes(EMPTY_ID_ERROR)).length
    const before = count()
    await ws.send({
      context: 'vessels.self',
      subscriptionId: '',
      subscribe: [{ path: SOG_PATH }]
    })
    await waitFor(() => count() > before, 'the server to answer')
  }
}

const subscribe = (subscriptionId: string, path: string) => ({
  context: 'vessels.self',
  subscriptionId,
  subscribe: [{ path }]
})

const unsubscribe = (...subscriptionIds: string[]) => ({
  context: '*',
  unsubscribe: subscriptionIds.map((subscriptionId) => ({ subscriptionId }))
})

const UNSUBSCRIBE_ALL = { context: '*', unsubscribe: [{ path: '*' }] }

describe('Subscription ids', () => {
  let server: Awaited<ReturnType<typeof startServer>>

  beforeEach(async () => {
    server = await startServer()
  })

  afterEach(async () => {
    await server.stop()
  })

  const connect = (query: string) =>
    new WsPromiser(
      server.host.replace('http', 'ws') +
        `/signalk/v1/stream?subscribe=${query}&metaDeltas=none&sendCachedValues=false`
    )

  async function connectNone() {
    const ws = connect('none')
    await ws.nthMessage(1)
    return ws
  }

  it('are listed in the hello capabilities', async () => {
    const ws = connect('none')
    const hello = JSON.parse(await ws.nthMessage(1))

    expect(hello.capabilities).to.include('subscriptionIds')
    ws.close()
  })

  it('end only the named subscription and keep the connection open', async () => {
    const ws = await connectNone()
    await ws.send(subscribe('sog', SOG_PATH))
    await ws.send(subscribe('heading', HEADING_PATH))
    await ws.send(unsubscribe('sog'))
    await settle(ws)

    await server.sendDelta(SOG_PATH, SOG)
    await server.sendDelta(HEADING_PATH, HEADING)
    await waitForDelta(ws, HEADING_PATH)

    expect(ws.ws.readyState).to.equal(WebSocket.OPEN)
    expect(deltaPaths(ws.parsedMessages())).to.deep.equal([HEADING_PATH])
    ws.close()
  })

  it('refuse an id already in use and keep the first subscription', async () => {
    const ws = await connectNone()
    await ws.send(subscribe('nav', SOG_PATH))
    await ws.send(subscribe('nav', HEADING_PATH))
    await settle(ws)

    await server.sendDelta(HEADING_PATH, HEADING)
    await server.sendDelta(SOG_PATH, SOG)
    await waitForDelta(ws, SOG_PATH)

    const messages = ws.parsedMessages()
    expect(messages).to.include("subscriptionId 'nav' is already in use")
    expect(deltaPaths(messages)).to.deep.equal([SOG_PATH])
    ws.close()
  })

  it('are ended by unsubscribe-all and can be used again', async () => {
    const ws = await connectNone()
    await ws.send(subscribe('nav', SOG_PATH))
    await ws.send(UNSUBSCRIBE_ALL)
    await ws.send(subscribe('nav', HEADING_PATH))
    await settle(ws)

    await server.sendDelta(SOG_PATH, SOG)
    await server.sendDelta(HEADING_PATH, HEADING)
    await waitForDelta(ws, HEADING_PATH)

    expect(deltaPaths(ws.parsedMessages())).to.deep.equal([HEADING_PATH])
    ws.close()
  })

  it('can be used again after their unsubscribe', async () => {
    const ws = await connectNone()
    await ws.send(subscribe('nav', SOG_PATH))
    await ws.send(unsubscribe('nav'))
    await ws.send(subscribe('nav', HEADING_PATH))
    await settle(ws)

    await server.sendDelta(SOG_PATH, SOG)
    await server.sendDelta(HEADING_PATH, HEADING)
    await waitForDelta(ws, HEADING_PATH)

    expect(deltaPaths(ws.parsedMessages())).to.deep.equal([HEADING_PATH])
    ws.close()
  })

  it('ignore an unknown id', async () => {
    const ws = await connectNone()
    await ws.send(subscribe('sog', SOG_PATH))
    await ws.send(unsubscribe('nothing'))
    await settle(ws)

    await server.sendDelta(SOG_PATH, SOG)
    await waitForDelta(ws, SOG_PATH)

    expect(ws.ws.readyState).to.equal(WebSocket.OPEN)
    ws.close()
  })

  it('take an empty unsubscribe list as a no-op', async () => {
    const ws = await connectNone()
    await ws.send(subscribe('sog', SOG_PATH))
    await ws.send({ context: '*', unsubscribe: [] })
    await settle(ws)

    await server.sendDelta(SOG_PATH, SOG)
    await waitForDelta(ws, SOG_PATH)

    expect(ws.ws.readyState).to.equal(WebSocket.OPEN)
    ws.close()
  })

  it('leave the ?subscribe= stream running', async () => {
    const ws = connect('self')
    await ws.nthMessage(1)
    await ws.send(subscribe('heading', HEADING_PATH))
    await ws.send(unsubscribe('heading'))
    await settle(ws)

    await server.sendDelta(SOG_PATH, SOG)
    await waitForDelta(ws, SOG_PATH)

    expect(deltaPaths(ws.parsedMessages())).to.deep.equal([SOG_PATH])
    ws.close()
  })

  it('are separate on each connection', async () => {
    const first = await connectNone()
    const second = await connectNone()
    await first.send(subscribe('sog', SOG_PATH))
    await second.send(subscribe('sog', SOG_PATH))
    await first.send(unsubscribe('sog'))
    await settle(first, second)

    await server.sendDelta(SOG_PATH, SOG)
    await waitForDelta(second, SOG_PATH)
    await settle(first)

    expect(deltaPaths(first.parsedMessages())).to.deep.equal([])
    first.close()
    second.close()
  })
})

describe('Server API subscribe', () => {
  let server: Awaited<ReturnType<typeof startServer>>

  beforeEach(async () => {
    server = await startServer()
  })

  afterEach(async () => {
    await server.stop()
  })

  function subscribeTo(path: string, unsubscribes: Unsubscribes) {
    const received: string[] = []
    const command: SubscribeMessage = {
      context: 'vessels.self' as Context,
      subscribe: [{ path: path as Path, policy: 'instant' }]
    }
    const end = server.server.app.subscriptionmanager.subscribe(
      command,
      unsubscribes,
      (err: unknown) => {
        throw err
      },
      (delta: Delta) => {
        delta.updates.forEach((update) => {
          if ('values' in update) {
            update.values.forEach((pv) => received.push(pv.path))
          }
        })
      }
    )
    return { received, end }
  }

  it('returns a function that ends only that subscription', async () => {
    const unsubscribes: Unsubscribes = []
    const sog = subscribeTo(SOG_PATH, unsubscribes)
    const heading = subscribeTo(HEADING_PATH, unsubscribes)
    sog.end()

    await server.sendDelta(SOG_PATH, SOG)
    await server.sendDelta(HEADING_PATH, HEADING)
    await waitFor(() => heading.received.length > 0, HEADING_PATH)

    expect(sog.received).to.deep.equal([])
    expect(heading.received).to.deep.equal([HEADING_PATH])
    expect(unsubscribes).to.have.length(1)
  })

  it('still ends every subscription through the unsubscribes array', async () => {
    const unsubscribes: Unsubscribes = []
    const sog = subscribeTo(SOG_PATH, unsubscribes)
    const heading = subscribeTo(HEADING_PATH, unsubscribes)
    const control = subscribeTo(HEADING_PATH, [])
    unsubscribes.forEach((unsubscribe) => unsubscribe())

    await server.sendDelta(SOG_PATH, SOG)
    await server.sendDelta(HEADING_PATH, HEADING)
    await waitFor(() => control.received.length > 0, HEADING_PATH)

    expect(sog.received).to.deep.equal([])
    expect(heading.received).to.deep.equal([])
  })

  it('stops delivering once ended from its own callback during replay', async () => {
    await server.sendDelta(SOG_PATH, SOG)
    const unsubscribes: Unsubscribes = []
    const received: string[] = []
    server.server.app.subscriptionmanager.subscribe(
      {
        context: 'vessels.self' as Context,
        subscribe: [{ path: '*' as Path, policy: 'instant' }]
      },
      unsubscribes,
      (err: unknown) => {
        throw err
      },
      (delta: Delta) => {
        received.push(JSON.stringify(delta))
        unsubscribes.forEach((unsubscribe) => unsubscribe())
      }
    )
    const control = subscribeTo(HEADING_PATH, [])

    await server.sendDelta(HEADING_PATH, HEADING)
    await server.sendDelta(SOG_PATH, SOG)
    await waitFor(() => control.received.length > 0, HEADING_PATH)

    expect(received).to.have.length(1)
  })

  it('keeps an id taken again when the old subscription is released twice', async () => {
    const unsubscribes: Unsubscribes = []
    const { subscriptionmanager } = server.server.app
    const subscribeNamed = (path: string, received: string[]) =>
      subscriptionmanager.subscribe(
        {
          context: 'vessels.self' as Context,
          subscriptionId: 'nav',
          subscribe: [{ path: path as Path, policy: 'instant' }]
        },
        unsubscribes,
        (err: unknown) => {
          throw err
        },
        () => received.push(path)
      )
    const first: string[] = []
    const second: string[] = []
    const endFirst = subscribeNamed(SOG_PATH, first)
    endFirst()
    subscribeNamed(HEADING_PATH, second)
    endFirst()
    subscriptionmanager.unsubscribe(
      { context: '*', unsubscribe: [{ subscriptionId: 'nav' }] },
      unsubscribes
    )
    const control = subscribeTo(HEADING_PATH, [])

    await server.sendDelta(HEADING_PATH, HEADING)
    await waitFor(() => control.received.length > 0, HEADING_PATH)

    expect(second).to.deep.equal([])
  })

  it('frees the id of a subscription that failed to attach', () => {
    const unsubscribes: Unsubscribes = []
    const { subscriptionmanager } = server.server.app
    const errors: unknown[] = []
    const attempt = (radius: number) =>
      subscriptionmanager.subscribe(
        {
          context: {
            radius,
            position: { latitude: 60, longitude: 25 }
          },
          subscriptionId: 'near',
          subscribe: [{ path: SOG_PATH as Path }]
        } as unknown as SubscribeMessage,
        unsubscribes,
        (err: unknown) => {
          errors.push(err)
          throw new Error(String(err))
        },
        () => undefined
      )

    expect(() => attempt(NaN)).to.throw(/radius/)
    expect(unsubscribes).to.have.length(0)
    attempt(1000)

    expect(errors).to.have.length(1)
    expect(unsubscribes).to.have.length(1)
  })
})
