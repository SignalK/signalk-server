import {
  ALARM_METHOD,
  Context,
  Delta,
  hasValues,
  Notification,
  Timestamp,
  Update
} from '@signalk/server-api'

import { NotificationApplication, deltaVersion } from './index'

interface AlertStatus {
  external: boolean // true = alert was ceated from notification (not via API)
  silence: boolean
  acknowledge: boolean
  delta: Delta // external alert content
}

/**
 * Class to manage the lifecycle of alerts / alarms
 */
export class AlertManager {
  private app: NotificationApplication
  private alerts: Map<string, AlertStatus> = new Map()

  constructor(private server: NotificationApplication) {
    this.app = server
  }

  /** List Alerts */
  list() {
    return Array.from(this.alerts)
  }

  /**
   * Return Alert with specified identifier
   * @param id Alert identifier
   */
  get(id: string) {
    return this.alerts.get(id)
  }

  /**
   * Remove Alert with specified identifier - does not emit delta
   * @param id Alert identifier
   */
  remove(id: string) {
    this.alerts.delete(id)
  }

  /**
   * Silence alert by removing the 'sound' method from the notification
   * @param id Notification identifier
   * @param ack true = acknowledge, false = silence
   */
  silence(id: string, ack?: boolean) {
    if (!this.alerts.has(id)) return false

    const a = this.alerts.get(id) as AlertStatus

    if (ack) a.acknowledge = true
    else a.silence = true

    if (a.external) {
      if ('values' in a.delta.updates[0]) {
        const value: Notification = a.delta.updates[0].values[0]
          .value as Notification
        value.method = this.alignAlarmMethod(id, value.method)
        a.delta.updates[0].timestamp = new Date().toISOString() as Timestamp
        this.alerts.set(id, a)
        this.app.handleMessage('notificationApi', a.delta, deltaVersion)
        return true
      } else {
        return false
      }
    } else {
      // notify()
    }
  }

  /**
   * Align notification alarm method with recorded user action
   * @param id
   * @param method
   * @returns alarm method
   */
  private alignAlarmMethod(
    id: string,
    method: Array<ALARM_METHOD>
  ): Array<ALARM_METHOD> {
    const a = this.alerts.get(id)
    if (a?.silence || a?.acknowledge) {
      return method.filter((i) => i !== 'sound')
    } else {
      return method
    }
  }

  external(u: Update, context: Context) {
    if (hasValues(u) && u.values.length) {
      const value = u.values[0].value as Notification
      const id = u.notificationId as string

      if (this.alerts.has(id)) {
        value.method = this.alignAlarmMethod(id, value.method)
        const n = this.alerts.get(id) as AlertStatus
        n.delta = { context: context, updates: [u] }
        this.alerts.set(id, n)
      } else {
        this.alerts.set(id, {
          external: true,
          silence: false,
          acknowledge: false,
          delta: { context: context, updates: [u] }
        })
      }
    }
  }
}
