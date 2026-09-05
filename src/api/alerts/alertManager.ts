/**
 * Alert manager.
 *
 * Owns the active alert set and drives every lifecycle operation, coordinating
 * the state machine, the escalation timer, and the store. It is the
 * authoritative record of alert state; the Signal K model tree is a mirror fed
 * by the events emitted here.
 */

import { EventEmitter } from 'events'
import type { Context, Path, SourceRef, Value } from '@signalk/server-api'
import {
  PRIORITY_RANK,
  type Alert,
  type AlertFilter,
  type AlertPriority,
  type AlertState,
  type AlertTransition,
  type HistoryEntry,
  type HistoryEventType,
  type IAlertStore
} from './types'
import {
  AlertLimitReachedError,
  AlertNotFoundError,
  InvalidEscalationError,
  InvalidSilenceDurationError
} from './errors'
import {
  AlertStateMachine,
  createAlert,
  type CreateAlertParams,
  type StateTransitionResult
} from './alertStateMachine'
import {
  defaultTimerFunctions,
  EscalationTimer,
  type EscalationTimerConfig,
  type TimerFunctions,
  type TimerHandle
} from './escalationTimer'

const MILLISECONDS_PER_SECOND = 1000

/**
 * How often the audit trail is pruned while the server runs. Retention is also
 * applied at startup, which is what actually bounds it on a device that reboots
 * more often than this.
 */
const RETENTION_PRUNE_INTERVAL_MS = 24 * 60 * 60 * MILLISECONDS_PER_SECOND

/**
 * Retention applied when the configuration does not say. Unbounded is the
 * wrong default on a device whose root filesystem is an SD card.
 */
const DEFAULT_RETENTION_DAYS = 90

/**
 * Active alerts allowed when the configuration does not say. High enough that
 * no plausible vessel reaches it, low enough that a device raising a fresh
 * alert per delta cannot exhaust memory.
 */
const DEFAULT_MAX_ACTIVE_ALERTS = 1000

/**
 * How long a delta source may stay quiet before its alerts are marked stale.
 * A stale alert stays visible and actionable: silence is not evidence that the
 * condition resolved.
 */
const DEFAULT_SOURCE_TIMEOUT_SECONDS = 60

/**
 * The cap to enforce, falling back to the default when the setting is not a
 * usable count. A typo must not leave the subsystem unable to raise anything.
 */
function resolveMaxActiveAlerts(configured?: number): number {
  if (configured === undefined) {
    return DEFAULT_MAX_ACTIVE_ALERTS
  }
  if (!Number.isInteger(configured) || configured < 1) {
    console.error(
      `The active alert limit must be a whole number of at least 1, but is ` +
        `${String(configured)}. Using ${String(DEFAULT_MAX_ACTIVE_ALERTS)}.`
    )
    return DEFAULT_MAX_ACTIVE_ALERTS
  }
  return configured
}

/**
 * The liveness window to enforce, falling back to the default when the setting
 * is not a usable number of seconds. A zero or a NaN would otherwise reach
 * setTimeout and mark every re-emitting alert stale at once.
 */
function resolveSourceTimeoutSeconds(configured?: number): number {
  if (configured === undefined) {
    return DEFAULT_SOURCE_TIMEOUT_SECONDS
  }
  if (!Number.isFinite(configured) || configured <= 0) {
    console.error(
      `The alert source timeout must be a positive number of seconds, but is ` +
        `${String(configured)}. Using ${String(DEFAULT_SOURCE_TIMEOUT_SECONDS)}.`
    )
    return DEFAULT_SOURCE_TIMEOUT_SECONDS
  }
  return configured
}

/**
 * Whether two alerts carry the same description, ignoring the liveness fields
 * a re-emission always moves.
 */
function sameDescription(before: Alert, after: Alert): boolean {
  return (
    before.$source === after.$source &&
    JSON.stringify(before.source) === JSON.stringify(after.source) &&
    before.group === after.group &&
    before.latching === after.latching &&
    JSON.stringify(before.references) === JSON.stringify(after.references) &&
    JSON.stringify(before.data) === JSON.stringify(after.data)
  )
}

/**
 * What a source may refresh on an alert without re-announcing it.
 *
 * Priority and message are absent on purpose: those are what an operator
 * reads, so a change to either is a fresh annunciation and belongs in
 * raiseAlert.
 */
export interface AlertDescription {
  $source?: SourceRef
  source?: Record<string, unknown>
  group?: string
  latching?: boolean
  references?: Path[]
  data?: Record<string, Value>
}

/**
 * Configuration for the AlertManager.
 */
export interface AlertManagerConfig {
  /** Escalation settings for priority promotion */
  escalation: EscalationTimerConfig
  /** Silencing duration limits */
  silencing: {
    /** Longest a non-emergency alert may be silenced, in seconds */
    defaultMaxSilenceSeconds: number
    /** Longest an emergency may be silenced, in seconds */
    emergencyMaxSilenceSeconds: number
  }
  /** Days to retain the audit trail. Defaults to 90. */
  retentionDays?: number
  /** Most alerts that may be active at once. Defaults to 1000. */
  maxActiveAlerts?: number
  /**
   * Seconds a delta source may go quiet before its alerts are stale.
   * Defaults to 60.
   */
  sourceTimeoutSeconds?: number
}

/**
 * Event types emitted by the AlertManager.
 */
export type AlertEventType =
  | 'raised'
  | 'acknowledged'
  | 'silenced'
  | 'unsilenced'
  | 'cleared'
  | 'escalated'
  | 'updated'

