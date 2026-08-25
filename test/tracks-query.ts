import { expect } from 'chai'
import { parseTracksQuery } from '../dist/api/tracks/query.js'

const parse = (query: Record<string, unknown>) => parseTracksQuery(query)
const errorsFrom = (query: Record<string, unknown>) =>
  parse(query).errors.join('; ')

describe('Track API query parsing', () => {
  describe('time window', () => {
    it('accepts an ISO 8601 duration', () => {
      const { request, errors } = parse({ duration: 'PT2H' })
      expect(errors).to.be.empty
      expect(request.duration?.toString()).to.equal('PT2H')
    })

    it('accepts a bare integer as seconds, as the History API does', () => {
      const { request, errors } = parse({ duration: '900' })
      expect(errors).to.be.empty
      expect(request.duration?.total({ unit: 'seconds' })).to.equal(900)
    })

    it('rejects a duration that is neither', () => {
      expect(errorsFrom({ duration: '2h' })).to.match(/ISO 8601 duration/)
    })

    it('rejects a negative duration', () => {
      // Temporal accepts a leading minus, but a negative window would end
      // before it starts.
      expect(errorsFrom({ duration: '-PT1H', context: 'self' })).to.match(
        /must be a positive duration/
      )
    })

    it('rejects a zero duration, in both forms', () => {
      expect(errorsFrom({ duration: 'PT0S', context: 'self' })).to.match(
        /must be a positive duration/
      )
      expect(errorsFrom({ duration: '0', context: 'self' })).to.match(
        /must be a positive duration/
      )
    })

    it('rejects an out-of-range duration rather than throwing', () => {
      // Temporal refuses a total above its safe range, so the seconds fallback
      // has to catch: otherwise a bad query string surfaces as a 500.
      expect(
        errorsFrom({ duration: '99999999999999999999', context: 'self' })
      ).to.match(/out of range/)
    })

    it('rejects a non-positive resolution', () => {
      expect(errorsFrom({ resolution: 'PT0S', duration: 'PT1H' })).to.match(
        /resolution must be a positive duration/
      )
    })

    it('accepts ISO 8601 instants for from and to', () => {
      const { request, errors } = parse({
        from: '2026-06-01T00:00:00Z',
        to: '2026-06-14T00:00:00Z'
      })
      expect(errors).to.be.empty
      expect(request.from?.toString()).to.contain('2026-06-01')
      expect(request.to?.toString()).to.contain('2026-06-14')
    })

    it('rejects from later than to', () => {
      expect(
        errorsFrom({ from: '2026-06-14T00:00:00Z', to: '2026-06-01T00:00:00Z' })
      ).to.match(/from must be before to/)
    })
  })

  describe('unbounded queries', () => {
    // A single vessel over all time is the point of keeping own-vessel data
    // forever; the same query across every context the server has seen is not.
    it('allows no time window when a single context is given', () => {
      const { errors } = parse({ context: 'self' })
      expect(errors).to.be.empty
    })

    it('rejects no time window with no context', () => {
      expect(errorsFrom({})).to.match(/time window .* is required/)
    })

    it('rejects no time window across several contexts', () => {
      expect(errorsFrom({ contexts: 'vessels.a,vessels.b' })).to.match(
        /time window .* is required/
      )
    })

    it('allows several contexts when a window is given', () => {
      const { errors } = parse({
        contexts: 'vessels.a,vessels.b',
        duration: 'PT1H'
      })
      expect(errors).to.be.empty
    })
  })

  describe('context', () => {
    it('qualifies a bare id with vessels.', () => {
      const { request } = parse({ context: 'urn:mrn:imo:mmsi:123456789' })
      expect(request.contexts).to.deep.equal([
        'vessels.urn:mrn:imo:mmsi:123456789'
      ])
    })

    it('leaves an explicit prefix alone, so aircraft can be queried', () => {
      const { request } = parse({
        context: 'aircraft.urn:mrn:imo:mmsi:111222333'
      })
      expect(request.contexts).to.deep.equal([
        'aircraft.urn:mrn:imo:mmsi:111222333'
      ])
    })

    it('deduplicates repeated contexts', () => {
      // Otherwise the same vessel appears twice in the FeatureCollection.
      const { request } = parse({ contexts: 'self,self', duration: 'PT1H' })
      expect(request.contexts).to.deep.equal(['vessels.self'])
    })

    it('splits a comma-separated list', () => {
      const { request } = parse({
        contexts: 'self, vessels.a ',
        duration: 'PT1H'
      })
      expect(request.contexts).to.have.length(2)
    })
  })

  describe('bbox', () => {
    it('reads west,south,east,north in GeoJSON order', () => {
      const { request, errors } = parse({
        bbox: '24.5,59.9,25.2,60.3',
        duration: 'PT1H'
      })
      expect(errors).to.be.empty
      expect(request.bbox).to.deep.equal([24.5, 59.9, 25.2, 60.3])
    })

    it('accepts a box crossing the antimeridian, where west > east', () => {
      const { request, errors } = parse({
        bbox: '175,-10,-175,10',
        duration: 'PT1H'
      })
      expect(errors).to.be.empty
      expect(request.bbox).to.deep.equal([175, -10, -175, 10])
    })

    it('rejects south greater than north', () => {
      expect(
        errorsFrom({ bbox: '24,60.3,25,59.9', duration: 'PT1H' })
      ).to.match(/south .* must not be greater than north/)
    })

    it('rejects the wrong number of values', () => {
      expect(errorsFrom({ bbox: '24,60,25', duration: 'PT1H' })).to.match(
        /four comma-separated numbers/
      )
    })

    it('rejects a blank component rather than reading it as zero', () => {
      // Number('') is 0, not NaN, so a missing value would otherwise pass the
      // finite check and silently place an edge on the equator.
      expect(
        errorsFrom({ bbox: '24.5,,25.2,60.3', duration: 'PT1H' })
      ).to.match(/four comma-separated numbers/)
      expect(
        errorsFrom({ bbox: '24.5, ,25.2,60.3', duration: 'PT1H' })
      ).to.match(/four comma-separated numbers/)
    })

    it('rejects out-of-range coordinates', () => {
      expect(errorsFrom({ bbox: '24,60,25,120', duration: 'PT1H' })).to.match(
        /latitudes must be between/
      )
    })
  })

  describe('thinning', () => {
    it('accepts maxPoints as a point budget', () => {
      const { request, errors } = parse({ maxPoints: '5000', duration: 'PT1H' })
      expect(errors).to.be.empty
      expect(request.maxPoints).to.equal(5000)
    })

    it('rejects hex and exponential maxPoints', () => {
      // Number() reads both, so a typo would silently become a different
      // budget rather than an error.
      expect(errorsFrom({ maxPoints: '0x10', duration: 'PT1H' })).to.match(
        /positive integer/
      )
      expect(errorsFrom({ maxPoints: '1e3', duration: 'PT1H' })).to.match(
        /positive integer/
      )
    })

    it('rejects a non-positive maxPoints', () => {
      expect(errorsFrom({ maxPoints: '0', duration: 'PT1H' })).to.match(
        /positive integer/
      )
    })

    it('treats epsilon as implying simplify', () => {
      const { request, errors } = parse({ epsilon: '5', duration: 'PT1H' })
      expect(errors).to.be.empty
      expect(request.epsilon).to.equal(5)
      expect(request.simplify).to.equal(true)
    })

    it('accepts simplify on its own, leaving the tolerance to the provider', () => {
      const { request } = parse({
        simplify: 'true',
        bbox: '24,59,25,61',
        duration: 'PT1H'
      })
      expect(request.simplify).to.equal(true)
      expect(request.epsilon).to.equal(undefined)
    })

    it('rejects epsilon combined with simplify=false', () => {
      // epsilon implies simplification, so asking for both is contradictory.
      expect(
        errorsFrom({ epsilon: '5', simplify: 'false', duration: 'PT1H' })
      ).to.match(/cannot be combined with epsilon/)
    })

    it('accepts resolution as a duration', () => {
      const { request, errors } = parse({
        resolution: 'PT1M',
        duration: 'PT1H'
      })
      expect(errors).to.be.empty
      expect(request.resolution?.toString()).to.equal('PT1M')
    })
  })

  describe('flags', () => {
    it('reads a valueless times as true', () => {
      const { request } = parse({ times: '', duration: 'PT1H' })
      expect(request.times).to.equal(true)
    })

    it('honours times=false', () => {
      const { request } = parse({ times: 'false', duration: 'PT1H' })
      expect(request.times).to.equal(false)
    })

    it('rejects an unparseable flag', () => {
      expect(errorsFrom({ times: 'maybe', duration: 'PT1H' })).to.match(
        /must be true or false/
      )
    })

    it('reads geometry=false for a metadata-only listing', () => {
      const { request } = parse({ geometry: 'false', duration: 'PT1H' })
      expect(request.geometry).to.equal(false)
    })
  })

  // A present-but-blank value is a malformed query, not an omitted parameter.
  // Reading `?duration=` as absent would skip the time-window check instead of
  // telling the client what was wrong.
  describe('blank values', () => {
    it('rejects a blank duration rather than treating it as omitted', () => {
      expect(errorsFrom({ duration: '   ', context: 'self' })).to.match(
        /duration must not be empty/
      )
    })

    it('rejects a blank from and to', () => {
      expect(errorsFrom({ from: '', duration: 'PT1H' })).to.match(
        /from must not be empty/
      )
      expect(errorsFrom({ to: '', duration: 'PT1H' })).to.match(
        /to must not be empty/
      )
    })

    it('rejects a blank context', () => {
      expect(errorsFrom({ context: '', duration: 'PT1H' })).to.match(
        /context must not be empty/
      )
    })

    it('rejects a blank bbox, maxPoints and epsilon', () => {
      expect(errorsFrom({ bbox: '  ', duration: 'PT1H' })).to.match(
        /bbox must not be empty/
      )
      expect(errorsFrom({ maxPoints: ' ', duration: 'PT1H' })).to.match(
        /positive integer/
      )
      expect(errorsFrom({ epsilon: '', duration: 'PT1H' })).to.match(
        /positive number of metres/
      )
    })

    it('still treats an absent parameter as omitted', () => {
      const { request, errors } = parse({ context: 'self' })
      expect(errors).to.be.empty
      expect(request.duration).to.equal(undefined)
    })
  })

  it('collects several errors rather than stopping at the first', () => {
    const { errors } = parse({ duration: '2h', bbox: 'nope', maxPoints: '-1' })
    expect(errors.length).to.be.greaterThan(1)
  })
})
