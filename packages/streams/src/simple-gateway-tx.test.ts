import { expect } from 'chai'
import { AddressInfo, createServer, Server, Socket } from 'net'
import Simple from './simple'
type SimpleOptions = ConstructorParameters<typeof Simple>[0]
import { createMockApp, createDebugStub } from './test-helpers'

const BATTERY = {
  pgn: 127508,
  prio: 2,
  dst: 255,
  fields: { instance: 0, voltage: 26.27, current: -63.9 }
}
const BATTERY_YDWG = '09F21400 00 43 0A 81 FD FF FF FF\r\n'
const WAIT_TIMEOUT = 2000
const POLL_INTERVAL = 5

interface Gateway {
  server: Server
  port: number
  socket: Promise<Socket>
  received: string
}

async function startGateway(): Promise<Gateway> {
  const server = createServer()
  const gateway = {
    server,
    port: 0,
    received: '',
    socket: new Promise<Socket>((resolve) =>
      server.once('connection', (socket: Socket) => {
        socket.on('data', (data: Buffer) => {
          gateway.received += data.toString()
        })
        resolve(socket)
      })
    )
  }
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  gateway.port = (server.address() as AddressInfo).port
  return gateway
}

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))
  }
}

type MockApp = ReturnType<typeof createMockApp>

function startConnection(app: MockApp, providerId: string, port: number) {
  const simpleApp = app as unknown as SimpleOptions['app']
  return new Simple({
    app: simpleApp,
    providerId,
    type: 'NMEA2000',
    subOptions: {
      app: simpleApp,
      providerId,
      type: 'ydwg02-wasm',
      host: '127.0.0.1',
      port,
      jsonOutEvent: `${providerId}JsonOut`
    } as SimpleOptions['subOptions'],
    emitPropertyValue: () => undefined,
    onPropertyValues: () => undefined,
    createDebug: createDebugStub()
  })
}

// The gateway accepting the socket comes a tick before the client's
// 'connect', which is when the transport starts writing.
const clientConnected = (app: MockApp, providerId: string) =>
  waitFor(
    () =>
      app.providerStatuses.some(
        ({ id, msg }) => id === providerId && msg.startsWith('Connected to')
      ),
    `${providerId} to connect`
  )

async function stopGateway(gateway: Gateway): Promise<void> {
  ;(await gateway.socket).destroy()
  await new Promise((resolve) => gateway.server.close(resolve))
}

describe('Simple wasm gateway TX', () => {
  it('writes each connection’s outbound frames to its own gateway only', async () => {
    const app = createMockApp()
    const gateways = [await startGateway(), await startGateway()]
    const connections = gateways.map((gateway, i) =>
      startConnection(app, `bus${i + 1}`, gateway.port)
    )

    try {
      await Promise.all([
        clientConnected(app, 'bus1'),
        clientConnected(app, 'bus2')
      ])
      app.emit('bus2JsonOut', BATTERY)
      // TCP keeps order: had bus2's frame gone to the first gateway too,
      // it would arrive there ahead of bus1's.
      app.emit('bus1JsonOut', BATTERY)
      await waitFor(
        () => gateways.every((g) => g.received.length >= BATTERY_YDWG.length),
        'both gateways to receive a frame'
      )

      expect(gateways[0]!.received).to.equal(BATTERY_YDWG)
      expect(gateways[1]!.received).to.equal(BATTERY_YDWG)
    } finally {
      connections.forEach((connection) => connection.end())
      await Promise.all(gateways.map(stopGateway))
    }
  })

  it('leaves a restarted connection one transmit subscription', async () => {
    const app = createMockApp()
    const gateways = [await startGateway(), await startGateway()]
    const first = startConnection(app, 'bus1', gateways[0]!.port)
    let second: Simple | undefined

    try {
      await clientConnected(app, 'bus1')
      first.end()
      app.providerStatuses.length = 0
      second = startConnection(app, 'bus1', gateways[1]!.port)
      await clientConnected(app, 'bus1')

      expect(app.listenerCount('bus1JsonOut')).to.equal(1)
      expect(app.listenerCount('ydwg02-out:bus1')).to.equal(1)
    } finally {
      first.end()
      second?.end()
      await Promise.all(gateways.map(stopGateway))
    }
  })
})
