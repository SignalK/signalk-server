import { expect } from 'chai'
import { NotificationApi } from '../dist/api/notifications/index.js'
import type {
  Delta,
  Context,
  Path,
  Timestamp,
  SourceRef,
  Update
} from '@signalk/server-api'

const SELF_CONTEXT = 'vessels.urn:mrn:signalk:uuid:test-vessel' as Context
const EMPTY_CONTEXT = '' as Context
const OTHER_CONTEXT = 'vessels.urn:mrn:imo:mmsi:123456789' as Context

function createMockApp(selfContext: Context = SELF_CONTEXT) {
  const handleMessageCalls: Delta[] = []
  let registeredHandler:
    | ((delta: Delta, next: (delta: Delta) => void) => void)
    | null = null

  const app = {
    registerDeltaInputHandler: (
      handler: (delta: Delta, next: (delta: Delta) => void) => void
    ) => {
      registeredHandler = handler
    },
    handleMessage: (_pluginId: string, delta: Delta) => {
      handleMessageCalls.push(JSON.parse(JSON.stringify(delta)))
    },
    config: { configPath: '/tmp/test' },
    setPluginStatus: () => {},
    setPluginError: () => {},
    signalk: { self: {} },
    selfContext,
    get: () => {},
    post: () => {},
    put: () => {},
    delete: () => {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any

  return { app, handleMessageCalls, getHandler: () => registeredHandler! }
}

function makeDelta(
  context: Context,
  source: string,
  path: string,
  value: unknown,
  timestamp = '2026-03-27T12:00:00.000Z'
): Delta {
  return {
    context,
    updates: [
      {
        $source: source as SourceRef,
        timestamp: timestamp as Timestamp,
        values: [{ path: path as Path, value }]
      }
    ]
  }
}

function feedDelta(
  handler: (delta: Delta, next: (delta: Delta) => void) => void,
  delta: Delta
): Delta | null {
  let filtered: Delta | null = null
  handler(delta, (d) => {
    filtered = d
  })
  return filtered
}

function getNotificationValues(calls: Delta[]): Array<{
  context: Context
  path: Path
  notificationId: string
  value: unknown
}> {
  return calls.map((d) => {
    const u = d.updates![0] as Update & { notificationId: string }
    const v = 'values' in u ? u.values[0] : undefined
    return {
      context: d.context as Context,
      path: v?.path as Path,
      notificationId: u.notificationId,
      value: v?.value
    }
  })
}

const ALARM_VALUE = {
  state: 'emergency',
  method: ['visual', 'sound'],
  message: 'Person Overboard!'
}

describe('Notification deduplication', () => {
  describe('N2K echo scenario', () => {
    it('does not create duplicate alarm when self-context echo arrives', async () => {
      const { app, handleMessageCalls, getHandler } = createMockApp()
      const api = new NotificationApi(app)
      await api.start()
      const handler = getHandler()

      feedDelta(
        handler,
        makeDelta(
          EMPTY_CONTEXT,
          'signalk-to-nmea2000',
          'notifications.mob.test-id',
          ALARM_VALUE
        )
      )
      await new Promise((resolve) => setImmediate(resolve))

      const alarmsBefore = api.listNotifications()
      const countBefore = Object.keys(alarmsBefore).length
      expect(countBefore).to.equal(1)

      feedDelta(
        handler,
        makeDelta(
          SELF_CONTEXT,
          'n2k-on-canboatjs',
          'notifications.mob.test-id',
          ALARM_VALUE
        )
      )
      await new Promise((resolve) => setImmediate(resolve))

      const alarmsAfter = api.listNotifications()
      const countAfter = Object.keys(alarmsAfter).length
      expect(countAfter).to.equal(1, 'echo should not create a second alarm')

      const notifications = getNotificationValues(handleMessageCalls)
      expect(notifications).to.have.lengthOf(2)
      expect(notifications[0].notificationId).to.not.equal(
        notifications[1].notificationId,
        'echo arrives with a different notificationId'
      )
    })

    it('updates existing alarm value when self-context echo arrives', async () => {
      const { app, handleMessageCalls, getHandler } = createMockApp()
      const api = new NotificationApi(app)
      await api.start()
      const handler = getHandler()

      feedDelta(
        handler,
        makeDelta(
          EMPTY_CONTEXT,
          'signalk-to-nmea2000',
          'notifications.mob.test-id',
          ALARM_VALUE
        )
      )
      await new Promise((resolve) => setImmediate(resolve))

      const updatedValue = {
        state: 'emergency',
        method: ['visual', 'sound'],
        message: 'Person Overboard - position updated!'
      }
      feedDelta(
        handler,
        makeDelta(
          SELF_CONTEXT,
          'n2k-on-canboatjs',
          'notifications.mob.test-id',
          updatedValue
        )
      )
      await new Promise((resolve) => setImmediate(resolve))

      const alarms = api.listNotifications()
      const entries = Object.values(alarms)
      expect(entries).to.have.lengthOf(1)
      expect(entries[0].value.message).to.equal(
        'Person Overboard - position updated!',
        'existing alarm should be updated with echo data'
      )

      expect(handleMessageCalls).to.have.lengthOf(
        2,
        'both original and echo should emit'
      )
    })
  })

  describe('same-ID updates', () => {
    it('updates alarm when same source sends updated value', async () => {
      const { app, handleMessageCalls, getHandler } = createMockApp()
      const api = new NotificationApi(app)
      await api.start()
      const handler = getHandler()

      feedDelta(
        handler,
        makeDelta(
          EMPTY_CONTEXT,
          'test-plugin',
          'notifications.engine.overTemperature',
          { state: 'warn', method: ['visual'], message: 'Engine temp 100C' }
        )
      )
      await new Promise((resolve) => setImmediate(resolve))

      feedDelta(
        handler,
        makeDelta(
          EMPTY_CONTEXT,
          'test-plugin',
          'notifications.engine.overTemperature',
          {
            state: 'alarm',
            method: ['visual', 'sound'],
            message: 'Engine temp 110C'
          }
        )
      )
      await new Promise((resolve) => setImmediate(resolve))

      const alarms = api.listNotifications()
      const entries = Object.values(alarms)
      expect(entries).to.have.lengthOf(1)
      expect(entries[0].value.message).to.equal('Engine temp 110C')
      expect(entries[0].value.state).to.equal('alarm')

      const notifications = getNotificationValues(handleMessageCalls)
      expect(notifications[0].notificationId).to.equal(
        notifications[1].notificationId,
        'same source/path/context reuses notificationId'
      )
    })
  })

  describe('other vessel notifications', () => {
    it('stores notifications from other vessels separately', async () => {
      const { app, getHandler } = createMockApp()
      const api = new NotificationApi(app)
      await api.start()
      const handler = getHandler()

      feedDelta(
        handler,
        makeDelta(
          EMPTY_CONTEXT,
          'test-plugin',
          'notifications.anchor.dragAlarm',
          {
            state: 'alarm',
            method: ['visual', 'sound'],
            message: 'Anchor drag'
          }
        )
      )
      await new Promise((resolve) => setImmediate(resolve))

      feedDelta(
        handler,
        makeDelta(
          OTHER_CONTEXT,
          'ais-receiver',
          'notifications.anchor.dragAlarm',
          {
            state: 'alarm',
            method: ['visual', 'sound'],
            message: 'Anchor drag from other vessel'
          }
        )
      )
      await new Promise((resolve) => setImmediate(resolve))

      const alarms = api.listNotifications()
      const entries = Object.values(alarms)
      expect(entries).to.have.lengthOf(
        2,
        'same path from different vessel should create separate alarms'
      )

      const contexts = entries.map((e) => e.context)
      expect(contexts).to.include(EMPTY_CONTEXT)
      expect(contexts).to.include(OTHER_CONTEXT)
    })

    it('does not deduplicate non-self contexts', async () => {
      const { app, getHandler } = createMockApp()
      const api = new NotificationApi(app)
      await api.start()
      const handler = getHandler()

      feedDelta(
        handler,
        makeDelta(
          OTHER_CONTEXT,
          'ais-receiver',
          'notifications.mob',
          ALARM_VALUE
        )
      )
      await new Promise((resolve) => setImmediate(resolve))

      feedDelta(
        handler,
        makeDelta(
          OTHER_CONTEXT,
          'n2k-on-canboatjs',
          'notifications.mob',
          ALARM_VALUE
        )
      )
      await new Promise((resolve) => setImmediate(resolve))

      const alarms = api.listNotifications()
      const entries = Object.values(alarms)
      expect(entries).to.have.lengthOf(
        2,
        'different sources for non-self context should not be deduplicated'
      )
    })
  })

  describe('self-context variants', () => {
    it('deduplicates when original has selfContext and echo has empty context', async () => {
      const { app, getHandler } = createMockApp()
      const api = new NotificationApi(app)
      await api.start()
      const handler = getHandler()

      feedDelta(
        handler,
        makeDelta(
          SELF_CONTEXT,
          'n2k-on-canboatjs',
          'notifications.mob.test-id',
          ALARM_VALUE
        )
      )
      await new Promise((resolve) => setImmediate(resolve))

      feedDelta(
        handler,
        makeDelta(
          EMPTY_CONTEXT,
          'signalk-to-nmea2000',
          'notifications.mob.test-id',
          ALARM_VALUE
        )
      )
      await new Promise((resolve) => setImmediate(resolve))

      const alarms = api.listNotifications()
      expect(Object.keys(alarms)).to.have.lengthOf(
        1,
        'reverse direction echo should also be deduplicated'
      )
    })
  })
})
