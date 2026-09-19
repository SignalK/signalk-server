/**
 * Alerts subsystem type definitions.
 *
 * The model follows the alerts proposal in SignalK/signalk-server#1857, which is
 * grounded in IMO MSC.302(87) bridge alert management and the IEC 62682 /
 * IEC 62923-1 alarm lifecycle.
 */

import type { Context, Path, SourceRef, Value } from '@signalk/server-api'

/**
 * Alert priority levels following the IMO model.
 *
 * - emergency: Immediate danger to life or vessel; immediate action required
 * - alarm: Conditions requiring immediate attention to maintain safe operation
 * - warning: Conditions requiring attention for precautionary reasons
 * - caution: Conditions requiring attention but not immediately hazardous
 */
export const ALERT_PRIORITIES = Object.freeze([
  'emergency',
  'alarm',
  'warning',
  'caution'
] as const)

export type AlertPriority = (typeof ALERT_PRIORITIES)[number]

/**
 * How urgent each priority is, as a number that sorts.
 *
 * Displacement at the active-set cap and the order an operator reads the list
 * in must agree about which alert matters more, so both read this.
 */
export const PRIORITY_RANK: Readonly<Record<AlertPriority, number>> =
  Object.freeze({
    emergency: 3,
    alarm: 2,
    warning: 1,
    caution: 0
  })

/**
 * Alert states based on the IEC 62682 simplified model.
 *
 * - normal: No active alert condition (State A / cleared)
 * - unacknowledged: Alert active, operator has not acknowledged (State B)
 * - acknowledged: Alert active, operator has acknowledged (State C)
 * - rtn-unacknowledged: Condition cleared before acknowledgment, awaiting ack (State D)
 */
export const ALERT_STATES = Object.freeze([
  'normal',
  'unacknowledged',
  'acknowledged',
  'rtn-unacknowledged'
] as const)

export type AlertState = (typeof ALERT_STATES)[number]

/**
 * Full alert instance representing an active or historical alert.
 *
 * Alerts are the core data structure tracking abnormal conditions that require
 * operator attention. Each alert has a unique ID and tracks its full lifecycle.
 */
export interface Alert {
  /** Unique alert instance ID (UUID) */
  id: string

  /**
   * Descriptive path naming the condition this alert reports, for example
   * `propulsion.port.oilPressureLow`. The path (with `context`) is the alert's
   * identity: at most one alert is active per path, and a repeat raise on the
   * same path updates that alert rather than creating a second one. It names
   * the condition, not the measurement that triggered it — see `references`.
   */
  path: Path

  /**
   * Data paths this alert concerns, for example
   * `propulsion.port.oilPressure`. Informational: consumers use them to link an
   * alert to the values behind it. Never part of the alert's identity.
   */
  references?: Path[]

  /** Signal K source reference (e.g., "n2k-on-ve.can-bus.115", "alertsApi") */
  $source: SourceRef

  /**
   * Signal K structured source object, if available.
   *
   * Typed as an open record rather than the server-api `Source`, which is an
   * alias for `any`.
   */
  source?: Record<string, unknown>

  /** Alert priority level */
  priority: AlertPriority

  /** Current alert state in the IEC 62682 model */
  state: AlertState

  /** Whether the triggering condition is currently active */
  condition: boolean

  /** Whether alert latches (stays active after condition clears) */
  latching: boolean

  /** Whether audible indicators are silenced */
  silenced: boolean

  /** ISO timestamp when silence expires */
  silencedUntil?: string

  /** Human-readable alert message */
  message: string

  /** Optional free-text UI grouping (e.g., "engine", "navigation"); not the IEC alert category A/B/C */
  group?: string

  /** Additional context data */
  data?: Record<string, Value>

  /** ISO timestamp when alert was first raised */
  raisedAt: string

  /**
   * ISO timestamp of the last lifecycle state change
   * (raise/ack/clear/reactivate/escalate). A warning→alarm escalation bumps it,
   * but a latching alarm whose condition clears does NOT (its state stays
   * `unacknowledged`), and silence/unsilence never bump it. Used for
   * IEC 62923-1 6.4.2.2 list ordering.
   *
   * The latching case is deliberately asymmetric. A condition going away is not
   * a new annunciation, so a held alarm keeps its place in the list; the same
   * condition coming back is, so it rises.
   */
  stateChangedAt: string

  /** ISO timestamp when operator acknowledged */
  acknowledgedAt?: string

  /** User/client identifier that acknowledged */
  acknowledgedBy?: string

  /** ISO timestamp when condition cleared */
  clearedAt?: string

  /** Whether the source is currently reachable */
  sourceOnline: boolean

  /** ISO timestamp of last update from source */
  lastSourceUpdate: string

  /** Whether source went offline while alert was active */
  stale: boolean

  /** Vessel context for multi-vessel deployments */
  context?: Context
}

/**
 * Filter criteria for querying alerts.
 */
