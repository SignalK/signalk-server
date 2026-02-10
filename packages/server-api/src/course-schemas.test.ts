import { expect } from 'chai'
import { Value } from '@sinclair/typebox/value'
import {
  PositionSchema,
  IsoTimeSchema,
  ArrivalCircleSchema,
  SetDestinationBodySchema,
  RouteDestinationSchema,
  CourseInfoSchema,
  ActiveRouteSchema,
  NextPreviousPointSchema,
  ArrivalCircleBodySchema,
  TargetArrivalTimeBodySchema,
  PointIndexBodySchema,
  ReverseBodySchema,
  CourseCalculationsSchema
} from './course-schemas'

describe('Course TypeBox Schemas', () => {
  describe('PositionSchema', () => {
    it('accepts valid position', () => {
      expect(Value.Check(PositionSchema, { latitude: -35.5, longitude: 138.7 }))
        .to.be.true
    })

    it('accepts position with altitude', () => {
      expect(
        Value.Check(PositionSchema, {
          latitude: 0,
          longitude: 0,
          altitude: 100
        })
      ).to.be.true
    })

    it('rejects latitude out of range (> 90)', () => {
      expect(Value.Check(PositionSchema, { latitude: 91, longitude: 0 })).to.be
        .false
    })

    it('rejects latitude out of range (< -90)', () => {
      expect(Value.Check(PositionSchema, { latitude: -91, longitude: 0 })).to.be
        .false
    })

    it('rejects longitude out of range (> 180)', () => {
      expect(Value.Check(PositionSchema, { latitude: 0, longitude: 181 })).to.be
        .false
    })

    it('rejects longitude out of range (< -180)', () => {
      expect(Value.Check(PositionSchema, { latitude: 0, longitude: -181 })).to
        .be.false
    })

    it('rejects missing longitude', () => {
      expect(Value.Check(PositionSchema, { latitude: 0 })).to.be.false
    })

    it('rejects missing latitude', () => {
      expect(Value.Check(PositionSchema, { longitude: 0 })).to.be.false
    })

    it('rejects non-number values', () => {
      expect(Value.Check(PositionSchema, { latitude: 'foo', longitude: 0 })).to
        .be.false
    })

    it('accepts boundary values', () => {
      expect(Value.Check(PositionSchema, { latitude: 90, longitude: 180 })).to
        .be.true
      expect(Value.Check(PositionSchema, { latitude: -90, longitude: -180 })).to
        .be.true
    })
  })

  describe('IsoTimeSchema', () => {
    it('accepts valid ISO time with Z', () => {
      expect(Value.Check(IsoTimeSchema, '2022-04-22T05:02:56.484Z')).to.be.true
    })

    it('accepts valid ISO time with offset', () => {
      expect(Value.Check(IsoTimeSchema, '2022-04-22T05:02:56.484-05:00')).to.be
        .true
    })

    it('accepts ISO time without fractional seconds', () => {
      expect(Value.Check(IsoTimeSchema, '2022-04-22T05:02:56Z')).to.be.true
    })

    it('rejects invalid string', () => {
      expect(Value.Check(IsoTimeSchema, 'not-a-time')).to.be.false
    })

    it('rejects non-string', () => {
      expect(Value.Check(IsoTimeSchema, 12345)).to.be.false
    })
  })

  describe('ArrivalCircleSchema', () => {
    it('accepts zero', () => {
      expect(Value.Check(ArrivalCircleSchema, 0)).to.be.true
    })

    it('accepts positive number', () => {
      expect(Value.Check(ArrivalCircleSchema, 500)).to.be.true
    })

    it('rejects negative number', () => {
      expect(Value.Check(ArrivalCircleSchema, -1)).to.be.false
    })

    it('rejects non-number', () => {
      expect(Value.Check(ArrivalCircleSchema, 'foo')).to.be.false
    })
  })

  describe('SetDestinationBodySchema', () => {
    it('accepts position destination', () => {
      expect(
        Value.Check(SetDestinationBodySchema, {
          position: { latitude: -35.5, longitude: 138.7 }
        })
      ).to.be.true
    })

    it('accepts href destination', () => {
      expect(
        Value.Check(SetDestinationBodySchema, {
          href: '/resources/waypoints/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'
        })
      ).to.be.true
    })

    it('accepts destination with arrivalCircle', () => {
      expect(
        Value.Check(SetDestinationBodySchema, {
          position: { latitude: -35.5, longitude: 138.7 },
          arrivalCircle: 99
        })
      ).to.be.true
    })

    it('rejects invalid href pattern', () => {
      expect(
        Value.Check(SetDestinationBodySchema, {
          href: '/resources/waypoints/not-a-uuid'
        })
      ).to.be.false
    })

    it('rejects empty body', () => {
      expect(Value.Check(SetDestinationBodySchema, {})).to.be.false
    })

    it('rejects position with missing longitude', () => {
      expect(
        Value.Check(SetDestinationBodySchema, {
          position: { latitude: -35.5 }
        })
      ).to.be.false
    })

    it('rejects negative arrivalCircle', () => {
      expect(
        Value.Check(SetDestinationBodySchema, {
          position: { latitude: -35.5, longitude: 138.7 },
          arrivalCircle: -10
        })
      ).to.be.false
    })
  })

  describe('RouteDestinationSchema', () => {
    it('accepts valid route with defaults', () => {
      expect(
        Value.Check(RouteDestinationSchema, {
          href: '/resources/routes/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'
        })
      ).to.be.true
    })

    it('accepts route with all options', () => {
      expect(
        Value.Check(RouteDestinationSchema, {
          href: '/resources/routes/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a',
          pointIndex: 3,
          reverse: true,
          arrivalCircle: 200
        })
      ).to.be.true
    })

    it('rejects invalid route href', () => {
      expect(
        Value.Check(RouteDestinationSchema, {
          href: '/resources/routes/not-valid'
        })
      ).to.be.false
    })

    it('rejects missing href', () => {
      expect(Value.Check(RouteDestinationSchema, { pointIndex: 0 })).to.be.false
    })

    it('rejects negative pointIndex', () => {
      expect(
        Value.Check(RouteDestinationSchema, {
          href: '/resources/routes/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a',
          pointIndex: -1
        })
      ).to.be.false
    })
  })

  describe('ActiveRouteSchema', () => {
    it('accepts valid active route', () => {
      expect(
        Value.Check(ActiveRouteSchema, {
          href: '/resources/routes/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a',
          name: 'Test Route',
          pointIndex: 2,
          pointTotal: 10,
          reverse: false
        })
      ).to.be.true
    })

    it('rejects missing required fields', () => {
      expect(
        Value.Check(ActiveRouteSchema, {
          href: '/resources/routes/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'
        })
      ).to.be.false
    })
  })

  describe('NextPreviousPointSchema', () => {
    it('accepts point with position and type', () => {
      expect(
        Value.Check(NextPreviousPointSchema, {
          type: 'RoutePoint',
          position: { latitude: 52.1, longitude: 4.9 }
        })
      ).to.be.true
    })

    it('accepts point with optional href', () => {
      expect(
        Value.Check(NextPreviousPointSchema, {
          href: '/resources/waypoints/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a',
          type: 'Location',
          position: { latitude: 52.1, longitude: 4.9 }
        })
      ).to.be.true
    })

    it('rejects missing position', () => {
      expect(Value.Check(NextPreviousPointSchema, { type: 'RoutePoint' })).to.be
        .false
    })
  })

  describe('CourseInfoSchema', () => {
    it('accepts full course info with null fields', () => {
      expect(
        Value.Check(CourseInfoSchema, {
          startTime: null,
          targetArrivalTime: null,
          arrivalCircle: 0,
          activeRoute: null,
          nextPoint: null,
          previousPoint: null
        })
      ).to.be.true
    })

    it('accepts full course info with values', () => {
      expect(
        Value.Check(CourseInfoSchema, {
          startTime: '2022-04-22T05:02:56.484Z',
          targetArrivalTime: '2022-04-23T10:00:00Z',
          arrivalCircle: 500,
          activeRoute: {
            href: '/resources/routes/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a',
            name: 'Test Route',
            pointIndex: 2,
            pointTotal: 10,
            reverse: false
          },
          nextPoint: {
            type: 'RoutePoint',
            position: { latitude: 52.1, longitude: 4.9 }
          },
          previousPoint: {
            type: 'VesselPosition',
            position: { latitude: 52.0, longitude: 4.8 }
          }
        })
      ).to.be.true
    })

    it('rejects missing required fields', () => {
      expect(Value.Check(CourseInfoSchema, {})).to.be.false
    })
  })

  describe('ArrivalCircleBodySchema', () => {
    it('accepts valid body', () => {
      expect(Value.Check(ArrivalCircleBodySchema, { value: 500 })).to.be.true
    })

    it('rejects negative value', () => {
      expect(Value.Check(ArrivalCircleBodySchema, { value: -1 })).to.be.false
    })

    it('rejects missing value', () => {
      expect(Value.Check(ArrivalCircleBodySchema, {})).to.be.false
    })
  })

  describe('TargetArrivalTimeBodySchema', () => {
    it('accepts valid ISO time', () => {
      expect(
        Value.Check(TargetArrivalTimeBodySchema, {
          value: '2022-04-22T05:02:56.484Z'
        })
      ).to.be.true
    })

    it('accepts null value', () => {
      expect(Value.Check(TargetArrivalTimeBodySchema, { value: null })).to.be
        .true
    })

    it('rejects invalid time string', () => {
      expect(Value.Check(TargetArrivalTimeBodySchema, { value: 'not-a-time' }))
        .to.be.false
    })
  })

  describe('PointIndexBodySchema', () => {
    it('accepts valid index', () => {
      expect(Value.Check(PointIndexBodySchema, { value: 2 })).to.be.true
    })

    it('rejects negative index', () => {
      expect(Value.Check(PointIndexBodySchema, { value: -1 })).to.be.false
    })
  })

  describe('ReverseBodySchema', () => {
    it('accepts empty body', () => {
      expect(Value.Check(ReverseBodySchema, {})).to.be.true
    })

    it('accepts with pointIndex', () => {
      expect(Value.Check(ReverseBodySchema, { pointIndex: 3 })).to.be.true
    })

    it('rejects negative pointIndex', () => {
      expect(Value.Check(ReverseBodySchema, { pointIndex: -1 })).to.be.false
    })
  })

  describe('CourseCalculationsSchema', () => {
    it('accepts minimal calculations', () => {
      expect(
        Value.Check(CourseCalculationsSchema, {
          calcMethod: 'GreatCircle'
        })
      ).to.be.true
    })

    it('accepts full calculations', () => {
      expect(
        Value.Check(CourseCalculationsSchema, {
          calcMethod: 'Rhumbline',
          crossTrackError: 458.784,
          bearingTrackTrue: 4.58491,
          bearingTrackMagnetic: 4.51234,
          distance: 10157,
          bearingTrue: 4.58491,
          bearingMagnetic: 4.51234,
          velocityMadeGood: 7.2653,
          timeToGo: 8491,
          targetSpeed: 2.2653,
          estimatedTimeOfArrival: '2022-04-22T05:02:56.484Z',
          previousPoint: { distance: 10157 },
          route: {
            distance: 15936,
            timeToGo: 10452,
            estimatedTimeOfArrival: '2022-04-22T06:00:00Z'
          }
        })
      ).to.be.true
    })

    it('rejects invalid calcMethod', () => {
      expect(Value.Check(CourseCalculationsSchema, { calcMethod: 'Invalid' }))
        .to.be.false
    })
  })
})