/**
 * Event emitted when an alert changes.
 */
export interface AlertEvent {
  /** Type of event that occurred */
  type: AlertEventType
  /** The alert at the time of the event */
  alert: Alert
  /** The alert state before the event */
  previousState?: AlertState
}

/**
 * Event emitted when a store write fails.
 *
 * The lifecycle change it belongs to has already been applied and announced,
 * so this reports lost durability, not a lost alert.
 */
export interface StoreFailureEvent {
  /** Operation that failed */
  operation: 'commit' | 'prune' | 'resync'
  /** Alert the write belonged to, or null for store-wide operations */
  alertId: string | null
  /** The underlying error */
  error: Error
}

/**
 * Extra fields an audit entry carries beyond the alert's own identity.
 */
interface HistoryDetails {
  /** Who caused this entry, when that is not the alert's own source */
  $source?: SourceRef
  userId?: string
  previousState?: AlertState
  newState?: AlertState
  previousPriority?: AlertPriority
  newPriority?: AlertPriority
  details?: Record<string, unknown>
}

/**
 * Alert manager.
 *
 * Manages the lifecycle of alerts including creation, acknowledgment,
 * silencing, and clearing. Coordinates with the EscalationTimer for automatic
 * priority promotion and optionally persists through an IAlertStore.
 *
 * Annunciation never waits on the store. Every lifecycle change is applied
 * to the registry, announced, and only then committed, so a store that cannot
 * be written costs durability across a restart rather than the alarm itself. A
 * failed commit sets the degraded flag and emits `storeError`.
 */
export class AlertManager extends EventEmitter {
  private config: AlertManagerConfig
  private alerts = new Map<string, Alert>()
  private stateMachine = new AlertStateMachine()
  private escalationTimer: EscalationTimer
  private store?: IAlertStore
  private stopped = false
  private storeDegraded = false
  private resyncing = false
  /** Bumped by every store failure, so a sweep can tell if one raced it. */
  private storeFailures = 0
  private timerFns: TimerFunctions
  private readonly maxActiveAlerts: number
  private readonly sourceTimeoutSeconds: number
  /**
   * One timer per alert whose source re-emits it, armed afresh on every
   * re-emission. Only delta ingress enrols an alert here: re-emission is its
   * heartbeat, and a REST or plugin alert raised once would go stale for no
   * reason.
   */
  private livenessTimers = new Map<string, TimerHandle>()
  /** Whether the full active set has already been reported. */
  private limitReported = false
  private retentionTimer?: TimerHandle

  /**
   * Index mapping path(+context) to alertId for duplicate detection.
   */
  private alertIndex = new Map<string, string>()

  /**
   * Timers for silence expiration.
   */
  private silenceTimers = new Map<string, TimerHandle>()

  /**
   * Removals the store rejected. Retried on the next successful write, since
   * nothing else will ever name these alerts again.
   */
  private pendingRemovals = new Set<string>()

  constructor(
    config: AlertManagerConfig,
    timerFunctions?: TimerFunctions,
    store?: IAlertStore
  ) {
    super()
    this.config = config
    this.store = store
    this.maxActiveAlerts = resolveMaxActiveAlerts(config.maxActiveAlerts)
    this.sourceTimeoutSeconds = resolveSourceTimeoutSeconds(
      config.sourceTimeoutSeconds
    )
    this.timerFns = timerFunctions ?? defaultTimerFunctions
    this.escalationTimer = new EscalationTimer(
      config.escalation,
      (event) => {
        this.handleEscalation(event.alertId)
      },
      timerFunctions
    )
  }

  /**
   * Whether the store currently disagrees with the registry.
   *
   * Set by a failed write and cleared once a later write succeeds and the
   * active set has been re-committed. While it is true, alert state may not
   * survive a restart; alerts themselves keep being raised and announced.
   */
  isStoreDegraded(): boolean {
    return this.storeDegraded
  }

  /**
   * Load alerts from the store into memory.
   * Call this after construction to restore persisted alerts.
   */
  async loadFromStore(): Promise<void> {
    const store = this.store
    if (!store) {
      return
    }

    let alerts: Alert[]
    try {
      alerts = await store.getAll()
    } catch (err) {
      // Fail loudly: an unreadable store must surface as a startup failure
      // rather than silently presenting zero active alerts as truth.
      console.error('Failed to load alerts from store:', err)
      throw err
    }

    // Populate the whole registry before any side effect runs, so a failure
    // while resuming one alert's timers cannot leave later alerts unloaded.
    for (const alert of alerts) {
      this.alerts.set(alert.id, alert)
      this.alertIndex.set(this.getIndexKey(alert.path, alert.context), alert.id)
    }

    for (const stored of alerts) {
      this.resumeEscalation(stored)
      await this.resumeSilence(stored.id)
    }

    // Armed only once the load has succeeded, so a store this server has
    // decided it cannot use is left alone and no timer outlives the abort.
    this.startRetention()
  }

