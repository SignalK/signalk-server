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

// TCP may deliver a frame in pieces; only CRLF-terminated lines count.
const lines = (gateway: Gateway) => gateway.received.split('\r\n').slice(0, -1)

describe('Simple gateway TX', () => {
  it('writes each W2K-1 connection’s outbound frames to its own gateway only', async () => {
    const app = createMockApp()
    const simpleApp = app as unknown as SimpleOptions['app']
    const gateways: Gateway[] = []
    const connections: Simple[] = []

    try {
      gateways.push(await startGateway())
      gateways.push(await startGateway())
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

      // TCP keeps order: a stray bus2 frame would reach the first
      // gateway ahead of bus1's, and the later bus2 frame shows that the
      // second gateway has received everything sent before it.
      app.emit('bus2JsonOut', battery(0))
      app.emit('bus1JsonOut', battery(1))
      app.emit('bus2JsonOut', battery(2))
      await waitFor(
        () =>
          lines(gateways[0]!).length > 0 &&
          lines(gateways[1]!).some((line) => / 1F214 02/.test(line)),
        'both gateways to receive their frames'
      )

      expect(lines(gateways[0]!)).to.have.length(1)
      expect(lines(gateways[0]!)[0]).to.match(/ 1F214 01/)
      expect(lines(gateways[1]!)).to.have.length(2)
      expect(lines(gateways[1]!)[0]).to.match(/ 1F214 00/)
      expect(lines(gateways[1]!)[1]).to.match(/ 1F214 02/)
    } finally {
      connections.forEach((connection) => connection.end())
      await Promise.all(gateways.map(stopGateway))
    }
  })

  // The driver sends on its connection's transmit event (canboatjs's
  // txEvent) and the transport writes from that event only, for every
  // gateway a connection writes to over the network.
  ;[
    ['ydwg02-canboatjs', 'ydwg02-out'],
    ['ydwg02-udp-canboatjs', 'ydwg02-out'],
    ['navlink2-tcp-canboatjs', 'navlink2-out'],
    ['w2k-1-n2k-ascii-canboatjs', 'w2k-1-out'],
    ['w2k-1-n2k-actisense-canboatjs', 'w2k-1-out']
  ].forEach(([type, base]) => {
    it(`gives each ${type} connection a transmit event of its own`, async () => {
      const app = createMockApp()
      const simpleApp = app as unknown as SimpleOptions['app']
      const gateways: Gateway[] = []
      const connections: Simple[] = []

      try {
        for (const providerId of ['bus1', 'bus2']) {
          const gateway = await startGateway()
          gateways.push(gateway)
          connections.push(
            new Simple({
              app: simpleApp,
              providerId,
              type: 'NMEA2000',
              subOptions: {
                app: simpleApp,
                providerId,
                type,
                host: '127.0.0.1',
                port: gateway.port
              } as SimpleOptions['subOptions'],
              emitPropertyValue: () => undefined,
              onPropertyValues: () => undefined,
              createDebug: createDebugStub()
            })
          )
        }

        expect(app.listenerCount(base!)).to.equal(0)
        connections.forEach((connection, i) => {
          const txEvent = `${base}:bus${i + 1}`
          const pipeline = (connection as unknown as { pipeline: object[] })
            .pipeline
          const driver = pipeline.find(
            (element) => (element as { outEvent?: string }).outEvent
          ) as { outEvent: string }
          expect(driver.outEvent).to.equal(txEvent)
          expect(app.listenerCount(txEvent)).to.equal(1)
        })
      } finally {
        connections.forEach((connection) => connection.end())
        await Promise.all(gateways.map(stopGateway))
      }
    })
  })
})

