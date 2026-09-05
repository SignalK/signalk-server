/**
 * TypeBox Schema Definitions for the Signal K Alerts API
 *
 * These are the source of truth for the alert shapes: the plugin surface
 * types are derived from them, and the OpenAPI document renders them.
 */

import { Type, type Static } from '@sinclair/typebox'
import { IsoTimeSchema } from './shared-schemas'

export const AlertPrioritySchema = Type.Union(
  [
    Type.Literal('emergency'),
    Type.Literal('alarm'),
    Type.Literal('warning'),
    Type.Literal('caution')
  ],
  {
    $id: 'AlertPriority',
    description:
      'Urgency of the condition, from an emergency down to a caution.'
  }
)

export const AlertStateSchema = Type.Union(
  [
    Type.Literal('normal'),
    Type.Literal('unacknowledged'),
    Type.Literal('acknowledged'),
    Type.Literal('rtn-unacknowledged')
  ],
  {
    $id: 'AlertState',
    description:
      'Lifecycle state. `rtn-unacknowledged` is a condition that ended ' +
      'before anyone acknowledged it.'
  }
)

export const HistoryEventTypeSchema = Type.Union(
  [
    Type.Literal('raise'),
    Type.Literal('acknowledge'),
    Type.Literal('silence'),
    Type.Literal('unsilence'),
    Type.Literal('clear'),
    Type.Literal('escalate')
  ],
  { $id: 'HistoryEventType', description: 'What happened to an alert.' }
)

const AlertPathSchema = Type.String({
  description:
    'The condition this alert names, and its identity. One active alert ' +
    'per path and context.',
  examples: ['propulsion.port.oilPressureLow']
})

export const AlertSchema = Type.Object(
  {
    id: Type.String(),
    path: AlertPathSchema,
    references: Type.Optional(
      Type.Array(Type.String(), {
        description:
          'Data paths the condition concerns. Informational, never identity.'
      })
    ),
    $source: Type.String(),
    source: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    priority: AlertPrioritySchema,
    state: AlertStateSchema,
    condition: Type.Boolean({
      description: 'Whether the underlying condition is still present.'
    }),
    latching: Type.Boolean({
      description:
        'A latched alert is held until acknowledged, even once the ' +
        'condition ends.'
    }),
    silenced: Type.Boolean(),
    silencedUntil: Type.Optional(IsoTimeSchema),
    message: Type.String(),
    group: Type.Optional(Type.String()),
    data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    raisedAt: IsoTimeSchema,
    stateChangedAt: IsoTimeSchema,
    acknowledgedAt: Type.Optional(IsoTimeSchema),
    acknowledgedBy: Type.Optional(Type.String()),
    clearedAt: Type.Optional(IsoTimeSchema),
    sourceOnline: Type.Boolean(),
    lastSourceUpdate: IsoTimeSchema,
    stale: Type.Boolean({
      description:
        'The source stopped reporting. A stale alert stays visible and ' +
        'actionable.'
    }),
    context: Type.Optional(Type.String())
  },
  { $id: 'Alert', description: 'An alert and its lifecycle state.' }
)

export const RaiseAlertRequestSchema = Type.Object(
  {
    path: AlertPathSchema,
    priority: AlertPrioritySchema,
    message: Type.String(),
    references: Type.Optional(Type.Array(Type.String())),
    context: Type.Optional(Type.String()),
    group: Type.Optional(Type.String()),
    latching: Type.Optional(Type.Boolean()),
    data: Type.Optional(Type.Record(Type.String(), Type.Unknown()))
  },
  { $id: 'RaiseAlertRequest', description: 'What it takes to raise an alert.' }
)

export const TransitionResultSchema = Type.Object(
  {
    alert: Type.Union([AlertSchema, Type.Null()], {
      description: 'The alert after the transition, or null once it resolved.'
    }),
    cleared: Type.Boolean({
      description: 'Whether the alert left the active set.'
    }),
    previousState: AlertStateSchema
  },
  {
    $id: 'TransitionResult',
    description: 'The outcome of a transition.',
    required: ['alert', 'cleared', 'previousState']
  }
)

export const HistoryEntrySchema = Type.Object(
  {
    id: Type.String(),
    alertId: Type.String(),
    path: AlertPathSchema,
    context: Type.Optional(Type.String()),
    priority: AlertPrioritySchema,
    message: Type.String(),
    $source: Type.String(),
    eventType: HistoryEventTypeSchema,
    timestamp: IsoTimeSchema,
    userId: Type.Optional(Type.String()),
    previousState: Type.Optional(AlertStateSchema),
    newState: Type.Optional(AlertStateSchema),
    previousPriority: Type.Optional(AlertPrioritySchema),
    newPriority: Type.Optional(AlertPrioritySchema),
    details: Type.Optional(Type.Record(Type.String(), Type.Unknown()))
  },
  { $id: 'HistoryEntry', description: 'One entry in the audit trail.' }
)

export const HistoryQueryResultSchema = Type.Object(
  {
    entries: Type.Array(HistoryEntrySchema),
    total: Type.Integer({
      description: 'Entries matching the query, before paging.'
    })
  },
  { $id: 'HistoryQueryResult' }
)

export const StoreStatusSchema = Type.Object(
  {
    store: Type.Object({
      degraded: Type.Boolean({
        description:
          'True when a write failed. Alerts are still raised and announced, ' +
          'but state may not survive a restart.'
      })
    })
  },
  { $id: 'StoreStatus' }
)

export type Alert = Static<typeof AlertSchema>
export type AlertPriority = Static<typeof AlertPrioritySchema>
export type AlertState = Static<typeof AlertStateSchema>
export type RaiseAlertRequest = Static<typeof RaiseAlertRequestSchema>
export type TransitionResult = Static<typeof TransitionResultSchema>
export type HistoryEntry = Static<typeof HistoryEntrySchema>
export type HistoryEventType = Static<typeof HistoryEventTypeSchema>