  /**
   * Raise a new alert or update an existing one.
   *
   * If an active alert with the same path (and context) already exists, it is
   * updated rather than duplicated. An omitted optional field leaves the
   * existing value alone; a caller clears a field by sending it empty.
   */
  async raiseAlert(params: CreateAlertParams): Promise<Alert> {
    const context = params.context || undefined
    const existingId = this.alertIndex.get(
      this.getIndexKey(params.path, context)
    )

    if (existingId) {
      const existing = this.alerts.get(existingId)
      if (existing) {
        return this.updateExistingAlert(existing, params)
      }
    }

    // Checked after the update branch: an alert that already exists keeps
    // taking updates at the cap, and only genuinely new ones are refused. The
    // cap lives here rather than at the REST boundary, so the delta and plugin
    // surfaces that call the manager directly obey the same limit.
    if (this.alerts.size >= this.maxActiveAlerts) {
      await this.makeRoomFor(params.priority)

      // That await is the only suspension point between reading the index and
      // writing it, so a concurrent raise for this same path can have created
      // the alert meanwhile. Overwriting the index key here would strand the
      // first alert: still holding a slot and a timer, reachable by nobody.
      const racedId = this.alertIndex.get(
        this.getIndexKey(params.path, context)
      )
      const raced = racedId ? this.alerts.get(racedId) : undefined
      if (raced) {
        return this.updateExistingAlert(raced, params)
      }
    }

    const alert = createAlert(params)

    this.alerts.set(alert.id, alert)
    this.alertIndex.set(this.getIndexKey(alert.path, alert.context), alert.id)

    this.syncEscalationTimer(alert)
    const history = [
      this.historyEntry('raise', alert, { newState: alert.state })
    ]
    this.emitEvent('raised', alert)

    await this.commit({ alertId: alert.id, alert, history })

    return alert
  }

  /**
   * Acknowledge an alert.
   */
  async acknowledgeAlert(
    alertId: string,
    userId?: string
  ): Promise<StateTransitionResult> {
    const alert = this.alerts.get(alertId)
    if (!alert) {
      throw new AlertNotFoundError(alertId)
    }

    const result = this.stateMachine.acknowledge(alert, userId)

    this.escalationTimer.cancelTimer(alertId)
    if (result.alert) {
      result.alert = this.clearSilencingIfSuperseded(alertId, result.alert)
    }

    if (result.cleared) {
      const terminal = this.terminalAlert(alert)
      this.removeFromRegistry(alertId, alert)
      const history = [
        this.historyEntry('clear', terminal, {
          userId,
          previousState: result.previousState,
          newState: 'normal'
        })
      ]
      this.emitEvent('cleared', terminal, result.previousState)
      await this.commit({ alertId, alert: null, history })
      return result
    }

    if (result.alert) {
      const updated = result.alert
      this.alerts.set(alertId, updated)
      const history = [
        this.historyEntry('acknowledge', updated, {
          userId,
          previousState: result.previousState,
          newState: updated.state
        })
      ]
      this.emitEvent('acknowledged', updated, result.previousState)
      await this.commit({ alertId, alert: updated, history })
    }

    return result
  }

  /**
   * Escalate an alert to a higher priority.
   *
   * Only escalation (raising priority) is supported — de-escalation is
   * intentionally not allowed. If the condition has improved, the source
   * should clear and re-raise at the lower priority instead.
   */
  async escalateAlert(
    alertId: string,
    newPriority: AlertPriority
  ): Promise<Alert> {
    const alert = this.alerts.get(alertId)
    if (!alert) {
      throw new AlertNotFoundError(alertId)
    }

    if (PRIORITY_RANK[newPriority] <= PRIORITY_RANK[alert.priority]) {
      throw new InvalidEscalationError(alert.priority, newPriority)
    }

    const previousPriority = alert.priority
    const now = new Date().toISOString()
    // lastSourceUpdate is not touched: it reports when the source last spoke,
    // and this is the operator acting on an alert whose source may have gone
    // quiet. Refreshing it here would report a silent source as live.
    const priorityUpdated: Alert = {
      ...alert,
      priority: newPriority
    }

    // Escalation raises urgency; it does not claim that a condition which
    // returned to normal came back. An alert whose condition is inactive keeps
    // its state and its clearedAt, so acknowledging still resolves it.
    const reAlerted = priorityUpdated.condition
      ? this.stateMachine.reactivate(priorityUpdated).alert
      : priorityUpdated

    // Escalation is itself a state change (IEC 62923-1 6.4.2.2), so the
    // escalated alert rises within its new priority group.
    const updated: Alert = {
      ...this.clearSilencingIfSuperseded(alertId, reAlerted),
      stateChangedAt: now
    }

    this.alerts.set(alertId, updated)
    this.syncEscalationTimer(updated)

    const history = [
      this.historyEntry('escalate', updated, {
        previousPriority,
        newPriority
      })
    ]
    this.emitEvent('escalated', updated, alert.state)

    await this.commit({ alertId, alert: updated, history })

    return updated
  }

  /**
   * Silence an alert.
   *
   * @param alertId - The alert ID to silence
   * @param durationMs - Duration in milliseconds, clamped to the configured
   *   maximum for the alert's priority. Defaults to that maximum.
   */
  async silenceAlert(alertId: string, durationMs?: number): Promise<Alert> {
    const alert = this.alerts.get(alertId)
    if (!alert) {
      throw new AlertNotFoundError(alertId)
    }

    const duration = this.resolveSilenceDuration(alert.priority, durationMs)
    const silenced = this.stateMachine.silence(
      alert,
      new Date(Date.now() + duration)
    )
    this.alerts.set(alertId, silenced)

    this.startSilenceExpirationTimer(alertId, duration)
    const history = [
      this.historyEntry('silence', silenced, {
        details: { silencedUntil: silenced.silencedUntil }
      })
    ]
    this.emitEvent('silenced', silenced)

    await this.commit({ alertId, alert: silenced, history })

    return silenced
  }

