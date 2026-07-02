import { expect } from 'chai'
import { EventEmitter } from 'events'
import Nmea0183ToSignalK from './nmea0183-signalk'
import Liner from './liner'
import { collectStreamOutput } from './test-helpers'

function createNmeaApp() {
  const emitter = new EventEmitter()
  const signalk = new EventEmitter()
  const nmea0183Events: string[] = []
  const signalkEvents: string[] = []

  emitter.on('nmea0183', (s: string) => nmea0183Events.push(s))
  signalk.on('nmea0183', (s: string) => signalkEvents.push(s))

  return Object.assign(emitter, {
    signalk,
    nmea0183Events,
    signalkEvents
  })
}

const RMC_SENTENCE =
  '$IIRMC,120000,A,6000.0000,N,02400.0000,E,5.0,45.0,150124,,,A*53'

describe('Nmea0183ToSignalK', () => {
  it('parses NMEA0183 sentence into Signal K delta', async () => {
    const app = createNmeaApp()
    const stream = new Nmea0183ToSignalK({
      app,
      providerId: 'test'
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write(RMC_SENTENCE)
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(1)
    const delta = results[0] as { updates: Array<{ values: unknown[] }> }
    expect(delta.updates).to.be.an('array')
    expect(delta.updates[0]!.values).to.be.an('array')
  })

  it('emits nmea0183 event on app and signalk', async () => {
    const app = createNmeaApp()
    const stream = new Nmea0183ToSignalK({
      app,
      providerId: 'test'
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write(RMC_SENTENCE)
    stream.end()

    await outputPromise
    expect(app.nmea0183Events).to.have.length(1)
    expect(app.nmea0183Events[0]).to.equal(RMC_SENTENCE)
    expect(app.signalkEvents).to.have.length(1)
  })

  it('suppresses nmea0183 event when suppress0183event is true', async () => {
    const app = createNmeaApp()
    const stream = new Nmea0183ToSignalK({
      app,
      providerId: 'test',
      suppress0183event: true
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write(RMC_SENTENCE)
    stream.end()

    await outputPromise
    expect(app.nmea0183Events).to.have.length(0)
  })

  it('handles TimestampedChunk input', async () => {
    const app = createNmeaApp()
    const stream = new Nmea0183ToSignalK({
      app,
      providerId: 'test'
    })

    const outputPromise = collectStreamOutput(stream)

    const timestamp = new Date('2025-06-15T12:00:00Z').getTime()
    stream.write({
      line: RMC_SENTENCE,
      timestamp
    })
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(1)
    const delta = results[0] as { updates: Array<{ timestamp: Date }> }
    expect(delta.updates[0]!.timestamp).to.be.instanceOf(Date)
    expect(delta.updates[0]!.timestamp.toISOString()).to.equal(
      '2025-06-15T12:00:00.000Z'
    )
  })

  it('handles Buffer input', async () => {
    const app = createNmeaApp()
    const stream = new Nmea0183ToSignalK({
      app,
      providerId: 'test'
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write(Buffer.from(RMC_SENTENCE))
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(1)
  })

  it('does not push delta for unparseable sentences', async () => {
    const app = createNmeaApp()
    const stream = new Nmea0183ToSignalK({
      app,
      providerId: 'test'
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write('not a valid sentence')
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(0)
  })

  it('drops # comment lines without parsing or emitting events', async () => {
    const app = createNmeaApp()
    const stream = new Nmea0183ToSignalK({
      app,
      providerId: 'test'
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write('# not a start bit')
    stream.write('# invalid stop bits')
    stream.write('# anything else upstream wants to say')
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(0)
    expect(app.nmea0183Events).to.have.length(0)
    expect(app.signalkEvents).to.have.length(0)
  })

  it('passes valid sentences through when interleaved with # comments', async () => {
    const app = createNmeaApp()
    const stream = new Nmea0183ToSignalK({
      app,
      providerId: 'test'
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write('# not a start bit')
    stream.write(RMC_SENTENCE)
    stream.write('# invalid stop bits')
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(1)
    expect(app.nmea0183Events).to.deep.equal([RMC_SENTENCE])
  })

  it('drops empty input lines silently', async () => {
    const app = createNmeaApp()
    const stream = new Nmea0183ToSignalK({
      app,
      providerId: 'test'
    })

    const outputPromise = collectStreamOutput(stream)

    stream.write('')
    stream.write('   ')
    stream.end()

    const results = await outputPromise
    expect(results).to.have.length(0)
    expect(app.nmea0183Events).to.have.length(0)
    expect(app.signalkEvents).to.have.length(0)
  })

  it('parses a valid sentence inside a multi-line chunk via Liner', async () => {
    const app = createNmeaApp()
    const liner = new Liner({})
    const stream = new Nmea0183ToSignalK({
      app,
      providerId: 'test'
    })

    liner.pipe(stream)
    const outputPromise = collectStreamOutput(stream)

    // Simulate the OS pipe coalescing several Python print() calls into a
    // single read: a framing-error comment, a real sentence, another
    // comment, all in one chunk. The Liner splits the chunk back into
    // individual lines so the parser sees each one on its own.
    liner.write(`# not a start bit\n${RMC_SENTENCE}\n# invalid stop bits\n`)
    liner.end()

    const results = await outputPromise
    expect(results).to.have.length(1)
    expect(app.nmea0183Events).to.deep.equal([RMC_SENTENCE])
  })

  it('parses N2K-over-0183 (PCDIN) sentence into Signal K delta', async () => {
    const app = createNmeaApp()
    const stream = new Nmea0183ToSignalK({
      app,
      providerId: 'test'
    })

    const outputPromise = collectStreamOutput(stream)

    // PGN 127250 (Vessel Heading) via PCDIN encapsulation
    stream.write('$PCDIN,01F112,00000000,0F,2AAF00D1067414FF*59')
    stream.end()

    const results = await outputPromise
    expect(results.length).to.be.greaterThan(0)
    const delta = results[0] as { updates: Array<{ values: unknown[] }> }
    expect(delta.updates).to.be.an('array')
    expect(delta.updates[0]!.values).to.be.an('array')
  })
})
