import { expect } from 'chai'
import WasmN2k from './wasm-n2k'
import {
  createMockApp,
  collectStreamOutput,
  createDebugStub
} from './test-helpers'

const HEADING_LINE =
  '2024-01-01T00:00:00.000Z,2,127250,204,255,8,00,10,6e,01,00,ff,7f,fd'

const canFrame = (pgn: number, src: number, bytes: number[]) => ({
  pgn: { prio: 2, pgn, src, dst: 255 },
  length: bytes.length,
  data: Buffer.from(bytes)
})

describe('WasmN2k', () => {
  it('decodes a text line into a PGN object', async () => {
    const app = createMockApp()
    const stream = new WasmN2k({
      app,
      providerId: 'test-provider',
      createDebug: createDebugStub()
    })
    const outputPromise = collectStreamOutput(stream)

    stream.write(HEADING_LINE)
    stream.end()

    const results = (await outputPromise) as Array<{
      pgn: number
      fields: { heading: number }
      providerId?: string
    }>
    expect(results).to.have.length(1)
    expect(results[0]!.pgn).to.equal(127250)
    expect(results[0]!.fields.heading).to.be.a('number')
    expect(results[0]!.providerId).to.equal('test-provider')
  })

  it('decodes a CAN frame object like the same frame as text', async () => {
    const app = createMockApp()
    const stream = new WasmN2k({ app, createDebug: createDebugStub() })
    const outputPromise = collectStreamOutput(stream)

    stream.write(
      canFrame(127250, 204, [0x00, 0x10, 0x6e, 0x01, 0x00, 0xff, 0x7f, 0xfd])
    )
    stream.end()

    const results = (await outputPromise) as Array<{
      pgn: number
      src: number
      fields: { heading: number }
    }>
    expect(results).to.have.length(1)
    expect(results[0]!.pgn).to.equal(127250)
    expect(results[0]!.src).to.equal(204)
    expect(results[0]!.fields.heading).to.be.closeTo(2.8176, 0.00001)
  })

  it('reassembles fast-packet CAN frames into one PGN', async () => {
    const app = createMockApp()
    const stream = new WasmN2k({ app, createDebug: createDebugStub() })
    const outputPromise = collectStreamOutput(stream)

    // PGN 127489 Engine Parameters, Dynamic: 26 bytes over four frames.
    const payload = [0x00, ...new Array<number>(25).fill(0xff)]
    stream.write(canFrame(127489, 1, [0x40, 26, ...payload.slice(0, 6)]))
    stream.write(canFrame(127489, 1, [0x41, ...payload.slice(6, 13)]))
    stream.write(canFrame(127489, 1, [0x42, ...payload.slice(13, 20)]))
    stream.write(canFrame(127489, 1, [0x43, ...payload.slice(20, 26), 0xff]))
    stream.end()

    const results = (await outputPromise) as Array<{ pgn: number }>
    expect(results).to.have.length(1)
    expect(results[0]!.pgn).to.equal(127489)
  })

  it('reports undecodable input on wasm-n2k:error', async () => {
    const app = createMockApp()
    const errors: unknown[] = []
    app.on('wasm-n2k:error', (err: unknown) => errors.push(err))
    const stream = new WasmN2k({ app, createDebug: createDebugStub() })
    const outputPromise = collectStreamOutput(stream)

    stream.write('2024-01-01T00:00:00.000Z,2,127250,204,255,8,zz')
    stream.end()

    expect(await outputPromise).to.have.length(0)
    expect(errors).to.have.length(1)
  })

  it('emits CRLF-terminated YDWG RAW frames for nmea2000JsonOut', () => {
    const app = createMockApp()
    const sent: string[] = []
    app.on('ydwg02-out', (line: string) => sent.push(line))
    const stream = new WasmN2k({
      app,
      txFormat: 'ydwg-raw',
      txEvent: 'ydwg02-out',
      createDebug: createDebugStub()
    })

    app.emit('nmea2000JsonOut', {
      pgn: 127508,
      prio: 2,
      dst: 255,
      fields: { instance: 0, voltage: 26.27, current: -63.9 }
    })
    stream.end()

    expect(sent).to.deep.equal(['09F21400 00 43 0A 81 FD FF FF FF\r\n'])
  })

  it('stops transmitting once ended', () => {
    const app = createMockApp()
    const sent: string[] = []
    app.on('w2k-1-out', (line: string) => sent.push(line))
    const stream = new WasmN2k({
      app,
      txFormat: 'n2k-ascii',
      txEvent: 'w2k-1-out',
      createDebug: createDebugStub()
    })
    stream.end()

    app.emit('nmea2000JsonOut', { pgn: 127508, fields: { instance: 0 } })

    expect(sent).to.have.length(0)
  })
})
