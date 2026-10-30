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

describe('Simple wasm gateway TX', () => {
  it('writes each connection’s outbound frames to its own gateway only', async () => {
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
            type: 'ydwg02-wasm',
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
      await new Promise((resolve) => setTimeout(resolve, 50))
      app.emit('bus2JsonOut', BATTERY)
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(gateways[0]!.received).to.equal('')
      expect(gateways[1]!.received).to.equal(BATTERY_YDWG)
    } finally {
      connections.forEach((connection) => connection.end())
      sockets.forEach((socket) => socket.destroy())
      await Promise.all(
        gateways.map((g) => new Promise((resolve) => g.server.close(resolve)))
      )
    }
  })
})
