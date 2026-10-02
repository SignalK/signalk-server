import { expect } from 'chai'
import CanboatJs, { cleanQuirks, createParser } from './canboatjs'
import {
  createMockApp,
  collectStreamOutput,
  createDebugStub
} from './test-helpers'

describe('CanboatJs', () => {
  it('parses Actisense format N2K data and pushes PGN object', async () => {
    const app = createMockApp()
    const stream = new CanboatJs({
      app,
      providerId: 'test-provider',
      createDebug: createDebugStub()
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write(
      '2024-01-01T00:00:00.000Z,2,127250,204,255,8,00,10,6e,01,00,ff,7f,fd'
    )
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(1)
    const pgn = results[0] as {
      pgn: number
      fields: { heading: number }
      providerId?: string
    }
    expect(pgn.pgn).to.equal(127250)
    expect(pgn.fields.heading).to.be.a('number')
    expect(pgn.providerId).to.equal('test-provider')
  })

  it('emits analyzerOutEvent on app for each parsed PGN', async () => {
    const app = createMockApp()
    const emitted: unknown[] = []
    app.on('N2KAnalyzerOut', (data: unknown) => emitted.push(data))

    const stream = new CanboatJs({
      app,
      createDebug: createDebugStub()
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write(
      '2024-01-01T00:00:00.000Z,2,127250,204,255,8,00,10,6e,01,00,ff,7f,fd'
    )
    stream.end()

    await outputPromise
    expect(emitted).to.have.length(1)
  })

  it('handles fromFile chunks with timestamp override', async () => {
    const app = createMockApp()
    const stream = new CanboatJs({
      app,
      providerId: 'test-provider',
      createDebug: createDebugStub()
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write({
      fromFile: true,
      data: '2024-01-01T00:00:00.000Z,2,127250,204,255,8,00,10,6e,01,00,ff,7f,fd',
      timestamp: String(new Date('2025-06-15T12:00:00Z').getTime())
    })
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(1)
    const pgn = results[0] as { timestamp: string; providerId?: string }
    expect(pgn.timestamp).to.equal('2025-06-15T12:00:00.000Z')
    expect(pgn.providerId).to.equal('test-provider')
  })

  it('emits canboatjs:unparsed:data for unparseable input', async () => {
    const app = createMockApp()
    const unparsed: unknown[] = []
    app.on('canboatjs:unparsed:data', (data: unknown) => unparsed.push(data))

    const stream = new CanboatJs({
      app,
      createDebug: createDebugStub()
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write('not valid n2k data')
    stream.end()

    await outputPromise
    expect(unparsed).to.have.length(1)
  })
})

describe('cleanQuirks', () => {
  it('drops the empty entries a trailing space leaves', () => {
    expect(cleanQuirks(['gps-rollover=4,1851:491603', '', ' '])).to.deep.equal([
      'gps-rollover=4,1851:491603'
    ])
  })

  it('takes a single string as a list of one', () => {
    expect(cleanQuirks(' gps-rollover ')).to.deep.equal(['gps-rollover'])
  })

  it('leaves no quirks as none', () => {
    expect(cleanQuirks(undefined)).to.equal(undefined)
    expect(cleanQuirks([])).to.deep.equal([])
  })
})

describe('createParser', () => {
  class Accepts {
    constructor(public options: object) {}
  }
  const refusing = (message: string) =>
    class {
      constructor() {
        throw new Error(message)
      }
    }

  it('creates the parser when there are no quirks', () => {
    expect(createParser(Accepts, {}, false)).to.be.instanceOf(Accepts)
    expect(createParser(Accepts, { quirks: [] }, false)).to.be.instanceOf(
      Accepts
    )
  })

  it('passes quirks to a canboatjs that supports them', () => {
    const parser = createParser(Accepts, { quirks: ['gps-rollover'] }, true)
    expect(parser.options).to.deep.equal({ quirks: ['gps-rollover'] })
  })

  it('refuses quirks that are not a list, whatever canboatjs supports', () => {
    for (const supports of [false, true]) {
      expect(() => createParser(Accepts, { quirks: 4 }, supports)).to.throw(
        /^Invalid quirks option: expected a string or a list of strings$/
      )
    }
  })

  it('refuses quirks a canboatjs without quirk support would ignore', () => {
    expect(() =>
      createParser(Accepts, { quirks: ['gps-rollover'] }, false)
    ).to.throw(/^Invalid quirks option: the installed @canboat\/canboatjs/)
  })

  it('names the quirks option when canboatjs does not', () => {
    expect(() =>
      createParser(
        refusing("'vhf' is not a device"),
        { quirks: ['gps-rollover=vhf'] },
        true
      )
    ).to.throw("Invalid quirks option: 'vhf' is not a device")
  })

  it('does not name it twice when canboatjs already does', () => {
    expect(() =>
      createParser(
        refusing("Invalid quirks option: 'vhf' is not a device"),
        { quirks: ['gps-rollover=vhf'] },
        true
      )
    ).to.throw(/^Invalid quirks option: 'vhf' is not a device$/)
  })

  it('leaves an error that has nothing to do with quirks alone', () => {
    expect(() => createParser(refusing('boom'), {}, true)).to.throw(/^boom$/)
  })
})
