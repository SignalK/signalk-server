import { expect } from 'chai'
import { EventEmitter } from 'events'
import Nmea0183ToSignalK from './nmea0183-signalk'
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
})
