import { expect } from 'chai'
import { AddressInfo, Server, Socket, createServer } from 'net'
import { ByteDecoder } from '@canboat/wasm'
import WasmN2kBytes from './wasm-n2k-bytes'
import { createMockApp, createDebugStub } from './test-helpers'

const BATTERY = { pgn: 127508, fields: { instance: 0, voltage: 12.5 } }
// Airmar's Master Reset, PGN 126720 proprietary ID 1: no JSON form, so a
// sensor console builds it byte by byte and sends it on nmea2000out.
const AIRMAR_MASTER_RESET =
  '2026-10-19T00:00:00.000Z,3,126720,0,35,6,87,98,01,ff,ff,ff'
// What an IPG100 answers to CONNECT: its serial number, NUL-terminated.
const IPG_CONNECTED = Buffer.from('CONNECTED\t1234567\0')
const RECEIVE_TIMEOUT_MS = 1000

/**
 * What an IPG100 receives: CONNECT, SET_MODE once it has answered, then
 * the frames `encode` builds with a decoder in that same session state.
 */
function ipgSessionBytes(encode: (ipg: ByteDecoder) => Uint8Array[]): Buffer {
  const ipg = new ByteDecoder('maretron-ipg', true, true, true)
  const connect = Buffer.from(ipg.initBytes(''))
  ipg.decodeBytes(IPG_CONNECTED)
  const setMode = Buffer.from(ipg.takePendingTx())
  return Buffer.concat([
    connect,
    setMode,
    ...encode(ipg).map((frame) => Buffer.from(frame))
  ])
}

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

    const expected = ipgSessionBytes((ipg) => [
      ipg.encodeFrame(JSON.stringify(BATTERY), true)
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

  it('keeps TX closed until the IPG has accepted the session', async () => {
    const app = createMockApp()
    let announced = 0
    app.on('nmea2000OutAvailable', () => announced++)

    const stream = new WasmN2kBytes({
      app,
      host: '127.0.0.1',
      port,
      byteKind: 'maretron-ipg',
      createDebug: createDebugStub()
    })

    try {
      const socket = await gateway
      // Drained, or the unread CONNECT keeps the socket from closing.
      socket.resume()
      const partial = IPG_CONNECTED.length - 4
      socket.write(IPG_CONNECTED.subarray(0, partial))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(announced, 'announced on a partial CONNECTED').to.equal(0)

      socket.write(IPG_CONNECTED.subarray(partial))
      const deadline = Date.now() + RECEIVE_TIMEOUT_MS
      while (announced === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      expect(announced).to.equal(1)
    } finally {
      stream.end()
    }
  })

  it('sends nmea2000out lines as given and records like nmea2000JsonOut', async () => {
    const app = createMockApp()
    const errors: unknown[] = []
    app.on('wasm-n2k:error', (err: unknown) => errors.push(err))
    app.on('nmea2000OutAvailable', () => {
      app.emit('nmea2000out', AIRMAR_MASTER_RESET)
      app.emit('nmea2000out', BATTERY)
    })

    const stream = new WasmN2kBytes({
      app,
      host: '127.0.0.1',
      port,
      byteKind: 'maretron-ipg',
      createDebug: createDebugStub()
    })
    app.emit('nmea2000out', AIRMAR_MASTER_RESET)

    const expected = ipgSessionBytes((ipg) => [
      ipg.encodeLine(AIRMAR_MASTER_RESET),
      ipg.encodeFrame(JSON.stringify(BATTERY), true)
    ])

    try {
      const socket = await gateway
      const received = receiveBytes(socket, expected.length)
      socket.write(IPG_CONNECTED)

      expect((await received).equals(expected)).to.equal(true)
      expect(errors).to.deep.equal([])
    } finally {
      stream.end()
    }
  })

  it('transmits only what its own configured events carry', async () => {
    const app = createMockApp()
    const errors: unknown[] = []
    app.on('wasm-n2k:error', (err: unknown) => errors.push(err))
    app.on('nmea2000OutAvailable', () => {
      app.emit('nmea2000JsonOut', BATTERY)
      app.emit('nmea2000out', AIRMAR_MASTER_RESET)
      app.emit('bus2Out', AIRMAR_MASTER_RESET)
      app.emit('bus2JsonOut', BATTERY)
    })

    const stream = new WasmN2kBytes({
      app,
      host: '127.0.0.1',
      port,
      byteKind: 'maretron-ipg',
      outEvent: 'bus2Out',
      jsonOutEvent: 'bus2JsonOut',
      createDebug: createDebugStub()
    })

    const expected = ipgSessionBytes((ipg) => [
      ipg.encodeLine(AIRMAR_MASTER_RESET),
      ipg.encodeFrame(JSON.stringify(BATTERY), true)
    ])

    try {
      const socket = await gateway
      const received = receiveBytes(socket, expected.length)
      socket.write(IPG_CONNECTED)

      expect((await received).equals(expected)).to.equal(true)
      expect(errors).to.deep.equal([])
    } finally {
      stream.end()
    }
  })

  for (const [label, timeout, expected] of [
    ['unset', undefined, 60000],
    ['set', '5', 5000],
    ['0', '0', undefined]
  ] as const) {
    it(`arms the idle timer with the timeout ${label}`, async () => {
      const app = createMockApp()
      const delays: Array<number | undefined> = []
      const realSetTimeout = global.setTimeout
      global.setTimeout = ((callback: () => void, delay?: number) => {
        delays.push(delay)
        return realSetTimeout(callback, delay)
      }) as typeof global.setTimeout
      let stream: WasmN2kBytes | undefined
      try {
        stream = new WasmN2kBytes({
          app,
          host: '127.0.0.1',
          port,
          byteKind: 'maretron-ipg',
          ...(timeout === undefined ? {} : { noDataReceivedTimeout: timeout }),
          createDebug: createDebugStub()
        })
      } finally {
        global.setTimeout = realSetTimeout
      }
      try {
        await gateway
        expect(delays.filter((delay) => delay !== 0)).to.deep.equal(
          expected === undefined ? [] : [expected]
        )
      } finally {
        stream?.end()
      }
    })
  }

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
