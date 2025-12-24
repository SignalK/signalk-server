import {
  ALARM_STATE,
  Delta,
  hasValues,
  SKVersion,
  Timestamp,
  Update,
  Context,
  Path
} from '@signalk/server-api'

import { NotificationApplication } from './index'
import { Alert, AlertProperties } from './alert'
import * as uuid from 'uuid'
import * as _ from 'lodash'

/**
 * Class to manage the lifecycle of alerts / alarms
 */
export class AlertManager {
  private app: NotificationApplication
  private alerts: Map<string, Alert> = new Map()
  private readonly deltaVersion = SKVersion.v1

  constructor(private server: NotificationApplication) {
    this.app = server
  }

  /** List Alerts */
  get list(): { [key: string]: AlertProperties } {
    const l: { [key: string]: AlertProperties } = {}
    this.alerts.forEach((v: Alert, k: string) => {
      l[k] = v.properties
    })
    return l
  }

  /**
   * Return Alert with specified identifier
   * @param id Alert identifier
   * @returns Alert properties
   */
  get(id: string): AlertProperties {
    return this.alerts.get(id)?.properties as AlertProperties
  }

  /**
   * Raise alert and return identifier
   * @param options Object to initialise the Alert
   * @returns alert id
   */
  raise(options: {
    state: ALARM_STATE
    message: string
    path?: Path
    meta?: { [key: string]: object | number | string | null | boolean }
    position?: boolean
    createdAt?: boolean
  }): string {
    const id = uuid.v4()
    const alert = new Alert(id)
    alert.value.state = options.state
    if (options.path) {
      alert.setPath(options.path)
    }
    if (options.message) {
      alert.value.message = options.message
    }
    if (options.position || options.state === ALARM_STATE.emergency) {
      alert.value.position =
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        _.get((this.app.signalk as any).self, 'navigation.position')?.value ??
        null
    }
    if (options.createdAt || options.state === ALARM_STATE.emergency) {
      alert.value.createdAt = new Date().toISOString() as Timestamp
    }
    /*if (options.meta) {
      (alert.value as any).meta = options.meta
    }*/
    this.alerts.set(id, alert)
    this.app.handleMessage(
      'notificationApi',
      alert?.delta as Delta,
      this.deltaVersion
    )
    return id
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
   */
  silence(id: string) {
    if (!this.alerts.has(id)) {
      throw new Error('Alert not found!')
    }
    const alert = this.alerts.get(id)
    alert?.silence()
    this.app.handleMessage(
      'notificationApi',
      alert?.delta as Delta,
      this.deltaVersion
    )
  }

  /**
   * Acknowledge alert by removing the 'sound' method from the notification
   * @param id Notification identifier
   */
  acknowledge(id: string) {
    if (!this.alerts.has(id)) {
      throw new Error('Alert not found!')
    }
    const alert = this.alerts.get(id)
    alert?.acknowledge()
    this.app.handleMessage(
      'notificationApi',
      alert?.delta as Delta,
      this.deltaVersion
    )
  }

  /** Process alert from notification delta */
  fromDelta(u: Update, context: Context) {
    if (hasValues(u) && u.values.length) {
      const id = u.notificationId as string
      if (this.alerts.has(id)) {
        const alert = this.alerts.get(id) as Alert
        alert.fromDelta({ context: context, updates: [u] })
        this.alerts.set(id, alert)
      } else {
        const alert = new Alert({ context: context, updates: [u] })
        this.alerts.set(id, alert)
      }
    }
  }
}
