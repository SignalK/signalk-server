import { ALARM_STATE, Path } from '.'

/**
 * @see [Notifications REST API](../../../docs/develop/rest-api/notifications_api.md) provides the following functions for use by plugins.
 * @category  Notifications API
 */
export interface NotificationsApi {
  /**
   * Silences the notification with the supplied identifier.
   * Note: Calling this method on a Notifications with a status of `canSilence = false` will throw an Error
   *
   * @category Notifications API
   *
   * @param id - Notification identifier.
   *
   */
  silenceNotification(id: string): void

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
  acknowledgeNotification(id: string): void

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
}

/** @category  Notifications API */
export interface WithNotificationsApi {
  notificationsApi: NotificationsApi
}

/**
 * @category  Notifications API
 */
export interface AlarmOptions {
  state: ALARM_STATE
  message: string
  path?: Path
  position?: boolean
  createdAt?: boolean
  appendId?: boolean
  //meta?: { [key: string]: object | number | string | null | boolean }
}
