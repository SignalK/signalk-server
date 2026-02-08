import { expect } from 'chai'
import { NotificationApi } from '../dist/api/notifications/index.js'
import type {
  Delta,
  Context,
  Path,
  Timestamp,
  SourceRef
} from '@signalk/server-api'

describe('NotificationApi', () => {
  it('registers as DeltaInputHandler and filters notifications correctly', async function () {
    // Track handleMessage calls
    const handleMessageCalls: Delta[] = []
    let registeredHandler:
      | ((delta: Delta, next: (delta: Delta) => void) => void)
      | null = null

    // Mock app
    const mockApp = {
      registerDeltaInputHandler: (
        handler: (delta: Delta, next: (delta: Delta) => void) => void
      ) => {
        registeredHandler = handler
      },
      handleMessage: (pluginId: string, delta: Delta) => {
        handleMessageCalls.push(delta)
      },
      config: {
        configPath: '/tmp/test'
      },
      setPluginStatus: () => {},
      setPluginError: () => {},
      signalk: {
        self: {}
      },
      get: () => {},
      post: () => {},
      put: () => {},
      delete: () => {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    // Create NotificationApi instance
    const notificationApi = new NotificationApi(mockApp)
    await notificationApi.start()

    // Verify handler was registered
    void expect(registeredHandler).to.not.be.null

    // Create test delta with voltage and related notifications
    const testDelta: Delta = {
      context: 'vessels.self' as Context,
      updates: [
        {
          $source: 'test.source' as SourceRef,
          timestamp: '2026-02-07T12:00:00.000Z' as Timestamp,
          values: [
            {
              path: 'electrical.batteries.1.voltage' as Path,
              value: 15.5
            },
            {
              path: 'notifications.electrical.batteries.1.voltage' as Path,
              value: {
                state: 'alarm',
                method: ['visual', 'sound'],
                message: 'Battery voltage is too high'
              }
            },
            {
              path: 'notifications.electrical.batteries.1.current' as Path,
              value: {
                state: 'alarm',
                method: ['visual', 'sound'],
                message: 'Battery current over the limit'
              }
            }
          ]
        },
        {
          $source: 'test.source' as SourceRef,
          timestamp: '2026-02-07T12:00:01.000Z' as Timestamp,
          values: [
            {
              path: 'notifications.mob' as Path,
              value: {
                state: 'emergency',
                method: ['visual', 'sound'],
                message: 'Person Overboard!'
              }
            }
          ]
        }
      ]
    }

    // Call the registered handler
    let filteredDelta: Delta | null = null
    registeredHandler!(testDelta, (delta) => {
      filteredDelta = delta
    })

    // Give a tick for any async operations
    await new Promise((resolve) => setImmediate(resolve))

    // Verify filtered delta only contains voltage (notifications filtered out)
    void expect(filteredDelta).to.not.be.null
    expect(filteredDelta!.updates).to.have.lengthOf(1)
    const update = filteredDelta!.updates![0]
    if ('values' in update) {
      expect(update.values).to.have.lengthOf(1)
      expect(update.values[0].path).to.equal('electrical.batteries.1.voltage')
      expect(update.values[0].value).to.equal(15.5)
    } else {
      throw new Error('Expected update to have values property')
    }

    // Verify handleMessage was called three times with notification deltas
    expect(handleMessageCalls).to.have.lengthOf(3)

    // First notification delta (voltage)
    expect(handleMessageCalls[0].context).to.equal('vessels.self')
    expect(handleMessageCalls[0].updates).to.have.lengthOf(1)
    const notificationUpdate = handleMessageCalls[0].updates![0]
    if ('values' in notificationUpdate) {
      expect(notificationUpdate.values[0].path).to.equal(
        'notifications.electrical.batteries.1.voltage'
      )
    } else {
      throw new Error('Expected notification update to have values property')
    }
    expect(notificationUpdate).to.have.property('notificationId')

    // Second notification delta (current)
    expect(handleMessageCalls[1].context).to.equal('vessels.self')
    expect(handleMessageCalls[1].updates).to.have.lengthOf(1)
    const currentNotificationUpdate = handleMessageCalls[1].updates![0]
    if ('values' in currentNotificationUpdate) {
      expect(currentNotificationUpdate.values[0].path).to.equal(
        'notifications.electrical.batteries.1.current'
      )
    } else {
      throw new Error(
        'Expected current notification update to have values property'
      )
    }
    expect(currentNotificationUpdate).to.have.property('notificationId')

    // Third notification delta (MOB)
    expect(handleMessageCalls[2].context).to.equal('vessels.self')
    expect(handleMessageCalls[2].updates).to.have.lengthOf(1)
    const mobNotificationUpdate = handleMessageCalls[2].updates![0]
    if ('values' in mobNotificationUpdate) {
      expect(mobNotificationUpdate.values[0].path).to.equal('notifications.mob')
    } else {
      throw new Error(
        'Expected MOB notification update to have values property'
      )
    }
    expect(mobNotificationUpdate).to.have.property('notificationId')
  })
})
