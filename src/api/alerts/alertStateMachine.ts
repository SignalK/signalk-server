/**
 * Alert state machine.
 *
 * Implements the IEC 62682 alert lifecycle: which transitions each state
 * allows, when a cleared condition resolves an alert, and when it leaves the
 * alert waiting for acknowledgment.
 */

import type { Context, Path, SourceRef, Value } from '@signalk/server-api'
import type { Alert, AlertPriority, AlertState } from './types'

/**
 * Parameters for creating a new alert.
 *
 * A raise carries the alert's whole description, but an omitted optional field
 * means "unchanged" rather than "cleared" when it updates an existing alert.
 * A caller clears a field by sending it empty. See AlertManager.raiseAlert.
 */
export interface CreateAlertParams {
  /** Descriptive path naming the condition; identity together with `context` */
  path: Path
  /** Data paths the alert concerns; informational, never identity */
  references?: Path[]
  /** Signal K source reference (e.g., "n2k-on-ve.can-bus.115", "alertsApi") */
  $source: SourceRef
  /** Signal K structured source object, if available */
  source?: Record<string, unknown>
  /** Alert priority level */
  priority: AlertPriority
  /** Human-readable alert message */
  message: string
  /** Optional free-text UI grouping */
  group?: string
  /** Whether alert latches (stays active after condition clears) */
  latching?: boolean
  /** Additional context data */
  data?: Record<string, Value>
  /** Vessel context for multi-vessel deployments */
  context?: Context
}

/**
 * Result of a state transition operation.
 */
export interface StateTransitionResult {
  /** The updated alert, or null if the alert was cleared */
  alert: Alert | null
  /** Whether the alert was cleared (removed from active alerts) */
  cleared: boolean
  /** The state before the transition */
  previousState: AlertState
}

/**
 * Result of a transition that can only keep the alert, never clear it.
 */
export interface KeepingTransitionResult extends StateTransitionResult {
  alert: Alert
  cleared: false
}

/**
 * Create a new alert in the initial unacknowledged state.
 */
export function createAlert(params: CreateAlertParams): Alert {
  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    path: params.path,
    references: params.references,
    $source: params.$source,
    source: params.source,
    priority: params.priority,
    state: 'unacknowledged',
    condition: true,
    latching: params.latching ?? false,
    silenced: false,
    message: params.message,
    group: params.group,
    data: params.data,
    raisedAt: now,
    stateChangedAt: now,
    sourceOnline: true,
    lastSourceUpdate: now,
    stale: false,
    // An empty context is no context. Otherwise it would key the alert index
    // differently from an absent one while meaning the same thing.
    context: params.context || undefined
  }
}

/**
 * Alert state machine.
 *
 * Manages alert state transitions following the IEC 62682 model. All methods
 * are pure functions that return new alert objects without mutating the input.
 */
export class AlertStateMachine {
  /**
   * Check if a priority level requires acknowledgment before clearing.
   * Emergency, Alarm, and Warning require acknowledgment.
   * Caution auto-clears without requiring acknowledgment.
   */
  static requiresAcknowledgment(priority: AlertPriority): boolean {
    return priority !== 'caution'
  }

  /**
   * Check if an alert is in an unacknowledged state.
   * Both 'unacknowledged' and 'rtn-unacknowledged' count as unacknowledged.
   */
  static isUnacknowledged(alert: Alert): boolean {
    return (
      alert.state === 'unacknowledged' || alert.state === 'rtn-unacknowledged'
    )
  }

  /**
   * Acknowledge an alert.
   *
   * Transitions:
   * - unacknowledged → acknowledged (if condition active)
   * - unacknowledged → cleared (if condition cleared and latching)
   * - rtn-unacknowledged → cleared
   * - acknowledged → acknowledged (idempotent)
   */
  acknowledge(alert: Alert, userId?: string): StateTransitionResult {
    const previousState = alert.state
    const now = new Date().toISOString()

    // RTN-unacknowledged: acknowledging clears the alert
    if (alert.state === 'rtn-unacknowledged') {
      return {
        alert: null,
        cleared: true,
        previousState
      }
    }

    // Latched alert with cleared condition: acknowledging clears it
    if (
      alert.state === 'unacknowledged' &&
      alert.latching &&
      !alert.condition
    ) {
      return {
        alert: null,
        cleared: true,
        previousState
      }
    }

    // Already acknowledged: idempotent
    if (alert.state === 'acknowledged') {
      return {
        alert: { ...alert },
        cleared: false,
        previousState
      }
    }

    // Normal transition: unacknowledged → acknowledged
    return {
      alert: {
        ...alert,
        state: 'acknowledged',
        stateChangedAt: now,
        acknowledgedAt: now,
        acknowledgedBy: userId
      },
      cleared: false,
      previousState
    }
  }