  /**
   * Unsilence an alert.
   */
  async unsilenceAlert(alertId: string): Promise<Alert> {
    const alert = this.alerts.get(alertId)
    if (!alert) {
      throw new AlertNotFoundError(alertId)
    }

    this.cancelSilenceExpirationTimer(alertId)

    const unsilenced = this.stateMachine.unsilence(alert)
    this.alerts.set(alertId, unsilenced)

    const history = [this.historyEntry('unsilence', unsilenced)]
    this.emitEvent('unsilenced', unsilenced)

    await this.commit({ alertId, alert: unsilenced, history })

    return unsilenced
  }

  /**
   * Silence all unacknowledged alerts.
   */
  async silenceAll(): Promise<void> {
    const candidateIds = Array.from(this.alerts.values())
      .filter((a) => AlertStateMachine.isUnacknowledged(a) && !a.silenced)
      .map((a) => a.id)

    for (const alertId of candidateIds) {
      // Re-read: an alert can be acknowledged or cleared while an earlier
      // iteration awaits its write, and committing the stale snapshot would
      // resurrect it.
      const current = this.alerts.get(alertId)
      if (
        !current ||
        !AlertStateMachine.isUnacknowledged(current) ||
        current.silenced
      ) {
        continue
      }

      const duration = this.getMaxSilenceDuration(current.priority)
      const silenced = this.stateMachine.silence(
        current,
        new Date(Date.now() + duration)
      )
      this.alerts.set(alertId, silenced)

      this.startSilenceExpirationTimer(alertId, duration)
      const history = [
        this.historyEntry('silence', silenced, {
          details: { silencedUntil: silenced.silencedUntil }
        })
      ]
      this.emitEvent('silenced', silenced)

      await this.commit({ alertId, alert: silenced, history })
    }
  }

  /**
   * Apply what a source says about an alert that is otherwise unchanged.
   *
   * A re-emission with the same priority and message is not news, so it must
   * not travel through raiseAlert: that reactivates an acknowledged alert and
   * strips its silencing. The descriptive fields still moved, though, and the
   * model and the store should carry what the source last said.
   */
  async updateDescription(
    alertId: string,
    description: AlertDescription
  ): Promise<Alert> {
    const alert = this.alerts.get(alertId)
    if (!alert) {
      throw new AlertNotFoundError(alertId)
    }

    // An omitted field means unchanged, as it does for a raise.
    const updated: Alert = {
      ...alert,
      $source: description.$source ?? alert.$source,
      source: description.source ?? alert.source,
      group: description.group ?? alert.group,
      latching: description.latching ?? alert.latching,
      references: description.references ?? alert.references,
      data: description.data ?? alert.data,
      lastSourceUpdate: new Date().toISOString(),
      sourceOnline: true,
      stale: false
    }

    // A source that re-emits an identical alert is the common case, and it
    // must stay free: no delta to every subscriber and no durable write for a
    // message that says nothing new.
    //
    // A source that re-emits after going quiet is not that case. The alert is
    // marked stale and its source offline, and saying so again is exactly what
    // clears both, so that one is published and stored.
    const wasOffline = alert.stale || !alert.sourceOnline
    if (sameDescription(alert, updated) && !wasOffline) {
      return alert
    }

    this.alerts.set(alertId, updated)
    // No audit entry and no state change: nothing happened to the alert, the
    // source merely said the same thing again with fresher detail.
    this.emitEvent('updated', updated)

    await this.commit({ alertId, alert: updated, history: [] })

    return updated
  }

  /**
   * Clear the condition for an alert.
   */
  async clearCondition(
    alertId: string,
    clearedBy?: SourceRef
  ): Promise<StateTransitionResult> {
    const alert = this.alerts.get(alertId)
    if (!alert) {
      throw new AlertNotFoundError(alertId)
    }

    const result = this.stateMachine.clearCondition(alert)

    if (result.cleared) {
      const terminal = this.terminalAlert(alert)
      this.removeFromRegistry(alertId, alert)
      const history = [
        this.historyEntry('clear', terminal, {
          $source: clearedBy,
          previousState: result.previousState,
          newState: 'normal'
        })
      ]
      this.emitEvent('cleared', terminal, result.previousState)
      await this.commit({ alertId, alert: null, history })
      return result
    }

    if (result.alert) {
      const updated = result.alert
      // A repeat clear on an already-cleared condition changes nothing.
      // Logging and re-emitting it would flood the audit trail, because a
      // delta source re-emits a null value as its liveness heartbeat.
      const changed =
        updated.state !== alert.state || updated.condition !== alert.condition

      this.alerts.set(alertId, updated)
      this.syncEscalationTimer(updated)

      if (changed) {
        const history = [
          this.historyEntry('clear', updated, {
            $source: clearedBy,
            previousState: result.previousState,
            newState: updated.state
          })
        ]
        this.emitEvent('updated', updated, result.previousState)
        await this.commit({ alertId, alert: updated, history })
      }
    }

    return result
  }

  /**
   * Get an alert by ID.
   */
  getAlert(alertId: string): Alert | null {
    return this.alerts.get(alertId) ?? null
  }

  /**
   * Get the active alert on a path (with optional context), if any.
   *
   * Delta and REST ingress resolve alerts through this index rather than
   * keeping their own path-to-id maps, which would not survive a restart.
   */
  getAlertByPath(path: Path, context?: Context): Alert | null {
    const alertId = this.alertIndex.get(this.getIndexKey(path, context))
    return alertId ? (this.alerts.get(alertId) ?? null) : null
  }

