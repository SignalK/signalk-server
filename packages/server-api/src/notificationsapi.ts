import {
  ALARM_STATE,
  Context,
  Notification,
  NotificationId,
  Path,
  Value
} from '.'

/**
 * @see [Notifications REST API](../../../docs/develop/rest-api/notifications_api.md) provides the following functions for use by plugins.
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
   */
  raise(options: AlarmRaiseOptions): NotificationId

  /**
   * Raise a Person Overboard notification.
   *
   * @category Notifications API
   *
   * @param message - Message to display or speak.
   * @returns Notification Identifier
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
 * @property path - Path to assign to the Notification (default = `notifications.{notificationId}`)
 * @property idInPath - Set true to append the `notificationId` to the Notification path (default = false)
 * @property includePosition - Set true to include the vessel position in the Notification (default = false)
 * @property includeCreatedAt - Set true to include the time in the Notification (default = false)
 * @property data - Additional information provided in key | value pairs
 */
export interface AlarmRaiseOptions {
  state: ALARM_STATE
  message?: string
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
