/**
 * Escalation timer.
 *
 * Tracks unacknowledged warning alerts and escalates them to alarm priority
 * after a configurable timeout.
 */

import type { AlertPriority } from './types'

const MILLISECONDS_PER_SECOND = 1000

const DEFAULT_ESCALATION_TIMEOUT_SECONDS = 300

/**
 * The escalation window to enforce, falling back to the default when the
 * setting is not a usable number.
 *
 * Zero and negative values are kept: they mean a window already spent, which
 * a restart produces legitimately. A NaN is not — it would reach setTimeout
 * and escalate every warning on the next tick.
 */
function resolveTimeoutSeconds(configured: number): number {
  if (Number.isFinite(configured)) {
    return configured
  }
  console.error(
    `The alert escalation timeout must be a number of seconds, but is ` +
      `${String(configured)}. Using ${String(DEFAULT_ESCALATION_TIMEOUT_SECONDS)}.`
  )
  return DEFAULT_ESCALATION_TIMEOUT_SECONDS
}

/**
 * Opaque handle for timer identification.
 */
export type TimerHandle = unknown

/**
 * Abstraction over timer functions to enable testing with fake timers.
 */
export interface TimerFunctions {
  setTimeout(callback: () => void, ms: number): TimerHandle
  clearTimeout(handle: TimerHandle): void
}

/**
 * Configuration for the escalation timer.
 */
export interface EscalationTimerConfig {
  /** Whether warning-to-alarm escalation is enabled */
  enabled: boolean
  /** Timeout in seconds before escalation */
  timeoutSeconds: number
}

/**
 * Event emitted when an alert is escalated.
 */
export interface EscalationEvent {
  /** Alert ID that was escalated */
  alertId: string
  /** Priority before escalation */
  fromPriority: AlertPriority
  /** Priority after escalation */
  toPriority: AlertPriority
  /** ISO timestamp when escalation occurred */
  timestamp: string
}

/**
 * Callback invoked when escalation occurs.
 */
export type EscalationCallback = (event: EscalationEvent) => void

/**
 * Default timer functions using global setTimeout/clearTimeout.
 */
export const defaultTimerFunctions: TimerFunctions = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  }
}

/**
 * Escalation timer.
 *
 * Manages escalation timers for unacknowledged warning alerts. When a warning
 * alert remains unacknowledged for the configured timeout, it is escalated to
 * alarm priority.
 */
export class EscalationTimer {
  private config: EscalationTimerConfig
  private onEscalate: EscalationCallback
  private timerFns: TimerFunctions
  private readonly timeoutSeconds: number
  private activeTimers = new Map<string, TimerHandle>()
  private stopped = false

  constructor(
    config: EscalationTimerConfig,
    onEscalate: EscalationCallback,
    timerFunctions?: TimerFunctions
  ) {
    this.config = config
    this.timeoutSeconds = resolveTimeoutSeconds(config.timeoutSeconds)
    this.onEscalate = onEscalate
    this.timerFns = timerFunctions ?? defaultTimerFunctions
  }

  /**
   * Start tracking an alert for potential escalation.
   * Only starts a timer for warning priority alerts.
   *
   * @param alertId - The alert ID to track
   * @param priority - The alert priority (only 'warning' will start a timer)
   * @param remainingMs - Optional remaining time in ms (uses config timeout if not specified)
   */
  startTimer(
    alertId: string,
    priority: AlertPriority,
    remainingMs?: number
  ): void {
    if (this.stopped) {
      return
    }

    if (priority !== 'warning') {
      return
    }

    if (!this.config.enabled) {
      return
    }

    if (this.activeTimers.has(alertId)) {
      return
    }

    const timeoutMs =
      remainingMs ?? this.timeoutSeconds * MILLISECONDS_PER_SECOND

    // A window that is already spent still escalates through a timer rather
    // than inline. The caller is part-way through raising the alert and has
    // neither announced nor stored it yet, so escalating within its call would
    // put the escalation ahead of the raise in both the event stream and the
    // store, and leave the raise to overwrite it.
    const handle = this.timerFns.setTimeout(
      () => {
        this.handleEscalation(alertId)
      },
      Math.max(timeoutMs, 0)
    )

    this.activeTimers.set(alertId, handle)
  }

  /**
   * Cancel escalation timer for an alert.
   * Called when an alert is acknowledged or cleared.
   */
  cancelTimer(alertId: string): void {
    const handle = this.activeTimers.get(alertId)
    if (handle !== undefined) {
      this.timerFns.clearTimeout(handle)
      this.activeTimers.delete(alertId)
    }
  }

  hasTimer(alertId: string): boolean {
    return this.activeTimers.has(alertId)
  }

  /**
   * The escalation window this timer enforces, for a caller resuming a window
   * that a restart interrupted. Reading the setting directly there would skip
   * the fallback and put a NaN into setTimeout.
   */
  getTimeoutMs(): number {
    return this.timeoutSeconds * MILLISECONDS_PER_SECOND
  }

  getActiveTimerCount(): number {
    return this.activeTimers.size
  }

  /**
   * Stop all timers and clean up.
   */
  stop(): void {
    this.stopped = true
    this.cancelAllTimers()
  }

  private handleEscalation(alertId: string): void {
    this.activeTimers.delete(alertId)

    if (this.stopped) {
      return
    }

    const event: EscalationEvent = {
      alertId,
      fromPriority: 'warning',
      toPriority: 'alarm',
      timestamp: new Date().toISOString()
    }

    this.onEscalate(event)
  }

  /**
   * Cancel all active timers.
   */
  private cancelAllTimers(): void {
    for (const handle of this.activeTimers.values()) {
      this.timerFns.clearTimeout(handle)
    }
    this.activeTimers.clear()
  }
}