  /**
   * Clear the alert condition.
   *
   * Transitions (for ack-required priorities: emergency, alarm, warning):
   * - unacknowledged → rtn-unacknowledged (unless latching)
   * - unacknowledged + latching → unacknowledged (stays, but condition=false)
   * - acknowledged → cleared
   * - rtn-unacknowledged → rtn-unacknowledged (idempotent)
   *
   * For caution priority:
   * - any state → cleared (auto-clears)
   */
  clearCondition(alert: Alert): StateTransitionResult {
    const previousState = alert.state
    const now = new Date().toISOString()

    // Caution priority: auto-clears without requiring acknowledgment. Ahead of
    // the idempotence check, so a caution never lingers on a cleared condition
    // whatever state it arrived in.
    if (!AlertStateMachine.requiresAcknowledgment(alert.priority)) {
      return {
        alert: null,
        cleared: true,
        previousState
      }
    }

    // Already cleared condition: idempotent
    if (!alert.condition) {
      return {
        alert: { ...alert },
        cleared: false,
        previousState
      }
    }

    // Acknowledged state: clearing condition removes the alert
    if (alert.state === 'acknowledged') {
      return {
        alert: null,
        cleared: true,
        previousState
      }
    }

    // Latched alert: stays in unacknowledged but condition becomes false
    if (alert.latching) {
      return {
        alert: {
          ...alert,
          condition: false,
          clearedAt: now
        },
        cleared: false,
        previousState
      }
    }

    // Normal transition: unacknowledged → rtn-unacknowledged
    return {
      alert: {
        ...alert,
        state: 'rtn-unacknowledged',
        stateChangedAt: now,
        condition: false,
        clearedAt: now
      },
      cleared: false,
      previousState
    }
  }

  /**
   * Silence an alert.
   *
   * Silencing suppresses audible indicators without acknowledging.
   * This does not affect the alert state.
   */
  silence(alert: Alert, until: Date): Alert {
    return {
      ...alert,
      silenced: true,
      silencedUntil: until.toISOString()
    }
  }

  /**
   * Reactivate an alert that has been acknowledged or returned-to-normal.
   *
   * Used when a source re-raises an alert for a condition that is still
   * (or again) active. Transitions the alert back to unacknowledged so
   * the operator is re-alerted.
   *
   * Silencing is NOT cleared here — that responsibility belongs to
   * AlertManager, which also manages the silence expiration timers.
   * See AlertManager.clearSilencingIfSuperseded().
   *
   * Transitions:
   * - acknowledged → unacknowledged (resets ack fields)
   * - rtn-unacknowledged → unacknowledged (resets clearedAt)
   * - unacknowledged with an active condition → unchanged copy
   * - unacknowledged with a cleared condition (a held latching alert) →
   *   condition true, clearedAt reset, stateChangedAt bumped
   */
  reactivate(alert: Alert): KeepingTransitionResult {
    const previousState = alert.state
    const now = new Date().toISOString()

    if (alert.state === 'acknowledged') {
      return {
        alert: {
          ...alert,
          state: 'unacknowledged',
          stateChangedAt: now,
          condition: true,
          acknowledgedAt: undefined,
          acknowledgedBy: undefined
        },
        cleared: false,
        previousState
      }
    }

    if (alert.state === 'rtn-unacknowledged') {
      return {
        alert: {
          ...alert,
          state: 'unacknowledged',
          stateChangedAt: now,
          condition: true,
          clearedAt: undefined
        },
        cleared: false,
        previousState
      }
    }

    // A latched alert whose condition cleared waits here, still unacknowledged
    // but with condition false and a clearedAt. The condition coming back is a
    // fresh annunciation, so it resets clearedAt and counts as a state change.
    if (!alert.condition) {
      return {
        alert: {
          ...alert,
          condition: true,
          clearedAt: undefined,
          stateChangedAt: now
        },
        cleared: false,
        previousState
      }
    }

    return {
      alert: { ...alert },
      cleared: false,
      previousState
    }
  }

  unsilence(alert: Alert): Alert {
    return {
      ...alert,
      silenced: false,
      silencedUntil: undefined
    }
  }
}
