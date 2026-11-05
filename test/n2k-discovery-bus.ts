import { expect } from 'chai'
import { AddressInfo, createServer, Server, Socket } from 'net'
import { startServer } from './ts-servertestutilities'

// Discovery sends a request for one device to that device's bus only
// (nmea2000JsonOut:<providerId>), so that a connection that sends no
// broadcast output still gets it; a request for every device stays on
// nmea2000JsonOut.
describe('N2K discovery sends to the bus of the device', function () {
  let stop: (() => Promise<unknown>) | undefined
  let host: string
  let app: {
    on(event: string, cb: (pgn: unknown) => void): void
    removeListener(event: string, cb: (pgn: unknown) => void): void
    emit(event: string, ...args: unknown[]): boolean
  }
  const gateways: Server[] = []
  const sockets: Socket[] = []

  const gateway = async () => {
    const server = createServer((socket) => sockets.push(socket))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    gateways.push(server)
    return (server.address() as AddressInfo).port
  }
  const connection = (id: string, port: number, broadcast: boolean) => ({
    id,
    enabled: true,
    pipeElements: [
      {
        type: 'providers/simple',
        options: {
          type: 'NMEA2000',
          subOptions: {
            type: 'w2k-1-n2k-ascii-canboatjs',
            host: '127.0.0.1',
            port,
            sendBroadcastOutput: broadcast
          }
        }
      }
    ]
  })

  before(async function () {
    const s = await startServer({
      pipedProviders: [
        connection('bus1', await gateway(), true),
        connection('bus2', await gateway(), false)
      ]
    })
    stop = s.stop
    host = s.host
    app = (s.server as unknown as { app: typeof app }).app
    app.emit('nmea2000OutAvailable')
    // Devices at address 35 on bus2 and 36 on bus1, as discovery sees them.
    for (const [bus, src] of [
      ['bus2', 35],
      ['bus1', 36]
    ] as const) {
      const pgn = { pgn: 60928, src, dst: 255, prio: 6, fields: {} }
      app.emit(`received:${bus}`, pgn)
      app.emit('N2KAnalyzerOut', pgn)
    }
  })

  after(async function () {
    if (stop) await stop()
    sockets.forEach((socket) => socket.destroy())
    await Promise.all(
      gateways.map((server) => new Promise((r) => server.close(r)))
    )
  })

  // What is sent, on which event, until `stop` is called.
  const record = () => {
    const sent: string[] = []
    const listeners = [
      'nmea2000JsonOut',
      'nmea2000JsonOut:bus1',
      'nmea2000JsonOut:bus2'
    ].map((event) => {
      const listener = (pgn: unknown) =>
        sent.push(`${event} ${(pgn as { pgn: number }).pgn}`)
      app.on(event, listener)
      return { event, listener }
    })
    const stopRecording = () =>
      listeners.forEach(({ event, listener }) =>
        app.removeListener(event, listener)
      )
    return { sent, stopRecording }
  }

  const configure = (body: object) =>
    fetch(`${host}/skServer/n2kConfigDevice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'deviceInstance', value: 3, ...body })
    })

  it('sends an instance change to the bus sourceRef names, broadcast off or not', async function () {
    const { sent, stopRecording } = record()
    const res = await configure({ dst: 35, sourceRef: 'bus2.35' })
    stopRecording()
    expect(res.status).to.equal(200)
    expect(sent).to.deep.equal(['nmea2000JsonOut:bus2 126208'])
  })

  it('finds the bus from where the address was seen', async function () {
    const { sent, stopRecording } = record()
    await configure({ dst: 36 })
    stopRecording()
    expect(sent).to.deep.equal(['nmea2000JsonOut:bus1 126208'])
  })
})