export interface AlertFilter {
  /** Filter by alert state(s) */
  state?: AlertState | AlertState[]

  /** Filter by priority level(s) */
  priority?: AlertPriority | AlertPriority[]

  /** Filter by group */
  group?: string

  /** Filter by stale status */
  stale?: boolean
}

/**
 * Query parameters for retrieving alert history.
 */
export interface HistoryQuery {
  /** Start of date range; any ISO 8601 instant, offsets included */
  from?: string

  /** End of date range; any ISO 8601 instant, offsets included */
  to?: string

  /** Filter by specific alert ID */
  alertId?: string

  /** Filter by the alert path the events concern */
  path?: Path

  /** Filter by the vessel context the events concern */
  context?: Context

  /** Filter by event type(s) */
  eventType?: HistoryEventType | HistoryEventType[]

  /**
   * Maximum entries to return. A non-negative integer, capped by the store's
   * own page size, which also applies when this is omitted.
   */
  limit?: number

  /** Entries to skip, for paging. A non-negative integer. */
  offset?: number
}

/**
 * Types of events recorded in alert history.
 */
export const HISTORY_EVENT_TYPES = Object.freeze([
  'raise',
  'acknowledge',
  'silence',
  'unsilence',
  'clear',
  'escalate'
] as const)

export type HistoryEventType = (typeof HISTORY_EVENT_TYPES)[number]

/**
 * A single entry in the alert history log.
 *
 * History entries provide a complete audit trail of all alert lifecycle
 * events for compliance and debugging purposes.
 *
 * The alert's identity is copied onto each entry rather than referenced by
 * `alertId` alone. A cleared alert is deleted from the active set, and a new
 * raise on the same path mints a new id, so `alertId` on its own cannot answer
 * what a past event was about.
 */
export interface HistoryEntry {
  /** Unique history entry ID */
  id: string

  /** ID of the alert this entry relates to */
  alertId: string

  /** Descriptive path of the alert this entry relates to */
  path: Path

  /** Vessel context of the alert, when it had one */
  context?: Context

  /** Priority the alert carried when the event occurred */
  priority: AlertPriority

  /** Message the alert carried when the event occurred */
  message: string

  /** Source that owned the alert when the event occurred */
  $source: SourceRef

  /** Type of event that occurred */
  eventType: HistoryEventType

  /** ISO timestamp when the event occurred */
  timestamp: string

  /** User/client that triggered the event (if applicable) */
  userId?: string

  /** Alert state before the event */
  previousState?: AlertState

  /** Alert state after the event */
  newState?: AlertState

  /** Priority before escalation (for escalate events) */
  previousPriority?: AlertPriority

  /** Priority after escalation (for escalate events) */
  newPriority?: AlertPriority

  /** Additional event-specific details */
  details?: Record<string, unknown>
}

/**
 * One lifecycle transition, as the store receives it.
 *
 * The active-set write and the audit appends belong to the same transition, so
 * they are handed over together and commit together. A crash can therefore
 * lose a transition whole, but never apply half of one. The audit trail
 * outlives the alerts it describes by design: a clear removes the active alert
 * and keeps its history.
 */
export interface AlertTransition {
  /** The alert this transition applies to */
  alertId: string

  /** The alert's new value, or null when it leaves the active set */
  alert: Alert | null

  /** Audit entries this transition appends, in order */
  history: Omit<HistoryEntry, 'id'>[]
}

/**
 * Persistence for the alerts subsystem.
 *
 * The AlertManager runs in memory without one, or with one so that alerts
 * survive a restart.
 *
 * Implementations must apply `commit` atomically, and must settle the promises
 * they return without yielding to other manager operations. The manager
 * applies each change to its registry before awaiting the write, and holds no
 * per-alert lock, so an implementation that genuinely suspends would let two
 * operations on one alert interleave. The `node:sqlite` implementation does
 * its work synchronously and satisfies this.
 */
export interface IAlertStore {
  /**
   * Open the database and bring the schema up to date.
   *
   * Rejects when the database cannot be opened or migrated. That is a startup
   * failure: a safety subsystem must not run on a store nobody can read.
   */
  initialize(): Promise<void>

  /**
   * Close the database and release resources.
   */
  close(): Promise<void>

  /**
   * Retrieve every active alert.
   *
   * The registry is the only reader, and it restores the whole set. Filtering
   * belongs to AlertManager.getAlerts, which serves it from memory.
   */
  getAll(): Promise<Alert[]>

  /**
   * Apply one lifecycle transition.
   */
  commit(transition: AlertTransition): Promise<void>

  /**
   * Query the audit trail.
   */
  queryHistory(
    query: HistoryQuery
  ): Promise<{ entries: HistoryEntry[]; total: number }>

  /**
   * Delete audit entries older than the retention window.
   *
   * @returns how many entries were deleted
   */
  pruneHistory(olderThanDays: number): Promise<number>
}
