import { expect } from 'chai'
import * as remoteDeltas from './remote-deltas'

const { hasIdentifiableSource, stampRemoteUpdates } = remoteDeltas

describe('remote-deltas', () => {
  const FALLBACK = 'remote-provider.host:3000'

  describe('hasIdentifiableSource', () => {
    it('true when source.canName is set', () => {
      expect(
        hasIdentifiableSource({
          source: { label: 'canhat', canName: 'c0788c00e7e04312' }
        })
      ).to.equal(true)
    })

    it('true when source.src is set', () => {
      expect(
        hasIdentifiableSource({ source: { label: 'canhat', src: '43' } })
      ).to.equal(true)
    })

    it('true when source.src is zero (valid NMEA2000 address)', () => {
      // src=0 is a real bus address; rejecting it as "no identity" would
      // misroute deltas from any device that won the address claim race
      // for slot 0.
      expect(
        hasIdentifiableSource({ source: { label: 'canhat', src: 0 } })
      ).to.equal(true)
    })

    it('true when source.talker is set', () => {
      expect(
        hasIdentifiableSource({ source: { label: 'nmea', talker: 'GP' } })
      ).to.equal(true)
    })

    it('true when source.label is set', () => {
      expect(hasIdentifiableSource({ source: { label: 'plugin' } })).to.equal(
        true
      )
    })

    it('true when $source is a non-empty string', () => {
      expect(hasIdentifiableSource({ $source: 'some.plugin' })).to.equal(true)
    })

    it('false when $source is empty and no source object', () => {
      expect(hasIdentifiableSource({ $source: '' })).to.equal(false)
      expect(hasIdentifiableSource({})).to.equal(false)
    })

    it('false when source object has no identity fields', () => {
      expect(
        hasIdentifiableSource({
          source: { type: 'NMEA2000' }
        })
      ).to.equal(false)
    })
  })

  describe('stampRemoteUpdates', () => {
    it('leaves updates that already have a source object intact', () => {
      const updates = [
        {
          source: {
            label: 'canhat',
            type: 'NMEA2000',
            canName: 'c0788c00e7e04312',
            src: '43'
          },
          values: [{ path: 'navigation.position', value: { latitude: 1 } }]
        }
      ]
      stampRemoteUpdates(updates, FALLBACK)
      expect(updates[0]!.source).to.have.property('canName', 'c0788c00e7e04312')
      expect(updates[0]!.source).to.have.property('label', 'canhat')
      expect(updates[0]).to.not.have.property('$source')
    })

    it('leaves updates with an existing $source string alone', () => {
      const updates = [{ $source: 'some.plugin', values: [] }]
      stampRemoteUpdates(updates, FALLBACK)
      expect(updates[0]).to.have.property('$source', 'some.plugin')
    })

    it('stamps the fallback on updates that have no identity', () => {
      const updates = [{ values: [] }]
      stampRemoteUpdates(updates, FALLBACK)
      expect(updates[0]).to.have.property('$source', FALLBACK)
    })

    it('is idempotent for already-stamped updates', () => {
      const updates = [{ values: [] }]
      stampRemoteUpdates(updates, FALLBACK)
      stampRemoteUpdates(updates, 'different-fallback')
      expect(updates[0]).to.have.property('$source', FALLBACK)
    })
  })
})
