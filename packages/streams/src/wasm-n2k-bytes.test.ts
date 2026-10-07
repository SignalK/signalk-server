import { expect } from 'chai'
import { AddressInfo, Server, Socket, createServer } from 'net'
import { ByteDecoder } from '@canboat/wasm'
import WasmN2kBytes from './wasm-n2k-bytes'
import { createMockApp, createDebugStub } from './test-helpers'

const BATTERY = { pgn: 127508, fields: { instance: 0, voltage: 12.5 } }
// What an IPG100 answers to CONNECT: its serial number, NUL-terminated.
const IPG_CONNECTED = Buffer.from('CONNECTED\t1234567\0')
const RECEIVE_TIMEOUT_MS = 1000

function receiveBytes(socket: Socket, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let received = Buffer.alloc(0)
    const timer = setTimeout(
      () => reject(new Error(`received ${received.length}/${length} bytes`)),
      RECEIVE_TIMEOUT_MS
    )
    socket.on('data', (chunk: Buffer) => {
      received = Buffer.concat([received, chunk])
      if (received.length >= length) {
        clearTimeout(timer)
        resolve(received)
      }
    })
  })
}

describe('WasmN2kBytes', () => {
  let server: Server
  let port: number
  let gateway: Promise<Socket>

  beforeEach(async () => {
    server = createServer()
    gateway = new Promise((resolve) => server.once('connection', resolve))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  it('announces TX once the gateway answers and drops frames before', async () => {
    const app = createMockApp()
    const errors: unknown[] = []
    app.on('wasm-n2k:error', (err: unknown) => errors.push(err))
    let announced = 0
    app.on('nmea2000OutAvailable', () => {
      announced++
      app.emit('nmea2000JsonOut', BATTERY)
    })

    const stream = new WasmN2kBytes({
      app,
      host: '127.0.0.1',
      port,
      byteKind: 'maretron-ipg',
      createDebug: createDebugStub()
    })
    app.emit('nmea2000JsonOut', BATTERY)

    const reference = new ByteDecoder('maretron-ipg', true, true, true)
    const connect = Buffer.from(reference.initBytes(''))
    reference.decodeBytes(IPG_CONNECTED)
    const expected = Buffer.concat([
      connect,
      Buffer.from(reference.takePendingTx()),
      Buffer.from(reference.encodeFrame(JSON.stringify(BATTERY), true))
    ])

    try {
      const socket = await gateway
      const received = receiveBytes(socket, expected.length)
      expect(announced, 'announced before the gateway answered').to.equal(0)
      socket.write(IPG_CONNECTED)

      expect((await received).equals(expected)).to.equal(true)
      expect(announced).to.equal(1)
      expect(errors).to.deep.equal([])
    } finally {
      stream.end()
    }
  })

  it('reports a port outside the TCP range instead of throwing', () => {
    for (const badPort of [65536, -1]) {
      const app = createMockApp()
      const stream = new WasmN2kBytes({
        app,
        host: '127.0.0.1',
        port: badPort,
        byteKind: 'maretron-ipg',
        providerId: 'test-provider',
        createDebug: createDebugStub()
      })
      expect(app.providerErrors).to.deep.equal([
        {
          id: 'test-provider',
          msg: `invalid TCP port ${badPort} for a wasm N2K connection`
        }
      ])
      stream.end()
    }
  })
})
