import {
  ALARM_STATE,
  Context,
  Notification,
  NotificationId,
  Path,
  Value
} from '.'

/**
 * Error thrown by Notifications API methods that require the core
 * NotificationManager when `notifications.manageNotifications` is `false`.
 * Identify it with `instanceof` or via its `code` property.
 *
 * @category Notifications API
 */
export class NotificationManagerDisabledError extends Error {
  readonly code = 'NOTIFICATION_MANAGER_DISABLED'
  constructor() {
    super('Core notification management is disabled on this server.')
    this.name = 'NotificationManagerDisabledError'
  }
}

/**
 * Plugin interface functions.
 * @see [Notifications REST API](../../../docs/develop/rest-api/notifications_api.md) for further details.
 * @category  Notifications API
 */
export interface NotificationsApi {
  /**
   * Retrieve the notification with the supplied identifier.
   *
   * @category Notifications API
   *
   * @param id - Notification identifier.
   * @throws {@link NotificationManagerDisabledError} when core notification
   * management is disabled (`notifications.manageNotifications = false`).
   *
   * @example
   * ```typescript
   * app.notifications.getId('9922c05a-2813-4995-ab72-33f8f2246ff7')
   * ```
   */
  getId(id: NotificationId): AlarmProperties | undefined

  /**
   * Retrieve the notification(s) with the supplied path.
   *
   * When core notification management is disabled, entries are read from the
   * data model (`self` context only): values carry no core-side `status`, keys
   * are the source-supplied `value.id` when present (otherwise the
   * notification path), and matching is by subtree (path prefix) rather than
   * exact path.
   *
   * @category Notifications API
   *
   * @param path - Notification path.
   *
   * @example
   * ```typescript
   * app.notifications.getPath('notifications.server.newVersion')
   * ```
   */
  getPath(path: Path): Record<NotificationId, AlarmProperties>

  /**
   * Retrieve a list notifications keyed by identifier.
   *
   * When core notification management is disabled, entries are read from the
   * data model (`self` context only): values carry no core-side `status`, and
   * keys are the source-supplied `value.id` when present, otherwise the
   * notification path.
   *
   * @category Notifications API
   *
   * @example
   * ```typescript
   * app.notifications.list()
   * ```
   */
  list(): Record<NotificationId, AlarmProperties>

  /**
   * Raises a new notification and assigns an identifier.
   *
   * @category Notifications API
   *
   * @param options - Alarm options.
   * @returns Notification Identifier
   *
   * @example Raise notification with minimum information
   * ```typescript
   * app.notifications.raise({
   *  state: 'warn',
   *  message: 'Port engine temperature is higher than normal.'
   * })
   *
   * // path = `notifications.{notificationId}`
   * ```
   *
   *@example Raise notification specifying the path
   * ```typescript
   * app.notifications.raise({
   *  state: 'warn',
   *  message: 'Port engine temperature is higher than normal.',
   *  path: 'propulsion.port.temperature'
   * })
   * ```
   *
   * @example Raise notification specifying the path and append notification id
   * ```typescript
   * app.notifications.raise({
   *  state: 'warn',
   *  message: 'Port engine temperature is higher than normal.',
   *  path: 'propulsion.port.temperature',
   *  idInPath: true
   * })
   *
   * // path = `notifications.propulsion.port.temperature.{notificationId}`
   * ```
   *
   * Note: when core notification management is disabled
   * (`notifications.manageNotifications = false`), `path` is required — there
   * is no `notifications.{notificationId}` fallback — and a plain `Error` is
   * thrown if it is missing. The returned id is embedded in the emitted value
   * but not tracked by the server. `context` is ignored: the notification is
   * emitted for the self context, matching managed-mode emission.
   */
  raise(options: AlarmRaiseOptions): NotificationId

  /**
   * Raise a Person Overboard (MOB) notification.
   *
   * @category Notifications API
   *
   * @param message - Message to display or speak.
   * @returns Notification Identifier
   *
   * @example Raise MOB with default message ('Person Overboard!')
   * ```typescript
   * app.notifications.mob()
   *
   * // path = `notifications.mob.{notificationId}`
   * ```
   *
   * @example Raise MOB with specified message
   * ```typescript
   * app.notifications.mob('Crew member overboard!')
   * ```
   *
   */
  mob(message?: string): NotificationId

