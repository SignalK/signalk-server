import type { Delta, Notification, Path, Zone } from '@signalk/server-api'
import { ALARM_METHOD, ALARM_STATE, hasValues } from '@signalk/server-api'
import { expect } from 'chai'
import { metadataRegistry, removeMetadataFields } from '@signalk/path-metadata'
import {
  defaultZoneMessage,
  getMethod,
  zoneIndexOf,
  Zones
} from '../dist/zones.js'
import * as Bacon from 'baconjs'
import { mock } from 'node:test'

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

    it('stops old alarms after zones are cleared and allows new zones', () => {
      const mockBus = new Bacon.Bus()
      const valueStream = new Bacon.Bus()
      const mockStreambundle: MockStreambundle = {
        getSelfMetaBus: () => mockBus,
        getSelfStream: (_path: Path) => valueStream
      }
      const deltas: Delta[] = []
      new Zones(mockStreambundle as never, (delta) => deltas.push(delta))
      const path = 'test.temperature' as Path
      mockBus.push({ path, value: { zones: [{ upper: 10, state: 'alarm' }] } })
      valueStream.push(5)
      expect(deltas).to.have.lengthOf(1)
      mockBus.push({ path, value: { zones: null } })
      expect(deltas).to.have.lengthOf(2)
      valueStream.push(25)
      valueStream.push(5)
      expect(deltas).to.have.lengthOf(2)
      mockBus.push({ path, value: { zones: [{ lower: 20, state: 'warn' }] } })
      valueStream.push(25)
      expect(deltas).to.have.lengthOf(3)
      const update = deltas[2].updates[0]
      if (hasValues(update)) {
        expect(asNotification(update.values[0].value).state).to.equal('warn')
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

  describe('zone delay', () => {
    beforeEach(() => {
      mock.timers.enable({ apis: ['setTimeout', 'Date'] })
      mock.method(performance, 'now', () => Date.now())
    })
    afterEach(() => {
      mock.timers.reset()
      mock.restoreAll()
    })

    const PATH = 'electrical.batteries.1.voltage'
    const LOW: Zone = {
      lower: 0,
      upper: 12,
      state: ALARM_STATE.warn,
      message: 'Battery low',
      delay: 60
    }
    const VERY_LOW: Zone = {
      lower: 0,
      upper: 11.5,
      state: ALARM_STATE.alarm,
      message: 'Battery very low',
      delay: 60
    }
    const LOW_ABOVE_VERY_LOW: Zone = { ...LOW, lower: 11.5 }

    function watch(zones: Zone[]) {
      const metaBus = new Bacon.Bus()
      const valueStream = new Bacon.Bus()
      const deltas: Delta[] = []
      new Zones(
        {
          getSelfMetaBus: () => metaBus,
          getSelfStream: (_path: Path) => valueStream
        } as never,
        (delta: Delta) => deltas.push(delta)
      )
      metaBus.push({ path: PATH, value: { zones } })
      const notifications = () =>
        deltas.map((delta) => {
          const update = delta.updates[0]
          return hasValues(update)
            ? asNotification(update.values[0].value)
            : undefined
        })
      const states = () => notifications().map((n) => n?.state)
      return { metaBus, valueStream, states, notifications }
    }

    it('notifies once the value has stayed in the zone for its delay', () => {
      const { valueStream, states } = watch([LOW])
      valueStream.push(12.6)
      valueStream.push(11.8)
      mock.timers.tick(59_999)
      expect(states()).to.deep.equal([ALARM_STATE.normal])

      mock.timers.tick(1)
      expect(states()).to.deep.equal([ALARM_STATE.normal, ALARM_STATE.warn])
    })

    it('raises nothing when the value leaves the zone before its delay', () => {
      const { valueStream, states } = watch([LOW])
      valueStream.push(12.6)
      valueStream.push(10.5)
      mock.timers.tick(5_000)
      valueStream.push(12.4)
      mock.timers.tick(120_000)

      expect(states()).to.deep.equal([ALARM_STATE.normal])
    })

    it('counts afresh after the value returned to the zone notified last', () => {
      const { valueStream, states } = watch([LOW])
      valueStream.push(12.6)
      valueStream.push(11.8)
      mock.timers.tick(5_000)
      valueStream.push(12.6)
      mock.timers.tick(600_000)
      valueStream.push(11.8)
      mock.timers.tick(59_999)
      expect(states()).to.deep.equal([ALARM_STATE.normal])

      mock.timers.tick(1)
      expect(states()).to.deep.equal([ALARM_STATE.normal, ALARM_STATE.warn])
    })

    it('keeps counting while the value moves within the zone', () => {
      const { valueStream, states } = watch([LOW])
      valueStream.push(12.6)
      valueStream.push(11.8)
      mock.timers.tick(30_000)
      valueStream.push(11.2)
      mock.timers.tick(30_000)

      expect(states()).to.deep.equal([ALARM_STATE.normal, ALARM_STATE.warn])
    })

    it('keeps the notification of the zone before until the delay ends', () => {
      const { valueStream, states } = watch([
        { ...LOW_ABOVE_VERY_LOW, delay: undefined },
        { ...VERY_LOW, delay: 120 }
      ])
      valueStream.push(11.8)
      valueStream.push(11)
      mock.timers.tick(60_000)
      expect(states()).to.deep.equal([ALARM_STATE.warn])

      mock.timers.tick(60_000)
      expect(states()).to.deep.equal([ALARM_STATE.warn, ALARM_STATE.alarm])
    })

    it('raises the less severe zone when the value keeps crossing between two', () => {
      const { valueStream, states } = watch([LOW_ABOVE_VERY_LOW, VERY_LOW])
      valueStream.push(12.6)
      for (let i = 0; i < 6; i++) {
        valueStream.push(i % 2 ? 11.55 : 11.45)
        mock.timers.tick(20_000)
      }

      expect(states()).to.deep.equal([ALARM_STATE.normal, ALARM_STATE.warn])
    })

    it('counts the delay of a more severe zone from reaching its severity', () => {
      const { valueStream, states } = watch([LOW_ABOVE_VERY_LOW, VERY_LOW])
      valueStream.push(12.6)
      valueStream.push(11.8)
      mock.timers.tick(50_000)
      valueStream.push(11)
      mock.timers.tick(10_000)
      expect(states()).to.deep.equal([ALARM_STATE.normal, ALARM_STATE.warn])

      mock.timers.tick(49_999)
      expect(states()).to.deep.equal([ALARM_STATE.normal, ALARM_STATE.warn])

      mock.timers.tick(1)
      expect(states()).to.deep.equal([
        ALARM_STATE.normal,
        ALARM_STATE.warn,
        ALARM_STATE.alarm
      ])
    })

    it('raises a less severe zone the value went through at its own delay', () => {
      const { valueStream, states } = watch([
        LOW_ABOVE_VERY_LOW,
        { ...VERY_LOW, delay: 120 }
      ])
      valueStream.push(12.6)
      valueStream.push(11.8)
      mock.timers.tick(5_000)
      valueStream.push(11)
      mock.timers.tick(54_999)
      expect(states()).to.deep.equal([ALARM_STATE.normal])

      mock.timers.tick(1)
      expect(states()).to.deep.equal([ALARM_STATE.normal, ALARM_STATE.warn])

      mock.timers.tick(64_999)
      expect(states()).to.deep.equal([ALARM_STATE.normal, ALARM_STATE.warn])

      mock.timers.tick(1)
      expect(states()).to.deep.equal([
        ALARM_STATE.normal,
        ALARM_STATE.warn,
        ALARM_STATE.alarm
      ])
    })

    it('raises a less severe zone that was due when the value went higher', () => {
      const { valueStream, states } = watch([
        LOW_ABOVE_VERY_LOW,
        { ...VERY_LOW, delay: 5 }
      ])
      valueStream.push(12.6)
      valueStream.push(11.8)
      mock.timers.tick(58_000)
      valueStream.push(11)
      mock.timers.tick(3_000)
      valueStream.push(12.6)

      expect(states()).to.deep.equal([
        ALARM_STATE.normal,
        ALARM_STATE.warn,
        ALARM_STATE.normal
      ])
    })

    it('waits the full delay again after the value came back to the zone notified', () => {
      const { valueStream, states } = watch([
        { ...LOW_ABOVE_VERY_LOW, delay: undefined },
        VERY_LOW
      ])
      valueStream.push(11.8)
      valueStream.push(11)
      mock.timers.tick(30_000)
      valueStream.push(11.8)
      mock.timers.tick(5_000)
      valueStream.push(11)
      mock.timers.tick(59_999)
      expect(states()).to.deep.equal([ALARM_STATE.warn])

      mock.timers.tick(1)
      expect(states()).to.deep.equal([ALARM_STATE.warn, ALARM_STATE.alarm])
    })

    it('counts the time at a severity for every zone of it', () => {
      const { valueStream, notifications } = watch([
        { ...VERY_LOW, delay: 30 },
        {
          lower: 15,
          state: ALARM_STATE.alarm,
          message: 'Battery high',
          delay: 5
        } as Zone
      ])
      valueStream.push(12.6)
      valueStream.push(11)
      mock.timers.tick(20_000)
      valueStream.push(16)

      expect(
        notifications()
          .map((n) => n?.message)
          .pop()
      ).to.equal('Battery high')
      expect(notifications()).to.have.length(2)
    })

    it('counts time in a more severe zone toward a less severe one', () => {
      const { valueStream, states } = watch([
        LOW_ABOVE_VERY_LOW,
        { ...VERY_LOW, delay: 120 }
      ])
      valueStream.push(12.6)
      valueStream.push(11)
      mock.timers.tick(30_000)
      valueStream.push(11.8)
      mock.timers.tick(29_999)
      expect(states()).to.deep.equal([ALARM_STATE.normal])

      mock.timers.tick(1)
      expect(states()).to.deep.equal([ALARM_STATE.normal, ALARM_STATE.warn])
    })

    it('raises nothing for a short dip into a more severe zone with a short delay', () => {
      const { valueStream, states } = watch([
        LOW_ABOVE_VERY_LOW,
        { ...VERY_LOW, delay: 10 }
      ])
      valueStream.push(12.6)
      valueStream.push(11.8)
      mock.timers.tick(15_000)
      valueStream.push(10.5)
      mock.timers.tick(3_000)
      valueStream.push(11.8)
      mock.timers.tick(41_999)
      expect(states()).to.deep.equal([ALARM_STATE.normal])

      mock.timers.tick(1)
      expect(states()).to.deep.equal([ALARM_STATE.normal, ALARM_STATE.warn])
    })

    it('moves to a less severe zone without waiting', () => {
      const { valueStream, states } = watch([LOW_ABOVE_VERY_LOW, VERY_LOW])
      valueStream.push(11)
      mock.timers.tick(60_000)
      valueStream.push(11.8)

      expect(states()).to.deep.equal([ALARM_STATE.alarm, ALARM_STATE.warn])
    })

    it('moves to an equally severe zone without waiting', () => {
      const { valueStream, notifications } = watch([
        VERY_LOW,
        { ...VERY_LOW, lower: 15, upper: undefined, message: 'Battery high' }
      ])
      valueStream.push(11)
      mock.timers.tick(60_000)
      valueStream.push(15.5)

      expect(notifications().map((n) => n?.message)).to.deep.equal([
        'Battery very low',
        'Battery high'
      ])
    })

    it('returns to normal without waiting', () => {
      const { valueStream, states } = watch([LOW])
      valueStream.push(11.8)
      mock.timers.tick(60_000)
      valueStream.push(12.6)

      expect(states()).to.deep.equal([ALARM_STATE.warn, ALARM_STATE.normal])
    })

    it('takes a state it does not know as normal', () => {
      const { valueStream, notifications } = watch([
        {
          lower: 12,
          upper: 13,
          state: 'constructor' as ALARM_STATE,
          message: 'Odd'
        },
        LOW
      ])
      valueStream.push(12.5)
      valueStream.push(11.8)
      mock.timers.tick(59_999)
      expect(notifications()).to.have.length(1)

      mock.timers.tick(1)
      expect(notifications()).to.have.length(2)
    })

    it('ignores a delay that is not a number', () => {
      const { valueStream, states } = watch([
        { ...LOW, delay: '60' as unknown as number }
      ])
      valueStream.push(11.8)

      expect(states()).to.deep.equal([ALARM_STATE.warn])
    })

    it('keeps counting when the metadata is sent again with the same zones', () => {
      const { metaBus, valueStream, states } = watch([LOW])
      valueStream.push(11.8)
      mock.timers.tick(30_000)
      metaBus.push({
        path: PATH,
        value: { zones: [{ ...LOW }], displayName: 'House' }
      })
      mock.timers.tick(30_000)

      expect(states()).to.deep.equal([ALARM_STATE.warn])
    })

    it('keeps counting when only the methods change', () => {
      const { metaBus, valueStream, notifications } = watch([LOW])
      valueStream.push(12.6)
      valueStream.push(11.8)
      mock.timers.tick(30_000)
      metaBus.push({
        path: PATH,
        value: { zones: [LOW], warnMethod: [ALARM_METHOD.sound] }
      })
      mock.timers.tick(30_000)

      expect(notifications().map((n) => [n?.state, n?.method])).to.deep.equal([
        [ALARM_STATE.normal, [ALARM_METHOD.visual]],
        [ALARM_STATE.warn, [ALARM_METHOD.sound]]
      ])
    })

    it('sends a raised zone again with methods changed for it', () => {
      const { metaBus, valueStream, notifications } = watch([
        { ...LOW, delay: undefined }
      ])
      valueStream.push(11.8)
      metaBus.push({
        path: PATH,
        value: { zones: [{ ...LOW, delay: undefined }], warnMethod: null }
      })

      expect(notifications().map((n) => n?.method)).to.deep.equal([
        [ALARM_METHOD.visual],
        []
      ])
    })

    it('sends normal again with a normal method changed', () => {
      const { metaBus, valueStream, notifications } = watch([LOW])
      valueStream.push(12.6)
      metaBus.push({ path: PATH, value: { zones: [LOW], normalMethod: null } })

      expect(notifications().map((n) => n?.method)).to.deep.equal([
        [ALARM_METHOD.visual],
        []
      ])
    })

    it('keeps counting when the same zones come with their fields reordered', () => {
      const { metaBus, valueStream, states } = watch([LOW])
      valueStream.push(12.6)
      valueStream.push(11.8)
      mock.timers.tick(30_000)
      const { delay, message, state, upper, lower } = LOW
      metaBus.push({
        path: PATH,
        value: { zones: [{ delay, message, state, upper, lower }] }
      })
      mock.timers.tick(30_000)

      expect(states()).to.deep.equal([ALARM_STATE.normal, ALARM_STATE.warn])
    })

    it('takes a new message given for the same limits', () => {
      const { metaBus, valueStream, notifications } = watch([
        { ...LOW, delay: undefined }
      ])
      valueStream.push(12.6)
      metaBus.push({
        path: PATH,
        value: {
          zones: [{ ...LOW, delay: undefined, message: 'Start battery low' }]
        }
      })
      valueStream.push(11.8)

      expect(notifications().pop()?.message).to.equal('Start battery low')
    })

    it('keeps counting when only a message changes', () => {
      const { metaBus, valueStream, notifications } = watch([LOW])
      valueStream.push(12.6)
      valueStream.push(11.8)
      mock.timers.tick(30_000)
      metaBus.push({
        path: PATH,
        value: { zones: [{ ...LOW, message: 'Start battery low' }] }
      })
      mock.timers.tick(30_000)

      expect(notifications().map((n) => [n?.state, n?.message])).to.deep.equal([
        [ALARM_STATE.normal, 'Value is within normal range'],
        [ALARM_STATE.warn, 'Start battery low']
      ])
    })

    it('sends a raised zone again with its new message', () => {
      const { metaBus, valueStream, notifications } = watch([
        { ...LOW, delay: undefined }
      ])
      valueStream.push(11.8)
      metaBus.push({
        path: PATH,
        value: {
          zones: [{ ...LOW, delay: undefined, message: 'Start battery low' }]
        }
      })

      expect(notifications().map((n) => n?.message)).to.deep.equal([
        'Battery low',
        'Start battery low'
      ])
    })

    it('takes a new delay given for the same limits', () => {
      const { metaBus, valueStream, states } = watch([LOW])
      valueStream.push(12.6)
      metaBus.push({ path: PATH, value: { zones: [{ ...LOW, delay: 5 }] } })
      valueStream.push(11.8)
      mock.timers.tick(5_000)

      expect(states()).to.deep.equal([ALARM_STATE.normal, ALARM_STATE.warn])
    })

    it('moves a raised alarm down at once after the zones change', () => {
      const { metaBus, valueStream, states } = watch([
        LOW_ABOVE_VERY_LOW,
        VERY_LOW
      ])
      valueStream.push(11)
      mock.timers.tick(60_000)
      metaBus.push({
        path: PATH,
        value: { zones: [LOW_ABOVE_VERY_LOW, { ...VERY_LOW, delay: 90 }] }
      })
      valueStream.push(11.8)

      expect(states()).to.deep.equal([ALARM_STATE.alarm, ALARM_STATE.warn])
    })

    it('takes a return to normal as the state before a zone edit', () => {
      const { metaBus, valueStream, states } = watch([
        LOW_ABOVE_VERY_LOW,
        VERY_LOW
      ])
      valueStream.push(11)
      mock.timers.tick(60_000)
      valueStream.push(12.6)
      metaBus.push({
        path: PATH,
        value: { zones: [LOW_ABOVE_VERY_LOW, { ...VERY_LOW, delay: 90 }] }
      })
      valueStream.push(11.8)
      mock.timers.tick(59_999)
      expect(states()).to.deep.equal([ALARM_STATE.alarm, ALARM_STATE.normal])

      mock.timers.tick(1)
      expect(states()).to.deep.equal([
        ALARM_STATE.alarm,
        ALARM_STATE.normal,
        ALARM_STATE.warn
      ])
    })

    it('takes a new method or message for a zone notified before a zone edit', () => {
      const { metaBus, valueStream, notifications } = watch([
        LOW_ABOVE_VERY_LOW,
        VERY_LOW
      ])
      valueStream.push(11.8)
      mock.timers.tick(60_000)
      const zones = [LOW_ABOVE_VERY_LOW, { ...VERY_LOW, delay: 90 }]
      metaBus.push({ path: PATH, value: { zones } })
      valueStream.push(11)
      metaBus.push({
        path: PATH,
        value: { zones, warnMethod: [ALARM_METHOD.sound] }
      })
      metaBus.push({
        path: PATH,
        value: {
          zones: [{ ...zones[0], message: 'Start battery low' }, zones[1]],
          warnMethod: [ALARM_METHOD.sound]
        }
      })
      mock.timers.tick(89_999)
      const sent = () =>
        notifications().map((n) => [n?.state, n?.message, n?.method])
      expect(sent()).to.deep.equal([
        [ALARM_STATE.warn, 'Battery low', [ALARM_METHOD.visual]],
        [ALARM_STATE.warn, 'Battery low', [ALARM_METHOD.sound]],
        [ALARM_STATE.warn, 'Start battery low', [ALARM_METHOD.sound]]
      ])

      mock.timers.tick(1)
      expect(sent().pop()?.[0]).to.equal(ALARM_STATE.alarm)
    })

    it('sends a raised zone again with a method changed along with its delay', () => {
      const { metaBus, valueStream, notifications } = watch([LOW])
      valueStream.push(11.8)
      mock.timers.tick(60_000)
      metaBus.push({
        path: PATH,
        value: {
          zones: [{ ...LOW, delay: 30 }],
          warnMethod: [ALARM_METHOD.sound]
        }
      })

      expect(notifications().map((n) => [n?.state, n?.method])).to.deep.equal([
        [ALARM_STATE.warn, [ALARM_METHOD.visual]],
        [ALARM_STATE.warn, [ALARM_METHOD.sound]]
      ])
    })

    it('waits the delay of a zone raised to a more severe state', () => {
      const { metaBus, valueStream, states } = watch([LOW])
      valueStream.push(11.8)
      mock.timers.tick(60_000)
      metaBus.push({
        path: PATH,
        value: { zones: [{ ...LOW, state: ALARM_STATE.alarm, delay: 30 }] }
      })
      valueStream.push(11.7)
      mock.timers.tick(29_999)
      expect(states()).to.deep.equal([ALARM_STATE.warn])

      mock.timers.tick(1)
      expect(states()).to.deep.equal([ALARM_STATE.warn, ALARM_STATE.alarm])
    })

    it('sends normal once across a zone edit', () => {
      const { metaBus, valueStream, states } = watch([LOW])
      valueStream.push(12.6)
      metaBus.push({ path: PATH, value: { zones: [{ ...LOW, delay: 30 }] } })
      valueStream.push(12.7)

      expect(states()).to.deep.equal([ALARM_STATE.normal])
    })

    it('takes a new method for a notified zone the zones no longer hold', () => {
      const { metaBus, valueStream, notifications } = watch([
        LOW_ABOVE_VERY_LOW,
        VERY_LOW
      ])
      valueStream.push(11.8)
      mock.timers.tick(60_000)
      valueStream.push(11)
      metaBus.push({ path: PATH, value: { zones: [VERY_LOW] } })
      metaBus.push({
        path: PATH,
        value: { zones: [VERY_LOW], warnMethod: [ALARM_METHOD.sound] }
      })

      expect(
        notifications().map((n) => [n?.state, n?.message, n?.method])
      ).to.deep.equal([
        [ALARM_STATE.warn, 'Battery low', [ALARM_METHOD.visual]],
        [ALARM_STATE.warn, 'Battery low', [ALARM_METHOD.sound]]
      ])
    })

    it('raises a zone after a zone edit from the value seen before it', () => {
      const { metaBus, valueStream, states } = watch([LOW])
      valueStream.push(11.8)
      mock.timers.tick(30_000)
      metaBus.push({ path: PATH, value: { zones: [{ ...LOW, delay: 40 }] } })
      mock.timers.tick(39_999)
      expect(states()).to.deep.equal([])

      mock.timers.tick(1)
      expect(states()).to.deep.equal([ALARM_STATE.warn])
    })

    it('moves to normal at once when a zone edit leaves the value outside', () => {
      const { metaBus, valueStream, states } = watch([LOW])
      valueStream.push(11.8)
      mock.timers.tick(60_000)
      metaBus.push({ path: PATH, value: { zones: [{ ...LOW, upper: 11.5 }] } })

      expect(states()).to.deep.equal([ALARM_STATE.warn, ALARM_STATE.normal])
    })

    it('forgets the state notified once the zones were removed', () => {
      const { metaBus, valueStream, states } = watch([VERY_LOW])
      valueStream.push(11)
      mock.timers.tick(60_000)
      metaBus.push({ path: PATH, value: { zones: null } })
      metaBus.push({ path: PATH, value: { zones: [LOW] } })
      valueStream.push(11.8)
      mock.timers.tick(59_999)
      expect(states()).to.deep.equal([ALARM_STATE.alarm, ALARM_STATE.normal])

      mock.timers.tick(1)
      expect(states()).to.deep.equal([
        ALARM_STATE.alarm,
        ALARM_STATE.normal,
        ALARM_STATE.warn
      ])
    })

    it('ignores zones that are not a list', () => {
      const { metaBus, valueStream, states } = watch([LOW])
      metaBus.push({ path: PATH, value: { zones: 'low' } })
      valueStream.push(11.8)
      mock.timers.tick(60_000)

      expect(states()).to.deep.equal([ALARM_STATE.warn])
    })

    it('waits no longer than a timer can for a very long delay', () => {
      const { valueStream, states } = watch([{ ...LOW, delay: 30 * 86_400 }])
      valueStream.push(11.8)
      mock.timers.tick(1_000)
      expect(states()).to.deep.equal([])

      mock.timers.tick(2 ** 31 - 1)
      expect(states()).to.deep.equal([ALARM_STATE.warn])
    })

    it('drops a pending notification when the zones are removed', () => {
      const { metaBus, valueStream, states } = watch([LOW])
      valueStream.push(11.8)
      metaBus.push({ path: PATH, value: { zones: null } })
      mock.timers.tick(120_000)

      expect(states()).to.deep.equal([ALARM_STATE.normal])
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

  describe('default message', () => {
    const zoneWithoutMessage = (lower?: number, upper?: number): Zone => ({
      lower,
      upper,
      state: ALARM_STATE.alert,
      message: ''
    })

    const PATH = 'tanks.freshWater.0.currentLevel' as Path

    afterEach(() => metadataRegistry.reset())

    // the display name as the server keeps it, merged from any meta update
    const setDisplayName = (displayName: unknown) =>
      metadataRegistry.addMetaData('vessels.self', PATH, { displayName })

    const watch = () => {
      const mockBus = new Bacon.Bus()
      const valueStream = new Bacon.Bus()
      const mockStreambundle: MockStreambundle = {
        getSelfMetaBus: () => mockBus,
        getSelfStream: (_path: Path) => valueStream
      }
      const deltas: Delta[] = []
      new Zones(mockStreambundle as never, (delta: Delta) => deltas.push(delta))
      mockBus.push({
        path: PATH,
        value: { zones: [zoneWithoutMessage(0.08, 0.2)] }
      })
      // leave the zone and enter it again, so a message is written each time
      return (value = 0.1) => {
        valueStream.push(0.3)
        valueStream.push(value)
        const update = deltas[deltas.length - 1].updates[0]
        return hasValues(update)
          ? asNotification(update.values[0].value).message
          : undefined
      }
    }

    it('names the value by its display name', () => {
      setDisplayName('Fresh water')
      expect(watch()()).to.equal('Fresh water between 0.08 and 0.2')
    })

    it('names the value by its path without a display name', () => {
      const byPath = `${PATH} between 0.08 and 0.2`
      const enter = watch()
      expect(enter()).to.equal(byPath)
      setDisplayName('')
      expect(enter()).to.equal(byPath)
      setDisplayName(null)
      expect(enter()).to.equal(byPath)
    })

    it('follows a display name set, changed or removed apart from the zones', () => {
      const enter = watch()

      setDisplayName('Fresh water')
      expect(enter()).to.equal('Fresh water between 0.08 and 0.2')

      setDisplayName('Fresh water port')
      expect(enter()).to.equal('Fresh water port between 0.08 and 0.2')

      removeMetadataFields(`vessels.self.${PATH}`, ['displayName'])
      expect(enter()).to.equal(`${PATH} between 0.08 and 0.2`)
    })

    it('sends the standing notification again with a new display name', () => {
      const metaBus = new Bacon.Bus()
      const valueStream = new Bacon.Bus()
      const messages: (string | undefined)[] = []
      new Zones(
        {
          getSelfMetaBus: () => metaBus,
          getSelfStream: (_path: Path) => valueStream
        } as never,
        (delta: Delta) => {
          const update = delta.updates[0]
          messages.push(
            hasValues(update)
              ? asNotification(update.values[0].value).message
              : undefined
          )
        }
      )
      const zones = [zoneWithoutMessage(0.08, 0.2)]
      metaBus.push({ path: PATH, value: { zones } })
      valueStream.push(0.1)
      // A metadata update reaches the zones before the server keeps it
      metaBus.push({ path: PATH, value: { zones, displayName: 'Fresh water' } })
      metaBus.push({ path: PATH, value: { displayName: 'Fresh water port' } })
      metaBus.push({ path: PATH, value: { zones } })

      expect(messages).to.deep.equal([
        `${PATH} between 0.08 and 0.2`,
        'Fresh water between 0.08 and 0.2',
        'Fresh water port between 0.08 and 0.2',
        `${PATH} between 0.08 and 0.2`
      ])
    })

    it('names a zone changed along with the display name once', () => {
      const metaBus = new Bacon.Bus()
      const valueStream = new Bacon.Bus()
      const messages: (string | undefined)[] = []
      new Zones(
        {
          getSelfMetaBus: () => metaBus,
          getSelfStream: (_path: Path) => valueStream
        } as never,
        (delta: Delta) => {
          const update = delta.updates[0]
          messages.push(
            hasValues(update)
              ? asNotification(update.values[0].value).message
              : undefined
          )
        }
      )
      metaBus.push({
        path: PATH,
        value: { zones: [zoneWithoutMessage(0.08, 0.2)] }
      })
      valueStream.push(0.1)
      metaBus.push({
        path: PATH,
        value: {
          zones: [zoneWithoutMessage(0.05, 0.2)],
          displayName: 'Fresh water'
        }
      })

      expect(messages).to.deep.equal([
        `${PATH} between 0.08 and 0.2`,
        'Fresh water between 0.05 and 0.2'
      ])
    })

    it('states an open or a single-value range as such', () => {
      expect(defaultZoneMessage('Bilge', zoneWithoutMessage(1, 1))).to.equal(
        'Bilge at 1'
      )
      expect(
        defaultZoneMessage('Voltage', zoneWithoutMessage(14.4, undefined))
      ).to.equal('Voltage at or above 14.4')
      expect(
        defaultZoneMessage('Voltage', zoneWithoutMessage(undefined, 11.8))
      ).to.equal('Voltage at or below 11.8')
      expect(
        defaultZoneMessage('Voltage', zoneWithoutMessage(undefined, undefined))
      ).to.equal('Voltage')
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
