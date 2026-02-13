/**
 * TypeBox Schema Definitions for Signal K Protocol Types
 *
 * Core protocol schemas: Delta, Update, Source, Notification, Meta, Zone.
 *
 * Metadata sourced from:
 *   specification/schemas/definitions.json
 *   specification/schemas/groups/notifications.json
 */

import { Type, type Static } from '@sinclair/typebox'
import {
  PositionSchema,
  IsoTimePattern,
  SignalKUuidPattern
} from './shared-schemas'

// ---------------------------------------------------------------------------
// Alarm enums
// Keep as TypeScript enums alongside TypeBox enum schemas — enums are values
// used at runtime (switch statements, comparisons), not just types.
// @see specification/schemas/definitions.json#/definitions/alarmState
// @see specification/schemas/definitions.json#/definitions/alarmMethodEnum
// ---------------------------------------------------------------------------

/**
 * Alarm state enum.
 * @see specification/schemas/definitions.json#/definitions/alarmState
 * @category Server API
 */
export enum ALARM_STATE {
  nominal = 'nominal',
  normal = 'normal',
  alert = 'alert',
  warn = 'warn',
  alarm = 'alarm',
  emergency = 'emergency'
}

/**
 * Alarm method enum.
 * @see specification/schemas/definitions.json#/definitions/alarmMethodEnum
 * @category Server API
 */
export enum ALARM_METHOD {
  visual = 'visual',
  sound = 'sound'
}

/**
 * TypeBox schema for alarm state values.
 * Mirrors the ALARM_STATE enum for runtime validation and documentation.
 */
export const AlarmStateSchema = Type.Union(
  [
    Type.Literal('nominal'),
    Type.Literal('normal'),
    Type.Literal('alert'),
    Type.Literal('warn'),
    Type.Literal('alarm'),
    Type.Literal('emergency')
  ],
  {
    $id: 'AlarmState',
    description: 'The alarm state when the value is in this zone.',
    default: 'normal'
  }
)

/**
 * TypeBox schema for alarm method values.
 * Mirrors the ALARM_METHOD enum for runtime validation and documentation.
 */
export const AlarmMethodSchema = Type.Union(
  [Type.Literal('visual'), Type.Literal('sound')],
  {
    $id: 'AlarmMethod',
    description: 'Method to use to raise notifications.'
  }
)

// ---------------------------------------------------------------------------
// Zone
// @see specification/schemas/definitions.json zones definition
// ---------------------------------------------------------------------------

/**
 * A zone defining display and alarm state for a value range.
 * @see specification/schemas/definitions.json zones definition
 */
export const ZoneSchema = Type.Object(
  {
    lower: Type.Optional(
      Type.Number({
        description: 'The lowest number in this zone',
        examples: [3500]
      })
    ),
    upper: Type.Optional(
      Type.Number({
        description: 'The highest value in this zone',
        examples: [4000]
      })
    ),
    state: AlarmStateSchema,
    message: Type.String({
      description: 'The message to display for the alarm.',
      default: 'Warning'
    })
  },
  {
    $id: 'Zone',
    description:
      'A zone used to define the display and alarm state when the value is in between lower and upper.'
  }
)
export type Zone = Static<typeof ZoneSchema>

// ---------------------------------------------------------------------------
// AlarmStatus
// ---------------------------------------------------------------------------

/**
 * Alarm status flags (silenced, acknowledged, etc.).
 */
export const AlarmStatusSchema = Type.Object(
  {
    silenced: Type.Boolean({
      description: 'Whether the alarm has been silenced'
    }),
    acknowledged: Type.Boolean({
      description: 'Whether the alarm has been acknowledged'
    }),
    canSilence: Type.Boolean({
      description: 'Whether the alarm can be silenced'
    }),
    canAcknowledge: Type.Boolean({
      description: 'Whether the alarm can be acknowledged'
    }),
    canClear: Type.Boolean({
      description: 'Whether the alarm can be cleared'
    })
  },
  {
    $id: 'AlarmStatus',
    description: 'Status flags for an active alarm/notification'
  }
)
export type AlarmStatus = Static<typeof AlarmStatusSchema>

