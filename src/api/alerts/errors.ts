/**
 * Errors the alert subsystem throws at its callers.
 *
 * Each carries a stable `code`, so the REST layer selects a status from the
 * type rather than by matching message text. The shape follows
 * `NotificationManagerDisabledError` in `packages/server-api`.
 */

/** No alert with the given id is in the active registry. */
export class AlertNotFoundError extends Error {
  readonly code = 'ALERT_NOT_FOUND'
  constructor(alertId: string) {
    super(`Alert not found: ${alertId}`)
    this.name = 'AlertNotFoundError'
  }
}

/** The requested priority is not above the alert's current one. */
export class InvalidEscalationError extends Error {
  readonly code = 'INVALID_ESCALATION'
  constructor(from: string, to: string) {
    super(`Cannot escalate from ${from} to ${to}: new priority must be higher`)
    this.name = 'InvalidEscalationError'
  }
}

/** The requested silence duration is not a positive number of milliseconds. */
export class InvalidSilenceDurationError extends Error {
  readonly code = 'INVALID_SILENCE_DURATION'
  constructor() {
    super('Silence duration must be a positive number of milliseconds')
    this.name = 'InvalidSilenceDurationError'
  }
}

/** The active set is full, so no further alert can be raised. */
export class AlertLimitReachedError extends Error {
  readonly code = 'ALERT_LIMIT_REACHED'
  constructor(limit: number) {
    super(
      `The active alert limit of ${String(limit)} is reached. ` +
        'Resolve alerts before raising new ones.'
    )
    this.name = 'AlertLimitReachedError'
  }
}

/** The path that identifies an alert is not usable as one. */
export class InvalidAlertPathError extends Error {
  readonly code = 'INVALID_ALERT_PATH'
  constructor(reason: string) {
    super(`Invalid alert path: ${reason}.`)
    this.name = 'InvalidAlertPathError'
  }
}

/** The requested priority is not one the subsystem knows. */
export class InvalidAlertPriorityError extends Error {
  readonly code = 'INVALID_ALERT_PRIORITY'
  constructor(priority: string) {
    super(`Invalid alert priority: ${priority}.`)
    this.name = 'InvalidAlertPriorityError'
  }
}

/** A descriptive field is larger than the subsystem will carry. */
export class InvalidAlertDescriptionError extends Error {
  readonly code = 'INVALID_ALERT_DESCRIPTION'
  constructor(reason: string) {
    super(`Invalid alert description: ${reason}.`)
    this.name = 'InvalidAlertDescriptionError'
  }
}