  /**
   * Get all alerts, optionally filtered.
   */
  getAlerts(filter?: AlertFilter): Alert[] {
    let alerts = Array.from(this.alerts.values())

    if (filter?.state) {
      const states = new Set(
        Array.isArray(filter.state) ? filter.state : [filter.state]
      )
      alerts = alerts.filter((a) => states.has(a.state))
    }

    if (filter?.priority) {
      const priorities = new Set(
        Array.isArray(filter.priority) ? filter.priority : [filter.priority]
      )
      alerts = alerts.filter((a) => priorities.has(a.priority))
    }

    if (filter?.group) {
      alerts = alerts.filter((a) => a.group === filter.group)
    }

    if (filter?.stale !== undefined) {
      alerts = alerts.filter((a) => a.stale === filter.stale)
    }

    return alerts
  }

  /**
   * Get count of active alerts.
   */
  getActiveAlertCount(): number {
    return this.alerts.size
  }

  /**
   * Get count of unacknowledged alerts.
   */
  getUnacknowledgedCount(): number {
    return this.getAlerts({ state: ['unacknowledged', 'rtn-unacknowledged'] })
      .length
  }

  /**
   * Record that an alert's source re-emitted it.
   *
   * Delta ingress calls this: re-emission of the alert value is the heartbeat
   * (proposal §15). The raise itself already refreshed the timestamps, so this
   * only enrols the alert in liveness checking.
   */
  noteSourceUpdate(alertId: string): void {
    if (this.stopped) {
      return
    }

    this.cancelLivenessTimer(alertId)
    const timeoutMs = this.sourceTimeoutSeconds * MILLISECONDS_PER_SECOND
    this.livenessTimers.set(
      alertId,
      this.timerFns.setTimeout(() => {
        this.livenessTimers.delete(alertId)
        void this.markStale(alertId)
      }, timeoutMs)
    )
  }

  /** The source stopped talking. The alert stays, and says so. */
  private async markStale(alertId: string): Promise<void> {
    const alert = this.alerts.get(alertId)
    if (this.stopped || !alert || alert.stale) {
      return
    }

    const stale: Alert = { ...alert, stale: true, sourceOnline: false }
    this.alerts.set(alertId, stale)
    this.emitEvent('updated', stale)
    // No audit entry: staleness is a fact about the source, not something
    // that happened to the alert.
    await this.commit({ alertId, alert: stale, history: [] })
  }

  private cancelLivenessTimer(alertId: string): void {
    const handle = this.livenessTimers.get(alertId)
    if (handle !== undefined) {
      this.timerFns.clearTimeout(handle)
      this.livenessTimers.delete(alertId)
    }
  }

  /**
   * Stop the alert manager and clean up resources.
   */
  stop(): void {
    this.stopped = true
    this.escalationTimer.stop()

    for (const alertId of Array.from(this.livenessTimers.keys())) {
      this.cancelLivenessTimer(alertId)
    }

    for (const handle of this.silenceTimers.values()) {
      this.timerFns.clearTimeout(handle)
    }
    this.silenceTimers.clear()

    if (this.retentionTimer !== undefined) {
      this.timerFns.clearTimeout(this.retentionTimer)
      this.retentionTimer = undefined
    }
  }

  /**
   * Handle escalation timer callback.
   */
  private handleEscalation(alertId: string): void {
    if (this.stopped) {
      return
    }

    const alert = this.alerts.get(alertId)
    if (!alert) {
      return
    }

    const previousPriority = alert.priority

    // Escalation is itself a state change (IEC 62923-1 6.4.2.2), so the alarm
    // rises within its priority group. It supersedes silencing for the same
    // reason the operator-driven path does — this timer fires precisely
    // because nobody attended to the warning.
    const escalated: Alert = {
      ...this.clearSilencingIfSuperseded(alertId, alert),
      priority: 'alarm',
      stateChangedAt: new Date().toISOString()
    }

    this.alerts.set(alertId, escalated)
    this.syncEscalationTimer(escalated)

    const history = [
      this.historyEntry('escalate', escalated, {
        previousPriority,
        newPriority: 'alarm'
      })
    ]
    this.emitEvent('escalated', escalated, alert.state)

    void this.commit({ alertId, alert: escalated, history })
  }