// ---------------------------------------------------------------------------
// MetaValue & Meta
// @see specification/schemas/definitions.json commonValueFields
// ---------------------------------------------------------------------------

/**
 * Metadata payload for a Signal K path.
 * Contains display hints, units, timeout, and alarm zones.
 */
export const MetaValueSchema = Type.Object(
  {
    description: Type.Optional(
      Type.String({ description: 'Description of the Signal K path' })
    ),
    units: Type.Optional(
      Type.String({
        description:
          'Allowed units of physical quantities. Units should be (derived) SI units where possible.'
      })
    ),
    example: Type.Optional(
      Type.String({ description: 'An example value for this path' })
    ),
    timeout: Type.Optional(
      Type.Number({
        description:
          'The timeout in seconds after which the value should be considered stale',
        minimum: 0
      })
    ),
    displayName: Type.Optional(
      Type.String({
        description: 'A human-readable display name for this path'
      })
    ),
    displayScale: Type.Optional(
      Type.Object({
        lower: Type.Number({ description: 'Lower bound of display scale' }),
        upper: Type.Number({ description: 'Upper bound of display scale' })
      })
    ),
    zones: Type.Optional(
      Type.Array(ZoneSchema, {
        description:
          'The zones defining the range of values for this Signal K value.'
      })
    ),
    supportsPut: Type.Optional(
      Type.Boolean({
        description: 'Whether this path supports PUT operations'
      })
    )
  },
  {
    $id: 'MetaValue',
    description: 'Metadata about a Signal K path'
  }
)
export type MetaValue = Static<typeof MetaValueSchema>

/**
 * Meta message — a path paired with its metadata.
 */
export const MetaSchema = Type.Object(
  {
    path: Type.String({ description: 'Signal K path' }),
    value: MetaValueSchema
  },
  {
    $id: 'Meta',
    description: 'A path with its metadata value'
  }
)
export type Meta = Static<typeof MetaSchema>

// ---------------------------------------------------------------------------
// Source
// @see specification/schemas/definitions.json#/definitions/source
// ---------------------------------------------------------------------------

/**
 * Source of data in delta format — a record of where the data was received from.
 *
 * Properties cover NMEA 0183 (talker, sentence), NMEA 2000 (src, pgn, canName,
 * instance), and AIS (aisType 1-27) sources.
 *
 * @see specification/schemas/definitions.json#/definitions/source
 */
export const SourceSchema = Type.Object(
  {
    label: Type.String({
      description:
        'A label to identify the source bus, e.g. serial-COM1, eth-local, etc.',
      examples: ['N2K-1']
    }),
    type: Type.Optional(
      Type.String({
        description:
          'A human name to identify the type. NMEA0183, NMEA2000, signalk',
        default: 'NMEA2000',
        examples: ['NMEA2000']
      })
    ),
    // NMEA 2000 fields
    src: Type.Optional(
      Type.String({
        description:
          'NMEA2000 src value or any similar value for encapsulating the original source of the data',
        examples: ['36']
      })
    ),
    canName: Type.Optional(
      Type.String({
        description: 'NMEA2000 CAN name of the source device',
        examples: ['13877444229283709432']
      })
    ),
    pgn: Type.Optional(
      Type.Number({
        description: 'NMEA2000 PGN of the source message',
        examples: [130312]
      })
    ),
    instance: Type.Optional(
      Type.String({
        description: 'NMEA2000 instance value of the source message'
      })
    ),
    // NMEA 0183 fields
    sentence: Type.Optional(
      Type.String({
        description:
          'Sentence type of the source NMEA0183 sentence, e.g. RMC from $GPRMC,...',
        examples: ['RMC']
      })
    ),
    talker: Type.Optional(
      Type.String({
        description:
          'Talker id of the source NMEA0183 sentence, e.g. GP from $GPRMC,...',
        examples: ['GP']
      })
    ),
    // AIS fields
    aisType: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: 27,
        description: 'AIS Message Type',
        examples: [15]
      })
    )
  },
  {
    $id: 'Source',
    description:
      'Source of data in delta format, a record of where the data was received from.'
  }
)
export type Source = Static<typeof SourceSchema>