  /**
   * Update the notification with the supplied identifier.
   *
   * @category Notifications API
   *
   * @param id - Notification identifier.
   * @param options - Alarm options.
   * @throws {@link NotificationManagerDisabledError} when core notification
   * management is disabled (`notifications.manageNotifications = false`).
   *
   * @example
   * ```typescript
   * app.notifications.update(
   *  '9922c05a-2813-4995-ab72-33f8f2246ff7',
   *  {
   *    state: 'alarm',
   *    message: 'Port engine temperature is dangerously high!'
   *  }
   * )
   * ```
   *
   */
  update(id: NotificationId, options: AlarmUpdateOptions): void

  /**
   * Silence the alarm of the notification with the supplied identifier.
   * Sets `status.silenced = true`
   * Removes `sound` from `method`
   * Note: Calling this method on a Notifications with a status of `canSilence = false` will throw an Error
   *
   * @category Notifications API
   *
   * @param id - Notification identifier.
   * @throws {@link NotificationManagerDisabledError} when core notification
   * management is disabled (`notifications.manageNotifications = false`).
   *
   * @example
   * ```typescript
   * app.notifications.silence('9922c05a-2813-4995-ab72-33f8f2246ff7')
   * ```
   */
  silence(id: NotificationId): void

  /**
   * Silences all notifications.
   *
   * @category Notifications API
   *
   * @throws {@link NotificationManagerDisabledError} when core notification
   * management is disabled (`notifications.manageNotifications = false`).
   *
   * @example
   * ```typescript
   * app.notifications.silenceAll()
   * ```
   */
  silenceAll(): void

  /**
   * Acknowledge the alarm condition of the notification with the supplied identifier.
   * Sets `status.acknowledged = true`
   * Removes `sound` from `method`
   * Note: Calling this method on a Notifications with a status of `canAcknowledge = false` will throw an Error
   *
   * @category Notifications API
   *
   * @param id - Notification identifier.
   * @throws {@link NotificationManagerDisabledError} when core notification
   * management is disabled (`notifications.manageNotifications = false`).
   *
   * @example
   * ```typescript
   * app.notifications.acknowledge('9922c05a-2813-4995-ab72-33f8f2246ff7')
   * ```
   */
  acknowledge(id: NotificationId): void

  /**
   * Acknowledges all notifications.
   *
   * @category Notifications API
   *
   * @throws {@link NotificationManagerDisabledError} when core notification
   * management is disabled (`notifications.manageNotifications = false`).
   *
   * @example
   * ```typescript
   * app.notifications.acknowledgeAll()
   * ```
   */
  acknowledgeAll(): void

  /**
   * Clears the alarm from the notification with the supplied identifier
   * by setting `state = normal`
   * Note: Calling this method on a Notifications with a status of `canClear = false` will throw an Error
   *
   * @category Notifications API
   *
   * @param id - Notification identifier.
   * @throws {@link NotificationManagerDisabledError} when core notification
   * management is disabled (`notifications.manageNotifications = false`).
   *
   * @example
   * ```typescript
   * app.notifications.clear('9922c05a-2813-4995-ab72-33f8f2246ff7')
   * ```
   *
   */
  clear(id: NotificationId): void
}

/** @category  Notifications API */
export interface WithNotificationsApi {
  notifications: NotificationsApi
}

/**
 * @category Notifications API
 * @property state - Alarm State value to apply
 * @property message - Message to display or speak
 * @property context - Context to assign to the Notification (default = `self`)
 * @property path - Path to assign to the Notification (default = `notifications.{notificationId}`)
 * @property idInPath - Set true to append the `notificationId` to the Notification path (default = false)
 * @property includePosition - Set true to include the vessel position in the Notification (default = false)
 * @property includeCreatedAt - Set true to include the time in the Notification (default = false)
 * @property data - Additional information provided in key | value pairs
 */
export interface AlarmRaiseOptions {
  state: ALARM_STATE
  message: string
  context?: Context
  path?: Path
  idInPath?: boolean
  includePosition?: boolean
  includeCreatedAt?: boolean
  data?: Record<string, Value>
}

/**
 * @category  Notifications API
 * @property state - Alarm State value to apply
 * @property message - Message to display or speak
 * @property data - Additional information provided in key | value pairs
 */
export interface AlarmUpdateOptions {
  state?: ALARM_STATE
  message?: string
  data?: Record<string, Value>
}

/**
 * @category  Notifications API
 */
export interface AlarmProperties {
  context: Context
  path: Path
  value: Notification
}
