import { expect } from 'chai'
import { parseValuesQuery, splitPathExpression } from '../src/api/history/index'

describe('History API parsing', () => {
  describe('splitPathExpression', () => {
    it('defaults to average aggregation', () => {
      const result = splitPathExpression('navigation.speedOverGround')
      expect(result.path).to.equal('navigation.speedOverGround')
      expect(result.aggregate).to.equal('average')
      expect(result.parameter).to.deep.equal([])
      expect(result.smoothing).to.equal(undefined)
    })

    it('parses 2-segment path:aggregate', () => {
      const result = splitPathExpression('navigation.speedOverGround:max')
      expect(result.aggregate).to.equal('max')
      expect(result.parameter).to.deep.equal([])
      expect(result.smoothing).to.equal(undefined)
    })

    it('parses 3-segment path:aggregate:param (non-smoothing)', () => {
      const result = splitPathExpression('navigation.speedOverGround:sma:5')
      expect(result.aggregate).to.equal('sma')
      expect(result.parameter).to.deep.equal(['5'])
      expect(result.smoothing).to.equal(undefined)
    })

    it('parses 4-segment path:aggregate:sma:param as post-aggregation smoothing', () => {
      const result = splitPathExpression(
        'navigation.speedOverGround:average:sma:5'
      )
      expect(result.aggregate).to.equal('average')
      expect(result.parameter).to.deep.equal([])
      expect(result.smoothing).to.deep.equal({ method: 'sma', parameter: '5' })
    })

    it('parses 4-segment path:aggregate:ema:param as post-aggregation smoothing', () => {
      const result = splitPathExpression(
        'navigation.speedOverGround:min:ema:0.3'
      )
      expect(result.aggregate).to.equal('min')
      expect(result.smoothing).to.deep.equal({
        method: 'ema',
        parameter: '0.3'
      })
    })

    it('forces first aggregation for navigation.position', () => {
      const result = splitPathExpression('navigation.position:average:sma:5')
      expect(result.aggregate).to.equal('first')
      expect(result.smoothing).to.deep.equal({ method: 'sma', parameter: '5' })
    })
  })

  describe('parseValuesQuery', () => {
    const baseQuery = {
      paths: 'navigation.speedOverGround:average',
      duration: 'PT1H'
    }

    it('parses bbox parameter', () => {
      const result = parseValuesQuery({
        ...baseQuery,
        bbox: '-80,25,-79,26'
      })
      expect(result.bbox).to.deep.equal({
        west: -80,
        south: 25,
        east: -79,
        north: 26
      })
      expect(result.radius).to.equal(undefined)
    })

    it('parses radius parameter', () => {
      const result = parseValuesQuery({
        ...baseQuery,
        radius: '-79.5,25.5,5000'
      })
      expect(result.radius).to.deep.equal({
        longitude: -79.5,
        latitude: 25.5,
        distance: 5000
      })
      expect(result.bbox).to.equal(undefined)
    })

    it('parses distance + position (JSON array)', () => {
      const result = parseValuesQuery({
        ...baseQuery,
        distance: '5000',
        position: '[-79.5,25.5]'
      })
      expect(result.radius).to.deep.equal({
        longitude: -79.5,
        latitude: 25.5,
        distance: 5000
      })
      expect(result.bbox).to.equal(undefined)
    })

    it('parses distance + position (comma-separated)', () => {
      const result = parseValuesQuery({
        ...baseQuery,
        distance: '5000',
        position: '-79.5,25.5'
      })
      expect(result.radius).to.deep.equal({
        longitude: -79.5,
        latitude: 25.5,
        distance: 5000
      })
    })

    it('parses distance without position', () => {
      const result = parseValuesQuery({
        ...baseQuery,
        distance: '5000'
      })
      expect(result.radius).to.deep.equal({
        longitude: NaN,
        latitude: NaN,
        distance: 5000
      })
    })

    it('rejects radius and distance together', () => {
      expect(() =>
        parseValuesQuery({
          ...baseQuery,
          radius: '-79.5,25.5,5000',
          distance: '5000'
        })
      ).to.throw('radius and distance/position are mutually exclusive')
    })

    it('rejects bbox and distance together', () => {
      expect(() =>
        parseValuesQuery({
          ...baseQuery,
          bbox: '-80,25,-79,26',
          distance: '5000'
        })
      ).to.throw('bbox and radius/distance are mutually exclusive')
    })

    it('rejects malformed position', () => {
      expect(() =>
        parseValuesQuery({
          ...baseQuery,
          distance: '5000',
          position: 'abc'
        })
      ).to.throw('position must be two comma-separated numbers')
    })

    it('rejects bbox and radius together', () => {
      expect(() =>
        parseValuesQuery({
          ...baseQuery,
          bbox: '-80,25,-79,26',
          radius: '-79.5,25.5,5000'
        })
      ).to.throw('bbox and radius/distance are mutually exclusive')
    })

    it('rejects malformed bbox', () => {
      expect(() =>
        parseValuesQuery({ ...baseQuery, bbox: '-80,25,-79' })
      ).to.throw('bbox must be four comma-separated numbers')
    })

    it('rejects malformed radius', () => {
      expect(() =>
        parseValuesQuery({ ...baseQuery, radius: '-79.5,25.5' })
      ).to.throw('radius must be three comma-separated numbers')
    })

    it('rejects non-numeric bbox values', () => {
      expect(() =>
        parseValuesQuery({ ...baseQuery, bbox: 'a,b,c,d' })
      ).to.throw('bbox must be four comma-separated numbers')
    })

    it('omits bbox and radius when not provided', () => {
      const result = parseValuesQuery(baseQuery)
      expect(result.bbox).to.equal(undefined)
      expect(result.radius).to.equal(undefined)
    })

    it('parses 4-segment path expressions in paths param', () => {
      const result = parseValuesQuery({
        duration: 'PT1H',
        paths: 'navigation.speedOverGround:average:sma:5'
      })
      expect(result.pathSpecs).to.have.length(1)
      expect(result.pathSpecs[0].aggregate).to.equal('average')
      expect(result.pathSpecs[0].smoothing).to.deep.equal({
        method: 'sma',
        parameter: '5'
      })
    })
  })
})
