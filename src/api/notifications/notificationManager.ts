import {
  ALARM_STATE,
  Delta,
  hasValues,
  SKVersion,
  Timestamp,
  Update,
  Context,
  Path,
  AlarmOptions,
  SourceRef
} from '@signalk/server-api'

import { NotificationApplication } from './index'
import { Alarm, AlarmProperties } from './alarm'
import * as uuid from 'uuid'
import * as _ from 'lodash'

const CLEAN_INTERVAL = 60000

/**
 *
 * @param context Signal K Context
 * @param path Signal K Path
 * @param source Delta sourceRef
 * @returns String representing a key associating notification deltas to their notificationId
 */
export const buildKey = (
  context: Context,
  path: Path,
  source: SourceRef
): string => {
  return `${context}/${path}/${source}`
}

/**
 * Class to manage the lifecycle of alarms
 */
export class NotificationManager {
  private app: NotificationApplication
  private alarms: Map<string, Alarm> = new Map()
  private readonly deltaVersion = SKVersion.v1

  private cleanTimer?: NodeJS.Timeout
  private forCleaning: string[] = []

  constructor(private server: NotificationApplication) {
    this.app = server
    // start cleanup timer
    this.cleanTimer = setInterval(() => this.clean(), CLEAN_INTERVAL)
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

  /** Return a list of Alarms keyed by their id */
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
  raise(options: AlarmOptions): string {
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
    this.emitNotification(alarm)
    return id
  }

  /**
   * Update alarm properties
   * @param id Alarm identifier
   * @param options Key / values to update
   */
  update(id: string, options: AlarmOptions) {
    const alarm = this.alarms.get(id)
    if (!alarm) {
      throw new Error('Notification not found!')
    }

    if (options.state) {
      alarm.value.state = options.state
      alarm.status.canSilence =
        options.state === ALARM_STATE.emergency ? false : true
    }
    if (options.message) {
      alarm.value.message = options.message
    }
    /*if (options.meta) {
      (alarm.value as any).meta = options.meta
    }*/
    this.alarms.set(id, alarm)
    this.emitNotification(alarm)
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
   * Silence All alarms
   */
  silenceAll() {
    this.alarms.forEach((alarm: Alarm) => {
      try {
        alarm?.silence()
        this.emitNotification(alarm)
      } catch {
        // already silenced
      }
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
    this.emitNotification(alarm)
  }

  /**
   * Acknowledge All alarms
   */
  acknowledgeAll() {
    this.alarms.forEach((alarm: Alarm) => {
      alarm?.acknowledge()
      this.emitNotification(alarm)
    })
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
    this.emitNotification(alarm)
  }

  /**
   * Process alarm from notification delta
   * @param u Update object of incoming Delta message
   * @param context Incoming Delta message context value
   */
  async fromDelta(u: Update, context: Context) {
    if (hasValues(u) && u.values.length) {
      const id = u.notificationId as string
      let alarm: Alarm
      if (this.alarms.has(id)) {
        alarm = this.alarms.get(id) as Alarm
        alarm.fromDelta({ context: context, updates: [u] })
        this.alarms.set(id, alarm)
      } else {
        alarm = new Alarm()
        alarm.fromDelta({ context: context, updates: [u] })
        this.alarms.set(id, alarm)
      }
      this.emitNotification(alarm)
    }
  }

  /**
   * Clean out alarms that have returned to and remained in NORMAL state
   * for the duration of CLEAN_INTERVAL
   */
  private clean() {
    const idsToDelete: string[] = []
    const nextClean: string[] = []
    this.alarms.forEach((v: Alarm, k: string) => {
      if (
        this.forCleaning.includes(k) &&
        v.value?.state === ALARM_STATE.normal
      ) {
        idsToDelete.push(k)
      } else {
        nextClean.push(k)
      }
    })
    this.forCleaning = nextClean

    if (idsToDelete.length) {
      idsToDelete.forEach((id) => {
        this.alarms.delete(id)
      })
    }
  }
}
