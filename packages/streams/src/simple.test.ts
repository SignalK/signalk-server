import { expect } from 'chai'
import Simple from './simple'
import { createMockApp, createDebugStub } from './test-helpers'

// A connection's input opens as it is made. When a later element of the
// pipeline cannot be made, the input must be closed again, or a serial
// port stays open with nothing reading it.
describe('Simple: a pipeline that cannot be built', () => {
  const serialportPath = require.resolve('./serialport')
  let saved: NodeModule | undefined
  const ended: object[] = []

  before(() => {
    saved = require.cache[serialportPath]
    class FakeSerialport {
      options: object
      constructor(options: object) {
        this.options = options
      }
      pipe(destination: NodeJS.WritableStream) {
        return destination
      }
      end() {
        ended.push(this.options)
        return this
      }
    }
    require.cache[serialportPath] = {
      id: serialportPath,
      filename: serialportPath,
      loaded: true,
      exports: { default: FakeSerialport }
    } as unknown as NodeModule
  })

  after(() => {
    if (saved) {
      require.cache[serialportPath] = saved
    } else {
      delete require.cache[serialportPath]
    }
  })

  it('closes a YDWG-02 USB serial port when its quirks are refused', () => {
    const app = createMockApp()
    expect(
      () =>
        new Simple({
          app,
          providerId: 'ydwg-usb',
          type: 'NMEA2000',
          createDebug: createDebugStub(),
          emitPropertyValue: () => {},
          onPropertyValues: () => {},
          subOptions: {
            type: 'ydwg02-usb-canboatjs',
            device: '/dev/null',
            quirks: 'not-a-list' as unknown as string[]
          }
        } as unknown as ConstructorParameters<typeof Simple>[0])
    ).to.throw(/quirks/)
    expect(ended).to.have.length(1)
  })
})

// The PGN-only filter rows reach canboatjs as excludePgns, so it drops
// those messages before decoding them.
describe('Simple: filters before decoding', () => {
  const canboatjsPath = require.resolve('@canboat/canboatjs')

  function build(extra: object) {
    return new Simple({
      app: createMockApp(),
      providerId: 'n2k-file',
      type: 'FileStream',
      createDebug: createDebugStub(),
      emitPropertyValue: () => {},
      onPropertyValues: () => {},
      subOptions: {
        dataType: 'NMEA2000JS',
        filename: '/dev/null',
        keepRunning: false,
        filtersEnabled: true,
        filters: [{ pgn: '127250' }, { source: '3', pgn: '130306' }],
        ...extra
      }
    } as unknown as ConstructorParameters<typeof Simple>[0])
  }

  // The excludePgns the decoder was made with.
  function decoderExcludePgns(simple: Simple): unknown {
    const pipeline = (simple as unknown as { pipeline: object[] }).pipeline
    const decoder = pipeline.find((e) => 'fromPgn' in e) as {
      fromPgn: { options: { excludePgns?: unknown } }
    }
    return decoder.fromPgn.options.excludePgns
  }

  it('hands the PGN-only filter rows to canboatjs when the switch is on', () => {
    const simple = build({ filtersBeforeDecoding: true })
    expect(decoderExcludePgns(simple)).to.deep.equal(['127250'])
    simple.end()
  })

  it('leaves them to n2k-signalk when the switch is off', () => {
    const simple = build({ filtersBeforeDecoding: false })
    expect(decoderExcludePgns(simple)).to.equal(undefined)
    simple.end()
  })

  it('says so when the installed canboatjs cannot drop them', () => {
    const real = require.cache[canboatjsPath]!
    const exports = { ...real.exports, parseExcludePgns: undefined }
    require.cache[canboatjsPath] = { ...real, exports } as NodeModule
    const warn = console.warn
    const warnings: string[] = []
    console.warn = (message: string) => warnings.push(message)
    try {
      const simple = build({ filtersBeforeDecoding: true })
      expect(decoderExcludePgns(simple)).to.equal(undefined)
      simple.end()
    } finally {
      console.warn = warn
      require.cache[canboatjsPath] = real
    }
    expect(warnings).to.deep.equal([
      "n2k-file: this canboatjs can't drop filtered PGNs before decoding; they are filtered after decoding"
    ])
  })
})
