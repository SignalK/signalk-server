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
import { DbStore } from './dbstore'

/**
 * Class to manage the lifecycle of alarms
 */
export class NotificationManager {
  private app: NotificationApplication
  private alarms: Map<string, Alarm> = new Map()
  private readonly deltaVersion = SKVersion.v1
  private db: DbStore

  private timer?: NodeJS.Timeout

  constructor(
    private server: NotificationApplication,
    private dbs: DbStore
  ) {
    this.app = server
    this.db = dbs
    this.loadFromStore()
  }

  /** initialise alarms from persisted state */
  private async loadFromStore() {
    try {
      const r = await this.db.listAlarms()
      if (r) {
        r.forEach((i: { id: string; value: Alarm }) => {
          const alarm = new Alarm(i.id)
          alarm.init(i.value)
          this.alarms.set(i.id, alarm)
          // emit notifications for loaded alarms
          this.alarms.forEach((alarm: Alarm) => {
            this.emitNotification(alarm)
          })
        })
      }
      // start cleanup timer
      this.timer = setInterval(() => this.clean(), 60000)
    } catch {
      this.alarms = new Map()
    }
  }

  /**
   * Emit notification for the supplied alarm object
   * @param alarm Alarm object
   */
  private emitNotification(alarm: Alarm) {
    this.app.handleMessage(
      'notificationApi',
      alarm?.delta as Delta,
      this.deltaVersion
    )
  }

  /** Return a list of Alarms keyd by their id */
  get list(): Record<string, AlarmProperties> {
    const l: Record<string, AlarmProperties> = {}
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
  get(id: string): AlarmProperties | undefined {
    return this.alarms.get(id)?.properties
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
    this.db.setAlarm(id, alarm)
    this.emitNotification(alarm)
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
    const alarm = this.alarms.get(id) as Alarm
    alarm?.silence()
    this.db.setAlarm(id, alarm)
    this.emitNotification(alarm)
  }

  /**
   * Acknowledge alarm by removing the 'sound' method from the notification
   * @param id Notification identifier
   */
  acknowledge(id: string) {
    if (!this.alarms.has(id)) {
      throw new Error('Alarm not found!')
    }
    const alarm = this.alarms.get(id) as Alarm
    alarm?.acknowledge()
    this.db.setAlarm(id, alarm)
    this.emitNotification(alarm)
  }

  /**
   * Clear alarm by setting notification state to `normal`
   * @param id Notification identifier
   */
  clear(id: string) {
    if (!this.alarms.has(id)) {
      throw new Error('Alarm not found!')
    }
    const alarm = this.alarms.get(id) as Alarm
    alarm?.clear()
    this.db.setAlarm(id, alarm)
    this.emitNotification(alarm)
  }

  /** Process alarm from notification delta */
  async fromDelta(u: Update, context: Context) {
    if (hasValues(u) && u.values.length) {
      const id = u.notificationId as string
      let alarm: Alarm
      if (this.alarms.has(id)) {
        alarm = this.alarms.get(id) as Alarm
        alarm.fromDelta({ context: context, updates: [u] })
        this.alarms.set(id, alarm)
      } else {
        alarm = new Alarm({ context: context, updates: [u] })
        this.alarms.set(id, alarm)
      }
      this.db.setAlarm(id, alarm)
    }
  }

  /**
   * Clean out alarms that have returned to NORMAL state
   */
  private clean() {
    const al: string[] = []
    const nk: string[] = []
    this.alarms.forEach((v: Alarm, k: string) => {
      if (v.value.state === 'normal') {
        al.push(k)
        nk.push(v.extKey)
      }
    })
    if (al.length) {
      al.forEach((id) => {
        this.alarms.delete(id)
      })
      this.db.deleteAlarm(al)
      this.db.deleteNoti(nk)
    }
  }
}
