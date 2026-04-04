/**
 * TypeBox Schema Definitions for the Signal K Notifications API
 */

import { Type, type Static } from '@sinclair/typebox'
import {
  AlarmStateSchema,
  AlarmMethodSchema,
  AlarmStatusSchema,
  NotificationSchema
} from './protocol-schemas'
import {
  SignalKUuidPattern,
  PositionSchema,
  IsoTimeSchema
} from './shared-schemas'

export {
  AlarmStateSchema,
  AlarmMethodSchema,
  AlarmStatusSchema,
  NotificationSchema
}

/**
 * Alarm method array — wraps the AlarmMethod enum for OpenAPI.
 */
export const AlarmMethodArraySchema = Type.Array(AlarmMethodSchema, {
  $id: 'AlarmMethodArray',
  description: 'Methods to use to raise the alarm.',
  uniqueItems: true,
  examples: [['sound']]
})

/**
 * Alarm object — state, method, message, and optional status.
 * Used as the `value` field in a notification response.
 */
export const AlarmSchema = Type.Object(
  {
    state: AlarmStateSchema,
    method: AlarmMethodArraySchema,
    message: Type.String({ description: 'Message to display or speak' }),
    status: Type.Optional(AlarmStatusSchema),
    id: Type.String({
      description: 'Notification Identifier',
      example: '8dac314c-ef20-4e6f-9098-db64ce20e117'
    }),
    position: Type.Optional(PositionSchema),
    createdAt: Type.Optional(IsoTimeSchema),
    data: Type.Optional(Type.Object({}))
  },
  {
    $id: 'Alarm',
    description: 'Alarm notification value'
  }
)
export type Alarm = Static<typeof AlarmSchema>

/**
 * Alarm Options object — state, method, message, and optional status.
 * Used as the `value` field in a notification response.
 */
export const AlarmOptionsSchema = Type.Object(
  {
    state: AlarmStateSchema,
    path: Type.String({
      description: 'Signal K path',
      example: 'notifications.mob.8dac314c-ef20-4e6f-9098-db64ce20e117'
    }),
    message: Type.String({ description: 'Message to display or speak' }),
    position: Type.Boolean({
      description:
        'Set `true` to include the position at which the notification was raised.'
    }),
    createdAt: Type.Boolean({
      description:
        'Set `true` to include the timestamp when the notification was raised.'
    }),
    appendId: Type.Boolean({
      description: 'Set `true` to include the `notificationId` in the path.'
    })
    //meta?: { [key: string]: object | number | string | null | boolean }
  },
  {
    $id: 'AlarmOptions',
    description: 'Alarm Options object'
  }
)
export type AlarmOptions = Static<typeof AlarmOptionsSchema>

/**
 * Notification response wrapper — value containing an alarm.
 */
export const NotificationResponseSchema = Type.Object(
  {
    context: Type.String({
      description: 'Signal K context',
      example: 'vessels.urn:mrn:imo:mmsi:265599691'
    }),
    path: Type.String({
      description: 'Signal K path',
      example: 'notifications.mob.8dac314c-ef20-4e6f-9098-db64ce20e117'
    }),
    value: AlarmSchema
  },
  {
    $id: 'NotificationResponse',
    description: 'Notification with alarm value'
  }
)
export type NotificationResponse = Static<typeof NotificationResponseSchema>

/**
 * Notification ID parameter — UUID v4 format.
 */
export const NotificationIdParamSchema = Type.String({
  $id: 'NotificationIdParam',
  pattern: `${SignalKUuidPattern}$`,
  description: 'Notification identifier',
  examples: ['ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a']
})
