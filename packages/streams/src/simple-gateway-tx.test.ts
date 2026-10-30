import { expect } from 'chai'
import { AddressInfo, createServer, Server, Socket } from 'net'
import Simple from './simple'
import { createMockApp, createDebugStub } from './test-helpers'

type SimpleOptions = ConstructorParameters<typeof Simple>[0]

const BATTERY = {
  pgn: 127508,
  prio: 2,
  dst: 255,
  fields: { instance: 0, voltage: 26.27, current: -63.9 }
}

interface Gateway {
  server: Server
  port: number
  socket: Promise<Socket>
  received: string
}

async function startGateway(): Promise<Gateway> {
  const server = createServer()
  const gateway: Gateway = {
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe('Simple gateway TX', () => {
  it('writes each W2K-1 connection’s outbound frames to its own gateway only', async () => {
    const app = createMockApp()
    const simpleApp = app as unknown as SimpleOptions['app']
    const gateways = [await startGateway(), await startGateway()]
    const connections = gateways.map(
      (gateway, i) =>
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
    const sockets = await Promise.all(gateways.map((g) => g.socket))

    try {
      // The client's socket is set on its 'connect', a tick after the
      // server has accepted it.
      await settle()
      app.emit('bus2JsonOut', BATTERY)
      await settle()

      expect(gateways[0]!.received).to.equal('')
      expect(gateways[1]!.received).to.match(/^A\S+ \S+ 1F214 .*\r\n$/)
    } finally {
      connections.forEach((connection) => connection.end())
      sockets.forEach((socket) => socket.destroy())
      await Promise.all(
        gateways.map((g) => new Promise((resolve) => g.server.close(resolve)))
      )
    }
  })
})