  /**
   * Update an existing alert with new data.
   * Priority can only be escalated (increased), not reduced.
   * If the alert was acknowledged or returned-to-normal, reactivates it.
   */
  private async updateExistingAlert(
    existing: Alert,
    params: CreateAlertParams
  ): Promise<Alert> {
    const newPriority =
      PRIORITY_RANK[params.priority] > PRIORITY_RANK[existing.priority]
        ? params.priority
        : existing.priority

    // An omitted optional field means unchanged. A partial re-raise — a delta
    // source's liveness heartbeat, for one — must not erase what an earlier
    // raise described. Callers clear a field by sending it empty.
    const dataUpdated: Alert = {
      ...existing,
      references: params.references ?? existing.references,
      $source: params.$source,
      source: params.source ?? existing.source,
      priority: newPriority,
      message: params.message,
      group: params.group ?? existing.group,
      latching: params.latching ?? existing.latching,
      data: params.data ?? existing.data,
      lastSourceUpdate: new Date().toISOString(),
      sourceOnline: true,
      // The source just spoke, so whatever the liveness check decided is over.
      stale: false
    }

    const reactivation = this.stateMachine.reactivate(dataUpdated)
    const updated = this.clearSilencingIfSuperseded(
      existing.id,
      reactivation.alert
    )
    const stateChanged = reactivation.previousState !== updated.state
    const conditionReturned = !existing.condition && updated.condition
    const reAnnounced = stateChanged || conditionReturned
    const ownerChanged = params.$source !== existing.$source
    const escalated =
      PRIORITY_RANK[newPriority] > PRIORITY_RANK[existing.priority]

    // Escalation is a state change, so it moves the alert to the front of its
    // new priority group. `reactivate` leaves the timestamp alone for an alert
    // that was already unacknowledged, so a source-driven escalation has to
    // set it here — the timer and operator routes already do.
    const announced: Alert = escalated
      ? { ...updated, stateChangedAt: new Date().toISOString() }
      : updated

    this.alerts.set(existing.id, announced)

    const history: Omit<HistoryEntry, 'id'>[] = []

    if (newPriority !== existing.priority) {
      history.push(
        this.historyEntry('escalate', announced, {
          previousPriority: existing.priority,
          newPriority
        })
      )
    }

    // A re-annunciation restarts the escalation window; a plain update leaves
    // the running one alone.
    if (reAnnounced) {
      this.escalationTimer.cancelTimer(existing.id)
    }
    this.syncEscalationTimer(announced)

    // A source taking over an already-active alert belongs in the audit trail.
    // A source re-emitting its own alert is a liveness heartbeat and would
    // flood it.
    if (reAnnounced || ownerChanged) {
      history.push(
        this.historyEntry('raise', announced, {
          previousState: reactivation.previousState,
          newState: announced.state,
          details: ownerChanged
            ? { previousSource: existing.$source }
            : undefined
        })
      )
    }

    // A rise in priority is announced the same way the timer and the operator
    // route announce it, so a listener that drives renewed annunciation from
    // `escalated` cannot miss a source re-raising at a higher priority.
    const eventType = reAnnounced
      ? 'raised'
      : escalated
        ? 'escalated'
        : 'updated'
    this.emitEvent(
      eventType,
      announced,
      reAnnounced || escalated ? reactivation.previousState : undefined
    )

    await this.commit({ alertId: existing.id, alert: announced, history })

    return announced
  }

  /**
   * Free a slot for an incoming alert, or refuse it.
   *
   * A device that mints a path per message would otherwise fill the set with
   * trivia and lock out the emergency that matters. The least urgent alert
   * gives way to a more urgent one; nothing gives way to an equal.
   */
  private async makeRoomFor(priority: AlertPriority): Promise<void> {
    const victim = this.leastUrgentAlert()

    if (!victim || PRIORITY_RANK[victim.priority] >= PRIORITY_RANK[priority]) {
      if (!this.limitReported) {
        this.limitReported = true
        console.error(
          `The alerts subsystem holds its maximum of ${String(this.maxActiveAlerts)} ` +
            `active alerts and is refusing new ones. A source is probably raising ` +
            `an alert per message.`
        )
      }
      throw new AlertLimitReachedError(this.maxActiveAlerts)
    }

    console.error(
      `The alerts subsystem is full, so the ${victim.priority} alert on ` +
        `${victim.path} was dropped to make room for a ${priority} alert.`
    )

    const terminal = this.terminalAlert(victim)
    this.removeFromRegistry(victim.id, victim)
    this.emitEvent('cleared', terminal, victim.state)
    await this.commit({
      alertId: victim.id,
      alert: null,
      history: [
        this.historyEntry('clear', terminal, {
          previousState: victim.state,
          newState: 'normal',
          details: { reason: 'displaced', by: priority }
        })
      ]
    })
  }

  /** The alert that gives way first: lowest priority, then least recent. */
  private leastUrgentAlert(): Alert | undefined {
    let victim: Alert | undefined
    for (const alert of this.alerts.values()) {
      if (
        !victim ||
        PRIORITY_RANK[alert.priority] < PRIORITY_RANK[victim.priority] ||
        (PRIORITY_RANK[alert.priority] === PRIORITY_RANK[victim.priority] &&
          alert.stateChangedAt < victim.stateChangedAt)
      ) {
        victim = alert
      }
    }
    return victim
  }

  /**
   * Build the terminal value of a resolved alert.
   *
   * Consumers publish this as the alert's last delta, so it has to say the
   * alert is over rather than repeat the state it held before resolution.
   */
  private terminalAlert(alert: Alert): Alert {
    const now = new Date().toISOString()
    return {
      ...alert,
      state: 'normal',
      condition: false,
      clearedAt: alert.clearedAt ?? now,
      stateChangedAt: now
    }
  }

  /**
   * Drop an alert from the registry and cancel its timers.
   */
  private removeFromRegistry(alertId: string, alert: Alert): void {
    this.alerts.delete(alertId)
    this.limitReported = false
    this.cancelLivenessTimer(alertId)
    this.alertIndex.delete(this.getIndexKey(alert.path, alert.context))
    this.cancelSilenceExpirationTimer(alertId)
    this.escalationTimer.cancelTimer(alertId)
  }

  /**
   * Arm or cancel an alert's escalation timer to match its current state.
   *
   * Escalation applies to an unacknowledged warning whose condition is active.
   * A latched warning whose condition returned to normal is not escalated: the
   * condition is gone, and the alert waits for acknowledgment, not for urgency.
   */
  private syncEscalationTimer(alert: Alert, remainingMs?: number): void {
    const eligible =
      alert.state === 'unacknowledged' &&
      alert.priority === 'warning' &&
      alert.condition

    if (!eligible) {
      this.escalationTimer.cancelTimer(alert.id)
      return
    }

    this.escalationTimer.startTimer(alert.id, alert.priority, remainingMs)
  }

