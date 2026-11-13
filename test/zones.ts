import type { Delta, Notification, Path, Zone } from '@signalk/server-api'
import { ALARM_METHOD, ALARM_STATE, hasValues } from '@signalk/server-api'
import { expect } from 'chai'
import { getMethod, zoneIndexOf, Zones } from '../dist/zones.js'
import * as Bacon from 'baconjs'

interface MockStreambundle {
  getSelfMetaBus: () => Bacon.Bus<unknown>
  getSelfStream: (_path: Path) => Bacon.Bus<unknown>
}

// Helper to assert value is a Notification
function asNotification(value: unknown): Notification {
  return value as Notification
}

describe('Zones', () => {
  describe('getMethod', () => {
    it('returns the method for a given state', () => {
      const methods = {
        alarmMethod: [ALARM_METHOD.sound, ALARM_METHOD.visual]
      }

      const result = getMethod('alarm', methods)

      expect(result).to.deep.equal([ALARM_METHOD.sound, ALARM_METHOD.visual])
    })

    it('defaults to visual when no method is specified', () => {
      const methods = {}

      const result = getMethod('warn', methods)

      expect(result).to.deep.equal([ALARM_METHOD.visual])
    })

    it('returns correct method for different states', () => {
      const methods = {
        normalMethod: [ALARM_METHOD.visual],
        warnMethod: [ALARM_METHOD.visual, ALARM_METHOD.sound],
        alarmMethod: [ALARM_METHOD.sound, ALARM_METHOD.visual],
        emergencyMethod: [ALARM_METHOD.sound]
      }

      expect(getMethod('normal', methods)).to.deep.equal([ALARM_METHOD.visual])
      expect(getMethod('warn', methods)).to.deep.equal([
        ALARM_METHOD.visual,
        ALARM_METHOD.sound
      ])
      expect(getMethod('alarm', methods)).to.deep.equal([
        ALARM_METHOD.sound,
        ALARM_METHOD.visual
      ])
      expect(getMethod('emergency', methods)).to.deep.equal([
        ALARM_METHOD.sound
      ])
    })

    it('return empty methods when method value is null', () => {
      const methods = {
        warnMethod: null
      }

      const result = getMethod('warn', methods)

      expect(result).to.deep.equal([])
    })
  })

  describe('zone detection', () => {
    it('sends notification when value enters a zone', () => {
      const zones: Zone[] = [
        {
          lower: 0,
          upper: 10,
          state: ALARM_STATE.alarm,
          message: 'Too low'
        },
        {
          lower: 10,
          upper: 20,
          state: ALARM_STATE.warn,
          message: 'Low'
        },
        {
          lower: 20,
          upper: 80,
          state: ALARM_STATE.normal,
          message: 'Normal'
        }
      ]

      const methods = {
        alarmMethod: [ALARM_METHOD.sound],
        warnMethod: [ALARM_METHOD.visual]
      }

      const mockBus = new Bacon.Bus()
      const valueStream = new Bacon.Bus()
      const mockStreambundle: MockStreambundle = {
        getSelfMetaBus: () => mockBus,
        getSelfStream: (_path: Path) => valueStream
      }

      const deltas: Delta[] = []
      const sendDelta = (delta: Delta) => deltas.push(delta)

      // Create zones instance
      new Zones(mockStreambundle as never, sendDelta)

      // Setup zones
      mockBus.push({
        path: 'test.temperature' as Path,
        value: { zones, ...methods }
      })

      // Push value in alarm zone
      valueStream.push(5)

      expect(deltas.length).to.equal(1)
      const update0 = deltas[0].updates[0]
      if (hasValues(update0)) {
        expect(update0.values[0].path).to.equal(
          'notifications.test.temperature'
        )
        expect(asNotification(update0.values[0].value).state).to.equal(
          ALARM_STATE.alarm
        )
        expect(asNotification(update0.values[0].value).method).to.deep.equal([
          ALARM_METHOD.sound
        ])
      }

      // Push value in warn zone
      valueStream.push(15)

      expect(deltas.length).to.equal(2)
      const update1 = deltas[1].updates[0]
      if (hasValues(update1)) {
        expect(asNotification(update1.values[0].value).state).to.equal(
          ALARM_STATE.warn
        )
        expect(asNotification(update1.values[0].value).method).to.deep.equal([
          ALARM_METHOD.visual
        ])
      }

      // Push value in normal zone
      valueStream.push(50)

      expect(deltas.length).to.equal(3)
      const update2 = deltas[2].updates[0]
      if (hasValues(update2)) {
        expect(asNotification(update2.values[0].value).state).to.equal(
          ALARM_STATE.normal
        )
      }
    })

    it('does not send duplicate notifications for same zone', () => {
      const zones: Zone[] = [
        {
          lower: 0,
          upper: 10,
          state: ALARM_STATE.alarm,
          message: 'Too low'
        }
      ]

      const mockBus = new Bacon.Bus()
      const valueStream = new Bacon.Bus()
      const mockStreambundle: MockStreambundle = {
        getSelfMetaBus: () => mockBus,
        getSelfStream: (_path: Path) => valueStream
      }

      const deltas: Delta[] = []
      const sendDelta = (delta: Delta) => deltas.push(delta)

      // Create zones instance
      new Zones(mockStreambundle as never, sendDelta)

      mockBus.push({
        path: 'test.temperature' as Path,
        value: { zones }
      })

      // Push multiple values in same zone
      valueStream.push(5)
      valueStream.push(6)
      valueStream.push(7)

      // Should only send one notification
      expect(deltas.length).to.equal(1)
    })

    it('sends normal notification when value is outside all zones', () => {
      const zones: Zone[] = [
        {
          lower: 10,
          upper: 20,
          state: ALARM_STATE.warn,
          message: 'Warning zone'
        }
      ]

      const mockBus = new Bacon.Bus()
      const valueStream = new Bacon.Bus()
      const mockStreambundle: MockStreambundle = {
        getSelfMetaBus: () => mockBus,
        getSelfStream: (_path: Path) => valueStream
      }

      const deltas: Delta[] = []
      const sendDelta = (delta: Delta) => deltas.push(delta)

      // Create zones instance
      new Zones(mockStreambundle as never, sendDelta)

      mockBus.push({
        path: 'test.temperature' as Path,
        value: { zones }
      })

      // Push value outside all zones
      valueStream.push(25)

      expect(deltas.length).to.equal(1)
      const update = deltas[0].updates[0]
      if (hasValues(update)) {
        expect(asNotification(update.values[0].value).state).to.equal(
          ALARM_STATE.normal
        )
        expect(asNotification(update.values[0].value).message).to.equal(
          'Value is within normal range'
        )
      }
    })

    it('sends normal notification when zones are cleared', () => {
      const mockBus = new Bacon.Bus()
      const mockStreambundle: MockStreambundle = {
        getSelfMetaBus: () => mockBus,
        getSelfStream: (_path: Path) => new Bacon.Bus()
      }

      const deltas: Delta[] = []
      const sendDelta = (delta: Delta) => deltas.push(delta)

      // Create zones instance
      new Zones(mockStreambundle as never, sendDelta)

      // Clear zones
      mockBus.push({
        path: 'test.temperature' as Path,
        value: { zones: null }
      })

      expect(deltas.length).to.equal(1)
      const update = deltas[0].updates[0]
      if (hasValues(update)) {
        expect(update.values[0].path).to.equal('notifications.test.temperature')
        expect(asNotification(update.values[0].value).state).to.equal(
          ALARM_STATE.normal
        )
        expect(asNotification(update.values[0].value).method).to.deep.equal([])
      }
    })
  })

  describe('zone boundaries', () => {
    it('handles lower boundary correctly', () => {
      const zones: Zone[] = [
        {
          lower: 10,
          upper: 20,
          state: ALARM_STATE.warn,
          message: 'Warning'
        }
      ]

      const mockBus = new Bacon.Bus()
      const valueStream = new Bacon.Bus()
      const mockStreambundle: MockStreambundle = {
        getSelfMetaBus: () => mockBus,
        getSelfStream: (_path: Path) => valueStream
      }

      const deltas: Delta[] = []
      const sendDelta = (delta: Delta) => deltas.push(delta)

      // Create zones instance
      new Zones(mockStreambundle as never, sendDelta)

      mockBus.push({
        path: 'test.path' as Path,
        value: { zones }
      })

      // Value exactly at lower boundary should be included
      valueStream.push(10)
      expect(deltas.length).to.equal(1)
      const update0 = deltas[0].updates[0]
      if (hasValues(update0)) {
        expect(asNotification(update0.values[0].value).state).to.equal(
          ALARM_STATE.warn
        )
      }

      // Reset
      deltas.length = 0

      // Value just below lower boundary should not be included
      valueStream.push(9.99)
      expect(deltas.length).to.equal(1)
      const update1 = deltas[0].updates[0]
      if (hasValues(update1)) {
        expect(asNotification(update1.values[0].value).state).to.equal(
          ALARM_STATE.normal
        )
      }
    })

    it('handles upper boundary correctly', () => {
      const zones: Zone[] = [
        {
          lower: 10,
          upper: 20,
          state: ALARM_STATE.warn,
          message: 'Warning'
        }
      ]

      const mockBus = new Bacon.Bus()
      const valueStream = new Bacon.Bus()
      const mockStreambundle: MockStreambundle = {
        getSelfMetaBus: () => mockBus,
        getSelfStream: (_path: Path) => valueStream
      }

      const deltas: Delta[] = []
      const sendDelta = (delta: Delta) => deltas.push(delta)

      // Create zones instance
      new Zones(mockStreambundle as never, sendDelta)

      mockBus.push({
        path: 'test.path' as Path,
        value: { zones }
      })

      // Value exactly at upper boundary should be included
      valueStream.push(20)
      expect(deltas.length).to.equal(1)
      const update0 = deltas[0].updates[0]
      if (hasValues(update0)) {
        expect(asNotification(update0.values[0].value).state).to.equal(
          ALARM_STATE.warn
        )
      }

      // Reset
      deltas.length = 0

      // Value just above upper boundary should not be included
      valueStream.push(20.01)
      expect(deltas.length).to.equal(1)
      const update1 = deltas[0].updates[0]
      if (hasValues(update1)) {
        expect(asNotification(update1.values[0].value).state).to.equal(
          ALARM_STATE.normal
        )
      }
    })
  })

  describe('zoneIndexOf', () => {
    const zone = (lower?: number, upper?: number): Zone => ({
      lower,
      upper,
      state: ALARM_STATE.warn,
      message: ''
    })

    it('gives a value where two zones meet to the zone that starts there', () => {
      const zones = [zone(0, 10), zone(10, 20)]

      expect(zoneIndexOf(zones, 10)).to.equal(1)
      expect(zoneIndexOf([...zones].reverse(), 10)).to.equal(0)
    })

    it('includes the upper limit of the topmost zone', () => {
      // a tank level zone up to 100 %
      expect(zoneIndexOf([zone(0.2, 1)], 1)).to.equal(0)
    })

    it('matches a zone whose limits are the same value', () => {
      // a switch or bilge sensor that is 1 when on
      const zones = [zone(1, 1)]

      expect(zoneIndexOf(zones, 1)).to.equal(0)
      expect(zoneIndexOf(zones, 0)).to.equal(-1)
    })

    it('gives a value to a single-value zone next to a zone ending there', () => {
      expect(zoneIndexOf([zone(0, 1), zone(1, 1)], 1)).to.equal(1)
    })

    it('gives a value two zones hold alike to the one listed first', () => {
      expect(zoneIndexOf([zone(0, 0), zone(0, 0.1)], 0)).to.equal(0)
      expect(zoneIndexOf([zone(0, 0.1), zone(0, 0)], 0)).to.equal(0)
    })

    it('gives a value at an upper limit to a zone holding it below its own', () => {
      expect(zoneIndexOf([zone(5, 10), zone(0, 100)], 10)).to.equal(1)
    })

    it('never matches a zone whose lower limit is above its upper one', () => {
      expect(zoneIndexOf([zone(-400, -1000)], -400)).to.equal(-1)
      expect(zoneIndexOf([zone(-400, -1000)], -1000)).to.equal(-1)
    })

    it('takes a missing limit as open', () => {
      expect(zoneIndexOf([zone(undefined, 5)], -1e9)).to.equal(0)
      expect(zoneIndexOf([zone(5, undefined)], 1e9)).to.equal(0)
    })

    it('puts no value that is not a number in a zone', () => {
      expect(zoneIndexOf([zone(0, 1)], null)).to.equal(-1)
      expect(zoneIndexOf([zone(0, 1)], 'x')).to.equal(-1)
    })
  })
})
