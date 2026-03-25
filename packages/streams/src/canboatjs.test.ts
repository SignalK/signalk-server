import { expect } from 'chai'
import CanboatJs from './canboatjs'
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
      createDebug: createDebugStub()
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write(
      '2024-01-01T00:00:00.000Z,2,127250,204,255,8,00,10,6e,01,00,ff,7f,fd'
    )
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(1)
    const pgn = results[0] as { pgn: number; fields: { heading: number } }
    expect(pgn.pgn).to.equal(127250)
    expect(pgn.fields.heading).to.be.a('number')
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
    const pgn = results[0] as { timestamp: string }
    expect(pgn.timestamp).to.equal('2025-06-15T12:00:00.000Z')
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
