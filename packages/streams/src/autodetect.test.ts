import { expect } from 'chai'
import { EventEmitter } from 'events'
import DeMultiplexer from './autodetect'
import type { DeltaCache } from './types'

function createAutodetectApp() {
  const emitter = new EventEmitter()
  const signalk = new EventEmitter()
  return Object.assign(emitter, {
    selfContext: 'vessels.urn:mrn:imo:mmsi:000000000',
    isNmea2000OutAvailable: false,
    deltaCache: {
      setSourceDelta(_key: string, _delta: object): void {}
    } as DeltaCache,
    handleMessage(_id: string, _delta: object): void {},
    signalk
  })
}

const SK_DELTA = JSON.stringify({
  updates: [
    {
      source: { label: 'test' },
      values: [{ path: 'navigation.speedOverGround', value: 5 }]
    }
  ],
  context: 'vessels.urn:mrn:imo:mmsi:000000000'
})

const MUX_DELTA = `${Date.now()};I;${SK_DELTA}`

describe('DeMultiplexer (autodetect)', () => {
  it('detects multiplexed log format and parses Signal K delta', (done) => {
    const app = createAutodetectApp()
    const demux = new DeMultiplexer({
      app,
      providerId: 'test-auto',
      noThrottle: true
    })

    const results: unknown[] = []
    demux.on('data', (d: unknown) => results.push(d))

    demux.write(MUX_DELTA)

    setTimeout(() => {
      expect(results.length).to.be.greaterThan(0)
      const delta = results[0] as {
        updates: Array<{ values: Array<{ path: string }> }>
      }
      expect(delta.updates[0]!.values[0]!.path).to.equal(
        'navigation.speedOverGround'
      )
      done()
    }, 1000)
  })
})