// A plugin sends to every N2K connection on nmea2000JsonOut and to one on
// nmea2000JsonOut:<providerId>; a connection can be set to take only what
// is sent to it.
describe('Simple N2K bus targeting', () => {
  const start = async (sendBroadcastOutput: boolean[]) => {
    const app = createMockApp()
    const simpleApp = app as unknown as SimpleOptions['app']
    const gateways: Gateway[] = []
    const connections: Simple[] = []
    const writes: string[] = []
    app.on('connectionwrite', ({ providerId }: { providerId: string }) =>
      writes.push(providerId)
    )
    for (const [i, broadcast] of sendBroadcastOutput.entries()) {
      const providerId = `bus${i + 1}`
      const gateway = await startGateway()
      gateways.push(gateway)
      connections.push(
        new Simple({
          app: simpleApp,
          providerId,
          type: 'NMEA2000',
          subOptions: {
            app: simpleApp,
            providerId,
            type: 'w2k-1-n2k-ascii-canboatjs',
            host: '127.0.0.1',
            port: gateway.port,
            sendBroadcastOutput: broadcast
          } as SimpleOptions['subOptions'],
          emitPropertyValue: () => undefined,
          onPropertyValues: () => undefined,
          createDebug: createDebugStub()
        })
      )
    }
    await Promise.all(
      connections.map((_, i) => clientConnected(app, `bus${i + 1}`))
    )
    const stop = async () => {
      connections.forEach((connection) => connection.end())
      await Promise.all(gateways.map(stopGateway))
    }
    return { app, gateways, writes, stop }
  }
  const instances = (gateway: Gateway) =>
    lines(gateway).map((line) => line.match(/ 1F214 (\d\d)/)?.[1])

  it('sends to every bus, or to the one it is sent to', async () => {
    const { app, gateways, writes, stop } = await start([true, true])
    try {
      app.emit('nmea2000JsonOut', battery(0))
      app.emit('nmea2000JsonOut:bus2', battery(1))
      app.emit('nmea2000JsonOut', battery(2))
      await waitFor(
        () => instances(gateways[1]!).includes('02'),
        'the second gateway to receive everything'
      )
      await waitFor(
        () => instances(gateways[0]!).includes('02'),
        'the first gateway to receive the broadcasts'
      )
      expect(instances(gateways[0]!)).to.deep.equal(['00', '02'])
      expect(instances(gateways[1]!)).to.deep.equal(['00', '01', '02'])
      // Only a bus that writes reports a write.
      await new Promise((resolve) => setImmediate(resolve))
      writes.length = 0
      app.emit('nmea2000JsonOut:bus2', battery(3))
      await waitFor(
        () => instances(gateways[1]!).includes('03'),
        'the second gateway to receive the targeted frame'
      )
      await new Promise((resolve) => setImmediate(resolve))
      expect(writes).to.not.be.empty
      expect(new Set(writes)).to.deep.equal(new Set(['bus2']))
    } finally {
      await stop()
    }
  })

  it('leaves out what is sent to every bus when told to', async () => {
    const { app, gateways, writes, stop } = await start([true, false])
    try {
      app.emit('nmea2000JsonOut', battery(0))
      app.emit('nmea2000JsonOut:bus2', battery(1))
      await waitFor(
        () =>
          instances(gateways[0]!).length > 0 &&
          instances(gateways[1]!).length > 0,
        'both gateways to receive a frame'
      )
      expect(instances(gateways[0]!)).to.deep.equal(['00'])
      expect(instances(gateways[1]!)).to.deep.equal(['01'])
      await new Promise((resolve) => setImmediate(resolve))
      expect(new Set(writes)).to.deep.equal(new Set(['bus1', 'bus2']))
    } finally {
      await stop()
    }
  })

  it('publishes each connection’s events', async () => {
    const { app, stop } = await start([true, false])
    try {
      const values = app.propertyValues
        .filter(({ name }) => name === 'pipedprovider')
        .map(({ value }) => value)
      expect(values).to.deep.equal([
        {
          id: 'bus1',
          type: 'NMEA2000JS',
          eventNames: {
            received: 'received:bus1',
            nmea2000out: 'nmea2000out:bus1',
            nmea2000JsonOut: 'nmea2000JsonOut:bus1'
          },
          broadcast: true
        },
        {
          id: 'bus2',
          type: 'NMEA2000JS',
          eventNames: {
            received: 'received:bus2',
            nmea2000out: 'nmea2000out:bus2',
            nmea2000JsonOut: 'nmea2000JsonOut:bus2'
          },
          broadcast: false
        }
      ])
    } finally {
      await stop()
    }
  })

  it('emits what a connection receives on both of its received events', async () => {
    const { app, gateways, stop } = await start([true])
    try {
      const received: string[] = []
      app.on('bus1-received', () => received.push('old'))
      app.on('received:bus1', () => received.push('new'))
      gateways[0]!.sockets.forEach((socket) =>
        socket.write('A173321.107 23FF7 1F513 012F3070002F30709F\r\n')
      )
      await waitFor(() => received.length >= 2, 'the received events')
      expect(received.slice(0, 2)).to.deep.equal(['old', 'new'])
    } finally {
      await stop()
    }
  })
})
