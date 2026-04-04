import {
  ALARM_STATE,
  Context,
  Notification,
  NotificationData,
  NotificationId,
  Path
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
   * Raise a notification.
   *
   * @category Notifications API
   *
   * @param options - Alarm options.
   * @returns Notification Identifier
   *
   */
  raise(options: AlarmOptions): NotificationId

  /**
   * Raise a Person Overboard notification.
   *
   * @category Notifications API
   *
   * @param message - Message to display or speak.
   * @returns Notification Identifier
   *
   */
  mob(message: string): NotificationId

  /**
   * Update the notification with the supplied identifier.
   *
   * @category Notifications API
   *
   * @param id - Notification identifier.
   * @param options - Alarm options.
   *
   */
  update(id: NotificationId, options: AlarmOptions): void

  /**
   * Silences the notification with the supplied identifier.
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
   * Acknowledges the notification with the supplied identifier.
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
   * Clears the notification with the supplied identifier.
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
 * @property path - Path to assign to the Notification (default: `notifications.{notificationId}`)
 * @property position - Set true to include the vessel position in the Notification
 * @property createdAt - Set true to include the time in the Notification
 * @property appendId - Set true to append the `notificationId` to the Notification path
 * @property data - Additional information provided in key | value pairs
 */
export interface AlarmOptions {
  state: ALARM_STATE
  message: string
  path?: Path
  position?: boolean
  createdAt?: boolean
  appendId?: boolean
  data?: Record<string, NotificationData>
}

/**
 * @category  Notifications API
 */
export interface AlarmProperties {
  context: Context
  path: Path
  value: Notification
}