  /**
   * Resume an alert's escalation window after a restart.
   */
  private resumeEscalation(alert: Alert): void {
    // The timer's own resolved window, not the raw setting: reading the
    // setting here would bypass its fallback and put a NaN into setTimeout.
    const timeoutMs = this.escalationTimer.getTimeoutMs()
    const changedAtMs = new Date(alert.stateChangedAt).getTime()

    // A stored timestamp ahead of the clock means the clock moved, not that the
    // alert is overdue — a Raspberry Pi has no battery-backed clock and boots
    // before NTP steps it. Clamping keeps that from escalating everything at
    // startup, and keeps an absurd delay out of setTimeout's 32-bit range.
    const remainingMs = Number.isFinite(changedAtMs)
      ? Math.min(Math.max(timeoutMs - (Date.now() - changedAtMs), 0), timeoutMs)
      : timeoutMs

    this.syncEscalationTimer(alert, remainingMs)
  }

  /**
   * Resume or expire an alert's silence after a restart.
   */
  private async resumeSilence(alertId: string): Promise<void> {
    // Read the current value rather than the stored one: resuming escalation
    // can already have escalated this alert, and the unsilenced copy has to
    // build on that.
    const alert = this.alerts.get(alertId)
    if (!alert?.silenced || !alert.silencedUntil) {
      return
    }

    const untilMs = new Date(alert.silencedUntil).getTime()
    const maxMs = this.getMaxSilenceDuration(alert.priority)
    const remainingMs = Number.isFinite(untilMs)
      ? Math.min(Math.max(untilMs - Date.now(), 0), maxMs)
      : 0

    if (remainingMs > 0) {
      this.startSilenceExpirationTimer(alertId, remainingMs)
      return
    }

    const unsilenced = this.stateMachine.unsilence(alert)
    this.alerts.set(alertId, unsilenced)
    const history = [this.historyEntry('unsilence', unsilenced)]
    this.emitEvent('unsilenced', unsilenced)

    await this.commit({ alertId, alert: unsilenced, history })
  }

  private getIndexKey(path: Path, context?: Context): string {
    // JSON-encoded rather than joined with a separator, so a path containing
    // the separator cannot forge a context-scoped key.
    return JSON.stringify([context ?? null, path])
  }

  /**
   * Longest a given priority may be silenced.
   */
  private getMaxSilenceDuration(priority: AlertPriority): number {
    if (priority === 'emergency') {
      return (
        this.config.silencing.emergencyMaxSilenceSeconds *
        MILLISECONDS_PER_SECOND
      )
    }
    return (
      this.config.silencing.defaultMaxSilenceSeconds * MILLISECONDS_PER_SECOND
    )
  }

  /**
   * Resolve a requested silence duration against the configured maximum.
   *
   * The cap lives here rather than at the REST boundary, so the plugin and
   * delta surfaces that call the manager directly obey the same limit.
   */
  private resolveSilenceDuration(
    priority: AlertPriority,
    requestedMs?: number
  ): number {
    const maxMs = this.getMaxSilenceDuration(priority)
    if (requestedMs === undefined) {
      return maxMs
    }
    if (!(requestedMs > 0)) {
      throw new InvalidSilenceDurationError()
    }
    return Math.min(requestedMs, maxMs)
  }

  /**
   * Commit one lifecycle transition.
   *
   * The change has already been applied and announced by the time this runs,
   * so a failure degrades durability rather than the alert.
   */
  private async commit(transition: AlertTransition): Promise<void> {
    const store = this.store
    if (!store) {
      return
    }

    try {
      await store.commit(transition)
    } catch (err) {
      // A failed write is repaired by the alert's next transition. A failed
      // removal is not, because no later transition names an alert that has
      // left the registry, so it is remembered and retried.
      if (!transition.alert) {
        this.pendingRemovals.add(transition.alertId)
      }
      this.recordStoreFailure('commit', transition.alertId, err)
      return
    }

    this.pendingRemovals.delete(transition.alertId)

    if (this.storeDegraded) {
      // Detached: the sweep writes every active alert, up to maxActiveAlerts
      // durable writes, and no lifecycle call should wait behind that. It
      // reports through `storeError` like the prune does.
      void this.resync(store)
    }
  }

  /**
   * Bring the store back in line with the registry after a failed write.
   *
   * Runs on the first write that succeeds again, so a transient failure — a
   * lock held by a backup, a moment of I/O trouble — heals itself instead of
   * leaving the file permanently disagreeing with memory.
   */
  private async resync(store: IAlertStore): Promise<void> {
    if (this.resyncing) {
      return
    }
    this.resyncing = true
    // Nothing serializes lifecycle writes against this sweep, so a commit can
    // fail while it runs. Clearing the flag on the strength of the sweep alone
    // would hide that failure, and with it any removal it queued: no later
    // transition names a removed alert, so the row would survive to be
    // restored as a phantom alert on the next start.
    const failuresAtStart = this.storeFailures
    try {
      // The sweep is detached and outlives a stop, which closes the store
      // under it. Every write it makes after that fails, and reports a
      // degraded store for a manager that is no longer running.
      for (const alertId of Array.from(this.pendingRemovals)) {
        if (this.stopped) {
          return
        }
        await store.commit({ alertId, alert: null, history: [] })
        this.pendingRemovals.delete(alertId)
      }
      for (const alert of this.alerts.values()) {
        if (this.stopped) {
          return
        }
        await store.commit({ alertId: alert.id, alert, history: [] })
      }
    } catch (err) {
      this.recordStoreFailure('resync', null, err)
      return
    } finally {
      this.resyncing = false
    }

    if (
      this.storeFailures === failuresAtStart &&
      this.pendingRemovals.size === 0
    ) {
      this.storeDegraded = false
    }
  }

