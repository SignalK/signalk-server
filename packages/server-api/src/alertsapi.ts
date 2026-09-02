import type {
  Alert,
  AlertPriority,
  HistoryEntry,
  RaiseAlertRequest,
  TransitionResult
} from './typebox/alerts-schemas'
import type { Context, Path } from '.'

export type {
  Alert,
  AlertPriority,
  AlertState,
  RaiseAlertRequest,
  TransitionResult,
  HistoryEntry as AlertHistoryEntry
} from './typebox/alerts-schemas'

/**
 * Query against the alert audit trail.
 *
 * @category Alerts API
 */
export interface AlertHistoryQuery {
  /** Earliest entry to return, as an ISO 8601 timestamp */
  from?: string
  /** Latest entry to return, as an ISO 8601 timestamp */
  to?: string
  /** Only entries belonging to this alert */
  alertId?: string
  /** Only entries about this alert path */
  path?: Path
  /** Only entries about alerts in this context */
  context?: Context
  /** Only these kinds of event */
  eventType?: HistoryEntry['eventType'] | HistoryEntry['eventType'][]
  /** Maximum entries to return */
  limit?: number
  /** Entries to skip */
  offset?: number
}

/**
 * Which alerts to list.
 *
 * @category Alerts API
 */
export interface AlertFilter {
  state?: Alert['state'] | Alert['state'][]
  priority?: AlertPriority | AlertPriority[]
  group?: string
  stale?: boolean
}

/**
 * Plugin interface to the alerts subsystem.
 *
 * The server owns alert lifecycle: a plugin describes a condition and the
 * server decides what state the alert is in. Raising an alert on a path that
 * already has one updates that alert rather than creating a second.
 *
 * @category Alerts API
 */
export interface AlertsApi {
  /**
   * Raise an alert, or update the alert already on that path.
   *
   * @example
   * ```typescript
   * await app.alerts.raise({
   *   path: 'propulsion.port.oilPressureLow',
   *   priority: 'alarm',
   *   message: 'Oil pressure low'
   * })
   * ```
   */
  raise(request: RaiseAlertRequest): Promise<Alert>

  /**
   * Acknowledge an alert.
   *
   * The audit trail records the plugin as the actor; a plugin cannot
   * acknowledge on behalf of a name it chooses.
   */
  acknowledge(alertId: string): Promise<TransitionResult>

  /**
   * Silence an alert for `durationSeconds`, or for the configured maximum.
   * The maximum is shorter for an emergency.
   */
  silence(alertId: string, durationSeconds?: number): Promise<Alert>

  /** Silence every active alert. */
  silenceAll(): Promise<void>

  /** Raise an alert to a higher priority. */
  escalate(alertId: string, priority: AlertPriority): Promise<Alert>

  /**
   * Report that the condition ended. Whether the alert resolves or waits for
   * acknowledgment depends on its priority and whether it latches.
   */
  clearCondition(alertId: string): Promise<TransitionResult>

  /** The active alerts, optionally filtered. */
  list(filter?: AlertFilter): Alert[]

  /** One active alert, or null. */
  get(alertId: string): Alert | null

  /** The active alert on a path, or null. */
  getByPath(path: Path, context?: Context): Alert | null

  /** The audit trail. */
  history(
    query?: AlertHistoryQuery
  ): Promise<{ entries: HistoryEntry[]; total: number }>
}

/** @category Alerts API */
export interface WithAlertsApi {
  alerts: AlertsApi
}
