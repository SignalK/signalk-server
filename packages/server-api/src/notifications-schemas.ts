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
import { SignalKUuidPattern } from './shared-schemas'

export {
  AlarmStateSchema,
  AlarmMethodSchema,
  AlarmStatusSchema,
  NotificationSchema
}

// ---------------------------------------------------------------------------
// API-specific schemas
// ---------------------------------------------------------------------------

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
    status: Type.Optional(AlarmStatusSchema)
  },
  {
    $id: 'Alarm',
    description: 'Alarm notification value'
  }
)
export type Alarm = Static<typeof AlarmSchema>

/**
 * Notification response wrapper — value containing an alarm.
 */
export const NotificationResponseSchema = Type.Object(
  {
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
