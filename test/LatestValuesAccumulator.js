const chai = require('chai')
chai.Should()
const { expect } = chai
const {
  accumulateLatestValue,
  buildFlushDeltas
} = require('../dist/LatestValuesAccumulator')

describe('LatestValuesAccumulator', function () {
  describe('accumulateLatestValue', function () {
    it('should accumulate a single value', function () {
      const accumulator = new Map()
      const delta = {
        context: 'vessels.urn:mrn:imo:mmsi:123456789',
        updates: [
          {
            $source: 'n2k.115',
            timestamp: '2024-01-15T10:30:00.000Z',
            values: [
              {
                path: 'navigation.position',
                value: { latitude: 60.0, longitude: 25.0 }
              }
            ]
          }
        ]
      }

      accumulateLatestValue(accumulator, delta)

      expect(accumulator.size).to.equal(1)
      const key =
        'vessels.urn:mrn:imo:mmsi:123456789:navigation.position:n2k.115'
      expect(accumulator.has(key)).to.be.true
      const item = accumulator.get(key)
      expect(item.context).to.equal('vessels.urn:mrn:imo:mmsi:123456789')
      expect(item.path).to.equal('navigation.position')
      expect(item.value).to.deep.equal({ latitude: 60.0, longitude: 25.0 })
      expect(item.$source).to.equal('n2k.115')
    })

    it('should keep only the latest value for same context:path:$source', function () {
      const accumulator = new Map()
      const delta1 = {
        context: 'vessels.self',
        updates: [
          {
            $source: 'gps',
            timestamp: '2024-01-15T10:30:00.000Z',
            values: [{ path: 'navigation.speedOverGround', value: 5.0 }]
          }
        ]
      }
      const delta2 = {
        context: 'vessels.self',
        updates: [
          {
            $source: 'gps',
            timestamp: '2024-01-15T10:30:01.000Z',
            values: [{ path: 'navigation.speedOverGround', value: 5.5 }]
          }
        ]
      }

      accumulateLatestValue(accumulator, delta1)
      accumulateLatestValue(accumulator, delta2)

      expect(accumulator.size).to.equal(1)
      const item = accumulator.get(
        'vessels.self:navigation.speedOverGround:gps'
      )
      expect(item.value).to.equal(5.5)
      expect(item.timestamp).to.equal('2024-01-15T10:30:01.000Z')
    })

    it('should keep separate values for different $sources', function () {
      const accumulator = new Map()
      const delta1 = {
        context: 'vessels.self',
        updates: [
          {
            $source: 'gps1',
            timestamp: '2024-01-15T10:30:00.000Z',
            values: [{ path: 'navigation.speedOverGround', value: 5.0 }]
          }
        ]
      }
      const delta2 = {
        context: 'vessels.self',
        updates: [
          {
            $source: 'gps2',
            timestamp: '2024-01-15T10:30:00.000Z',
            values: [{ path: 'navigation.speedOverGround', value: 5.2 }]
          }
        ]
      }

      accumulateLatestValue(accumulator, delta1)
      accumulateLatestValue(accumulator, delta2)

      expect(accumulator.size).to.equal(2)
      expect(
        accumulator.get('vessels.self:navigation.speedOverGround:gps1').value
      ).to.equal(5.0)
      expect(
        accumulator.get('vessels.self:navigation.speedOverGround:gps2').value
      ).to.equal(5.2)
    })

    it('should keep separate values for different paths', function () {
      const accumulator = new Map()
      const delta = {
        context: 'vessels.self',
        updates: [
          {
            $source: 'gps',
            timestamp: '2024-01-15T10:30:00.000Z',
            values: [
              { path: 'navigation.speedOverGround', value: 5.0 },
              { path: 'navigation.courseOverGroundTrue', value: 1.57 }
            ]
          }
        ]
      }

      accumulateLatestValue(accumulator, delta)

      expect(accumulator.size).to.equal(2)
      expect(
        accumulator.get('vessels.self:navigation.speedOverGround:gps').value
      ).to.equal(5.0)
      expect(
        accumulator.get('vessels.self:navigation.courseOverGroundTrue:gps')
          .value
      ).to.equal(1.57)
    })

    it('should keep separate values for different contexts', function () {
      const accumulator = new Map()
      const delta1 = {
        context: 'vessels.self',
        updates: [
          {
            $source: 'ais',
            timestamp: '2024-01-15T10:30:00.000Z',
            values: [
              {
                path: 'navigation.position',
                value: { latitude: 60.0, longitude: 25.0 }
              }
            ]
          }
        ]
      }
      const delta2 = {
        context: 'vessels.urn:mrn:imo:mmsi:987654321',
        updates: [
          {
            $source: 'ais',
            timestamp: '2024-01-15T10:30:00.000Z',
            values: [
              {
                path: 'navigation.position',
                value: { latitude: 61.0, longitude: 26.0 }
              }
            ]
          }
        ]
      }

      accumulateLatestValue(accumulator, delta1)
      accumulateLatestValue(accumulator, delta2)

      expect(accumulator.size).to.equal(2)
    })

    it('should use "unknown" for missing $source', function () {
      const accumulator = new Map()
      const delta = {
        context: 'vessels.self',
        updates: [
          {
            timestamp: '2024-01-15T10:30:00.000Z',
            values: [{ path: 'navigation.speedOverGround', value: 5.0 }]
          }
        ]
      }

      accumulateLatestValue(accumulator, delta)

      expect(accumulator.size).to.equal(1)
      expect(accumulator.has('vessels.self:navigation.speedOverGround:unknown'))
        .to.be.true
    })

    it('should handle delta without updates', function () {
      const accumulator = new Map()
      const delta = { context: 'vessels.self' }

      accumulateLatestValue(accumulator, delta)

      expect(accumulator.size).to.equal(0)
    })

    it('should handle update without values', function () {
      const accumulator = new Map()
      const delta = {
        context: 'vessels.self',
        updates: [{ $source: 'gps', timestamp: '2024-01-15T10:30:00.000Z' }]
      }

      accumulateLatestValue(accumulator, delta)

      expect(accumulator.size).to.equal(0)
    })
  })

  describe('buildFlushDeltas', function () {
    it('should return empty array for empty accumulator', function () {
      const accumulator = new Map()
      const deltas = buildFlushDeltas(accumulator, 1000)
      expect(deltas).to.deep.equal([])
    })

    it('should build delta with backpressure indicator', function () {
      const accumulator = new Map()
      accumulator.set('vessels.self:navigation.speedOverGround:gps', {
        context: 'vessels.self',
        path: 'navigation.speedOverGround',
        value: 5.0,
        $source: 'gps',
        timestamp: '2024-01-15T10:30:00.000Z'
      })

      const deltas = buildFlushDeltas(accumulator, 1500)

      expect(deltas.length).to.equal(1)
      expect(deltas[0].context).to.equal('vessels.self')
      expect(deltas[0].$backpressure).to.deep.equal({
        accumulated: 1,
        duration: 1500
      })
    })

    it('should group values by context', function () {
      const accumulator = new Map()
      accumulator.set('vessels.self:navigation.speedOverGround:gps', {
        context: 'vessels.self',
        path: 'navigation.speedOverGround',
        value: 5.0,
        $source: 'gps',
        timestamp: '2024-01-15T10:30:00.000Z'
      })
      accumulator.set('vessels.other:navigation.speedOverGround:ais', {
        context: 'vessels.other',
        path: 'navigation.speedOverGround',
        value: 10.0,
        $source: 'ais',
        timestamp: '2024-01-15T10:30:00.000Z'
      })

      const deltas = buildFlushDeltas(accumulator, 1000)

      expect(deltas.length).to.equal(2)
      const selfDelta = deltas.find((d) => d.context === 'vessels.self')
      const otherDelta = deltas.find((d) => d.context === 'vessels.other')
      expect(selfDelta).to.exist
      expect(otherDelta).to.exist
    })

    it('should group values by $source within context', function () {
      const accumulator = new Map()
      // Two values with same source and timestamp
      accumulator.set('vessels.self:navigation.speedOverGround:gps', {
        context: 'vessels.self',
        path: 'navigation.speedOverGround',
        value: 5.0,
        $source: 'gps',
        timestamp: '2024-01-15T10:30:00.000Z'
      })
      accumulator.set('vessels.self:navigation.courseOverGroundTrue:gps', {
        context: 'vessels.self',
        path: 'navigation.courseOverGroundTrue',
        value: 1.57,
        $source: 'gps',
        timestamp: '2024-01-15T10:30:00.000Z'
      })
      // One value with different source
      accumulator.set('vessels.self:navigation.headingTrue:compass', {
        context: 'vessels.self',
        path: 'navigation.headingTrue',
        value: 1.5,
        $source: 'compass',
        timestamp: '2024-01-15T10:30:00.000Z'
      })

      const deltas = buildFlushDeltas(accumulator, 1000)

      expect(deltas.length).to.equal(1)
      expect(deltas[0].updates.length).to.equal(2) // Two update groups: gps and compass

      const gpsUpdate = deltas[0].updates.find((u) => u.$source === 'gps')
      const compassUpdate = deltas[0].updates.find(
        (u) => u.$source === 'compass'
      )

      expect(gpsUpdate.values.length).to.equal(2)
      expect(compassUpdate.values.length).to.equal(1)
    })

    it('should include accumulated count in backpressure indicator', function () {
      const accumulator = new Map()
      for (let i = 0; i < 10; i++) {
        accumulator.set(`vessels.self:path${i}:source`, {
          context: 'vessels.self',
          path: `path${i}`,
          value: i,
          $source: 'source',
          timestamp: '2024-01-15T10:30:00.000Z'
        })
      }

      const deltas = buildFlushDeltas(accumulator, 2000)

      expect(deltas[0].$backpressure.accumulated).to.equal(10)
      expect(deltas[0].$backpressure.duration).to.equal(2000)
    })
  })
})
