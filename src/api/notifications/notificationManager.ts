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
import { Alarm, AlarmProperties } from './alarm'
import * as uuid from 'uuid'
import * as _ from 'lodash'

/**
 * Class to manage the lifecycle of alarms
 */
export class NotificationManager {
  private app: NotificationApplication
  private alarms: Map<string, Alarm> = new Map()
  private readonly deltaVersion = SKVersion.v1

  constructor(private server: NotificationApplication) {
    this.app = server
  }

  /** List Alarms */
  get list(): { [key: string]: AlarmProperties } {
    const l: { [key: string]: AlarmProperties } = {}
    this.alarms.forEach((v: Alarm, k: string) => {
      l[k] = v.properties
    })
    return l
  }

  /**
   * Return alarm with specified identifier
   * @param id alarm identifier
   * @returns alarm properties
   */
  get(id: string): AlarmProperties {
    return this.alarms.get(id)?.properties as AlarmProperties
  }

  /**
   * Raise alarm and return identifier
   * @param options Object to initialise the Alarm
   * @returns alarm id
   */
  raise(options: {
    state: ALARM_STATE
    message: string
    path?: Path
    position?: boolean
    createdAt?: boolean
    appendId?: boolean
    meta?: { [key: string]: object | number | string | null | boolean }
  }): string {
    const id = uuid.v4()
    const alarm = new Alarm(id)

    alarm.value.state = options.state
    alarm.status.canSilence =
      options.state === ALARM_STATE.emergency ? false : true

    if (options.path) {
      alarm.setPath(options.path, options.appendId ? id : undefined)
    }
    if (options.message) {
      alarm.value.message = options.message
    }
    if (options.position || options.state === ALARM_STATE.emergency) {
      alarm.value.position =
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        _.get((this.app.signalk as any).self, 'navigation.position')?.value ??
        null
    }
    if (options.createdAt || options.state === ALARM_STATE.emergency) {
      alarm.value.createdAt = new Date().toISOString() as Timestamp
    }
    /*if (options.meta) {
      (alarm.value as any).meta = options.meta
    }*/
    this.alarms.set(id, alarm)
    this.app.handleMessage(
      'notificationApi',
      alarm?.delta as Delta,
      this.deltaVersion
    )
    return id
  }

  /**
   * Raise MOB alarm and return identifier
   * @param options  Object to initialise the alarm. default= 'Person Overboard!'
   * @returns alarm id
   */
  mob(options?: { message: string }): string {
    return this.raise({
      state: ALARM_STATE.emergency,
      message: options?.message ?? 'Person Overboard!',
      path: 'mob' as Path,
      appendId: true,
      position: true,
      createdAt: true
    })
  }

  /**
   * Silence alarm by removing the 'sound' method from the notification
   * @param id Notification identifier
   */
  silence(id: string) {
    if (!this.alarms.has(id)) {
      throw new Error('Alarm not found!')
    }
    const alarm = this.alarms.get(id)
    alarm?.silence()
    this.app.handleMessage(
      'notificationApi',
      alarm?.delta as Delta,
      this.deltaVersion
    )
  }

  /**
   * Acknowledge alarm by removing the 'sound' method from the notification
   * @param id Notification identifier
   */
  acknowledge(id: string) {
    if (!this.alarms.has(id)) {
      throw new Error('Alarm not found!')
    }
    const alarm = this.alarms.get(id)
    alarm?.acknowledge()
    this.app.handleMessage(
      'notificationApi',
      alarm?.delta as Delta,
      this.deltaVersion
    )
  }

  /**
   * Clear alarm by setting notification state to `normal`
   * @param id Notification identifier
   */
  clear(id: string) {
    if (!this.alarms.has(id)) {
      throw new Error('Alarm not found!')
    }
    const alarm = this.alarms.get(id)
    alarm?.clear()
    this.app.handleMessage(
      'notificationApi',
      alarm?.delta as Delta,
      this.deltaVersion
    )
  }

  /**
   * Remove Alarm with specified identifier - does not emit delta
   * @param id Alarm identifier
   */
  remove(id: string) {
    this.alarms.delete(id)
  }

  /** Process alarm from notification delta */
  fromDelta(u: Update, context: Context) {
    if (hasValues(u) && u.values.length) {
      const id = u.notificationId as string
      if (this.alarms.has(id)) {
        const alarm = this.alarms.get(id) as Alarm
        alarm.fromDelta({ context: context, updates: [u] })
        this.alarms.set(id, alarm)
      } else {
        const alarm = new Alarm({ context: context, updates: [u] })
        this.alarms.set(id, alarm)
      }
    }
  }
}