  /**
   * Start applying the retention window, now and daily.
   */
  private startRetention(): void {
    const retentionDays = this.config.retentionDays ?? DEFAULT_RETENTION_DAYS

    // A bad retention setting is a configuration error, not a durability
    // failure, so it must not report the store as degraded.
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
      console.error(
        `Alert history retention must be a whole number of days, at least 1, ` +
          `but is ${String(retentionDays)}. The audit trail will not be pruned.`
      )
      return
    }

    this.applyRetention(retentionDays)
    this.scheduleRetention(retentionDays)
  }

  /**
   * Apply the retention window to the audit trail.
   */
  private applyRetention(retentionDays: number): void {
    const store = this.store
    if (!store) {
      return
    }

    store.pruneHistory(retentionDays).catch((err: unknown) => {
      // Reported, but not as degradation: the registry and the store still
      // agree about every active alert. Only an unpruned trail is at stake,
      // and marking the store degraded would trigger a full resync instead.
      this.reportStoreFailure('prune', null, err)
    })
  }

  /**
   * Keep applying the retention window while the server runs, so an audit
   * trail does not grow without bound between restarts.
   */
  private scheduleRetention(retentionDays: number): void {
    if (this.stopped) {
      return
    }

    if (this.retentionTimer !== undefined) {
      this.timerFns.clearTimeout(this.retentionTimer)
    }

    this.retentionTimer = this.timerFns.setTimeout(() => {
      this.applyRetention(retentionDays)
      this.scheduleRetention(retentionDays)
    }, RETENTION_PRUNE_INTERVAL_MS)
  }

  private recordStoreFailure(
    operation: StoreFailureEvent['operation'],
    alertId: string | null,
    err: unknown
  ): void {
    this.storeDegraded = true
    this.storeFailures++
    this.reportStoreFailure(operation, alertId, err)
  }

  /**
   * Log a store failure and announce it, without claiming the store and the
   * registry disagree.
   */
  private reportStoreFailure(
    operation: StoreFailureEvent['operation'],
    alertId: string | null,
    err: unknown
  ): void {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error(
      `Alert store ${operation} failed${alertId ? ` for ${alertId}` : ''}:`,
      error
    )
    const event: StoreFailureEvent = { operation, alertId, error }
    this.emit('storeError', event)
  }

  /**
   * Build an audit entry for a transition.
   */
  private historyEntry(
    eventType: HistoryEventType,
    alert: Alert,
    extra?: HistoryDetails
  ): Omit<HistoryEntry, 'id'> {
    return {
      alertId: alert.id,
      path: alert.path,
      context: alert.context,
      priority: alert.priority,
      message: alert.message,
      $source: extra?.$source ?? alert.$source,
      eventType,
      timestamp: new Date().toISOString(),
      userId: extra?.userId,
      previousState: extra?.previousState,
      newState: extra?.newState,
      previousPriority: extra?.previousPriority,
      newPriority: extra?.newPriority,
      details: extra?.details
    }
  }

  /**
   * Emit an alert event.
   */
  private emitEvent(
    type: AlertEventType,
    alert: Alert,
    previousState?: AlertState
  ): void {
    if (this.stopped) {
      return
    }

    const event: AlertEvent = {
      type,
      alert,
      previousState
    }

    this.emit('alert', event)
  }

  /**
   * Clear silencing if the current operation supersedes it.
   *
   * Silencing suppresses audio — it is superseded when the operator has
   * attended to the alert (acknowledge) or when the system demands renewed
   * attention (reactivation, escalation). This is the single place that
   * encodes that rule.
   *
   * Does not emit a separate 'unsilenced' event because the caller's own
   * event (acknowledged, escalated, raised) already conveys that the
   * operator's attention has been (re)demanded.
   */
  private clearSilencingIfSuperseded(alertId: string, alert: Alert): Alert {
    if (!alert.silenced) {
      return alert
    }
    this.cancelSilenceExpirationTimer(alertId)
    return this.stateMachine.unsilence(alert)
  }

  /**
   * Start a timer to automatically unsilence an alert after duration expires.
   */
  private startSilenceExpirationTimer(
    alertId: string,
    durationMs: number
  ): void {
    this.cancelSilenceExpirationTimer(alertId)

    if (this.stopped) {
      return
    }

    const handle = this.timerFns.setTimeout(() => {
      this.handleSilenceExpiration(alertId)
    }, durationMs)

    this.silenceTimers.set(alertId, handle)
  }

  /**
   * Cancel the silence expiration timer for an alert.
   */
  private cancelSilenceExpirationTimer(alertId: string): void {
    const handle = this.silenceTimers.get(alertId)
    if (handle !== undefined) {
      this.timerFns.clearTimeout(handle)
      this.silenceTimers.delete(alertId)
    }
  }

  /**
   * Handle silence expiration - automatically unsilence the alert.
   */
  private handleSilenceExpiration(alertId: string): void {
    this.silenceTimers.delete(alertId)

    if (this.stopped) {
      return
    }

    const alert = this.alerts.get(alertId)
    if (!alert?.silenced) {
      return
    }

    const unsilenced = this.stateMachine.unsilence(alert)
    this.alerts.set(alertId, unsilenced)

    const history = [this.historyEntry('unsilence', unsilenced)]
    this.emitEvent('unsilenced', unsilenced)

    void this.commit({ alertId, alert: unsilenced, history })
  }
}