// ---------------------------------------------------------------------------
// Notification
// @see specification/schemas/groups/notifications.json#/definitions/notification
// ---------------------------------------------------------------------------

/**
 * Notification payload — state, method, message, and optional position/status.
 */
export const NotificationSchema = Type.Object(
  {
    state: AlarmStateSchema,
    method: Type.Array(AlarmMethodSchema, {
      description: 'Methods to use to raise this notification'
    }),
    message: Type.String({
      description: 'Message to display or speak'
    }),
    status: Type.Optional(AlarmStatusSchema),
    position: Type.Optional(
      Type.Ref(PositionSchema, {
        description:
          'Geographic position associated with the notification, when relevant (e.g. MOB, anchor alarm, waypoint arrival)'
      })
    ),
    createdAt: Type.Optional(
      Type.String({
        pattern: IsoTimePattern,
        description: 'ISO 8601 timestamp when the notification was created'
      })
    ),
    id: Type.Optional(
      Type.String({
        pattern: SignalKUuidPattern,
        description: 'Unique notification identifier (UUID)',
        examples: ['ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a']
      })
    )
  },
  {
    $id: 'Notification',
    description: 'A Signal K notification with alarm state and message'
  }
)
export type Notification = Static<typeof NotificationSchema>

// ---------------------------------------------------------------------------
// PathValue
// ---------------------------------------------------------------------------

/**
 * A path-value pair in an update delta.
 */
export const PathValueSchema = Type.Object(
  {
    path: Type.String({ description: 'Signal K path' }),
    value: Type.Unknown({ description: 'The value for this path' })
  },
  {
    $id: 'PathValue',
    description: 'A Signal K path and its value'
  }
)
export type PathValue = Static<typeof PathValueSchema>

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * An update within a delta message.
 * Contains either values[] or meta[] (or both), plus timestamp and source info.
 */
export const UpdateSchema = Type.Object(
  {
    timestamp: Type.Optional(
      Type.String({
        pattern: IsoTimePattern,
        description:
          'RFC 3339 (UTC only without local offset) string representing date and time.'
      })
    ),
    source: Type.Optional(SourceSchema),
    $source: Type.Optional(
      Type.String({
        pattern: '^[A-Za-z0-9-_.]*$',
        description:
          'Reference to the source under /sources. A dot separated path to the data, e.g. [type].[bus].[device]',
        examples: ['NMEA0183.COM1.GP']
      })
    ),
    notificationId: Type.Optional(
      Type.String({ description: 'Notification identifier' })
    ),
    values: Type.Optional(
      Type.Array(PathValueSchema, {
        description: 'Array of path-value pairs'
      })
    ),
    meta: Type.Optional(
      Type.Array(MetaSchema, {
        description: 'Array of path-metadata pairs'
      })
    )
  },
  {
    $id: 'Update',
    description:
      'A Signal K update containing path-value and/or path-meta pairs with timestamp and source'
  }
)
export type UpdateType = Static<typeof UpdateSchema>

// ---------------------------------------------------------------------------
// Delta
// ---------------------------------------------------------------------------

/**
 * A Signal K delta message — the fundamental unit of data exchange.
 * Contains a context (vessel/aircraft/etc.) and one or more updates.
 */
export const DeltaSchema = Type.Object(
  {
    context: Type.Optional(
      Type.String({
        description:
          'The context path, usually a vessel URN (e.g. vessels.urn:mrn:signalk:uuid:...)',
        examples: [
          'vessels.urn:mrn:signalk:uuid:b7590868-1d62-47d9-989c-32321b349fb9'
        ]
      })
    ),
    updates: Type.Array(UpdateSchema, {
      description: 'One or more updates in this delta'
    })
  },
  {
    $id: 'Delta',
    description:
      'A Signal K delta message — the fundamental unit of data exchange'
  }
)
export type DeltaType = Static<typeof DeltaSchema>
