import { expect } from 'chai'
import { AddressInfo, createServer, Server, Socket } from 'net'
import Simple from './simple'
import { createMockApp, createDebugStub } from './test-helpers'

type SimpleOptions = ConstructorParameters<typeof Simple>[0]
type MockApp = ReturnType<typeof createMockApp>

const battery = (instance: number) => ({
  pgn: 127508,
  prio: 2,
  dst: 255,
  fields: { instance, voltage: 26.27, current: -63.9 }
})
const WAIT_TIMEOUT = 2000
const POLL_INTERVAL = 5

interface Gateway {
  server: Server
  port: number
  sockets: Socket[]
  received: string
}

async function startGateway(): Promise<Gateway> {
  const server = createServer()
  const gateway: Gateway = { server, port: 0, sockets: [], received: '' }
  server.on('connection', (socket: Socket) => {
    gateway.sockets.push(socket)
    socket.on('data', (data: Buffer) => {
      gateway.received += data.toString()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  gateway.port = (server.address() as AddressInfo).port
  return gateway
}

async function stopGateway(gateway: Gateway): Promise<void> {
  gateway.sockets.forEach((socket) => socket.destroy())
  await new Promise((resolve) => gateway.server.close(resolve))
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

// The transport writes only once the client's 'connect' has fired.
const clientConnected = (app: MockApp, providerId: string) =>
  waitFor(
    () =>
      app.providerStatuses.some(
        ({ id, msg }) => id === providerId && msg.startsWith('Connected to')
      ),
    `${providerId} to connect`
  )

const lines = (gateway: Gateway) =>
  gateway.received.split('\r\n').filter((line) => line.length > 0)

describe('Simple gateway TX', () => {
  it('writes each W2K-1 connection’s outbound frames to its own gateway only', async () => {
    const app = createMockApp()
    const simpleApp = app as unknown as SimpleOptions['app']
    const gateways: Gateway[] = []
    const connections: Simple[] = []

    try {
      gateways.push(await startGateway(), await startGateway())
      gateways.forEach((gateway, i) =>
        connections.push(
          new Simple({
            app: simpleApp,
            providerId: `bus${i + 1}`,
            type: 'NMEA2000',
            subOptions: {
              app: simpleApp,
              providerId: `bus${i + 1}`,
              type: 'w2k-1-n2k-ascii-canboatjs',
              host: '127.0.0.1',
              port: gateway.port,
              jsonOutEvent: `bus${i + 1}JsonOut`
            } as SimpleOptions['subOptions'],
            emitPropertyValue: () => undefined,
            onPropertyValues: () => undefined,
            createDebug: createDebugStub()
          })
        )
      )
      await Promise.all([
        clientConnected(app, 'bus1'),
        clientConnected(app, 'bus2')
      ])

      // TCP keeps order: had bus2's frame reached the first gateway too,
      // it would arrive there ahead of bus1's.
      app.emit('bus2JsonOut', battery(0))
      app.emit('bus1JsonOut', battery(1))
      await waitFor(
        () => gateways.every((gateway) => lines(gateway).length > 0),
        'both gateways to receive a frame'
      )

      expect(lines(gateways[0]!)).to.have.length(1)
      expect(lines(gateways[0]!)[0]).to.match(/ 1F214 01/)
      expect(lines(gateways[1]!)).to.have.length(1)
      expect(lines(gateways[1]!)[0]).to.match(/ 1F214 00/)
    } finally {
      connections.forEach((connection) => connection.end())
      await Promise.all(gateways.map(stopGateway))
    }
  })
})
