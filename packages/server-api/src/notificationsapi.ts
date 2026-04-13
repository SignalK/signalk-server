import {
  ALARM_STATE,
  Context,
  Notification,
  NotificationId,
  Path,
  Value
} from '.'

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
   *
   */
  getById(id: NotificationId): AlarmProperties | undefined

  /**
   * Retrieve a list notifications keyed by identifier.
   *
   * @category Notifications API
   *
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
   * app.notificationsApi.raise({
   *  state: 'warn',
   *  message: 'Port engine temperature is higher than normal.'
   * })
   *
   * // path = `notifications.{notificationId}`
   * ```
   *
   *@example Raise notification specifying the path
   * ```typescript
   * app.notificationsApi.raise({
   *  state: 'warn',
   *  message: 'Port engine temperature is higher than normal.',
   *  path: 'propulsion.port.temperature'
   * })
   * ```
   *
   * @example Raise notification specifying the path and append notification id
   * ```typescript
   * app.notificationsApi.raise({
   *  state: 'warn',
   *  message: 'Port engine temperature is higher than normal.',
   *  path: 'propulsion.port.temperature',
   *  idInPath: true
   * })
   *
   * // path = `notifications.propulsion.port.temperature.{notificationId}`
   * ```
   *
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
   * app.notificationsApi.mob()
   *
   * // path = `notifications.mob.{notificationId}`
   * ```
   *
   * @example Raise MOB with specified message
   * ```typescript
   * app.notificationsApi.mob('Crew member overboard!')
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
   *
   * @example
   * ```typescript
   * app.notificationsApi.update(
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
   *
   */
  silence(id: NotificationId): void

  /**
   * Silences all notifications.
   *
   * @category Notifications API
   *
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
   *
   */
  acknowledge(id: NotificationId): void

  /**
   * Acknowledges all notifications.
   *
   * @category Notifications API
   *
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
   *
   */
  clear(id: NotificationId): void
}

/** @category  Notifications API */
export interface WithNotificationsApi {
  notificationsApi: NotificationsApi
}

/**
 * @category  Notifications API
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
