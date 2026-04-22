import {
  ALARM_STATE,
  Delta,
  hasValues,
  SKVersion,
  Timestamp,
  Update,
  Context,
  Path,
  AlarmRaiseOptions,
  AlarmUpdateOptions,
  SourceRef,
  NotificationId,
  Brand,
  AlarmProperties
} from '@signalk/server-api'

import { NotificationApplication } from './index'
import { Alarm } from './alarm'
import * as uuid from 'uuid'
import * as _ from 'lodash'

const CLEAN_INTERVAL = 60000

export type NotificationKey = Brand<string, 'notificationKey'>

export const buildKey = (
  context: Context,
  path: Path,
  source: SourceRef
): NotificationKey => {
  return `${context}/${path}/${source}` as NotificationKey
}

/**
 * Class to manage the lifecycle of alarms
 */
export class NotificationManager {
  private app: NotificationApplication
  private alarms: Map<NotificationId, Alarm> = new Map()
  private readonly deltaVersion = SKVersion.v1

  private cleanTimer?: NodeJS.Timeout
  private forCleaning: NotificationId[] = []

  constructor(private server: NotificationApplication) {
    this.app = server
    this.cleanTimer = setInterval(() => this.clean(), CLEAN_INTERVAL)
  }

  private emitNotification(alarm: Alarm) {
    this.app.handleMessage(
      'notificationApi',
      alarm?.delta as Delta,
      this.deltaVersion
    )
  }

  get list(): Record<string, AlarmProperties> {
    const l: Record<string, AlarmProperties> = {}
    this.alarms.forEach((v: Alarm, k: string) => {
      l[k] = v.properties
    })
    return l
  }

  get(id: NotificationId): AlarmProperties | undefined {
    if (!id) {
      throw new Error('Notification identifier not supplied!')
    }
    return this.alarms.get(id)?.properties
  }

  getPath(path: Path): Record<string, AlarmProperties> {
    if (!path) {
      throw new Error('Notification path not supplied!')
    }
    const l: Record<string, AlarmProperties> = {}
    this.alarms.forEach((v: Alarm, k: string) => {
      if (v.properties.path === path) {
        l[k] = v.properties
      }
    })
    return l
  }

  raise(options: AlarmRaiseOptions): NotificationId {
    if (!options) {
      throw new Error('Notification properties not supplied!')
    }
    const {
      state,
      message,
      context,
      path,
      idInPath,
      includePosition,
      includeCreatedAt,
      data
    } = options

    if (!state || !message) {
      throw new Error(
        'Notification `state` or `message` properties are missing!'
      )
    }

    const id = uuid.v4() as NotificationId
    const alarm = new Alarm(id)

    if (context) {
      alarm.setContext(context)
    }
    alarm.value.state = state
    alarm.status.canSilence = state === ALARM_STATE.emergency ? false : true
    alarm.value.message = message

    if (path) {
      alarm.setPath(path, idInPath ? id : undefined)
    }
    if (includePosition || state === ALARM_STATE.emergency) {
      alarm.value.position =
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        _.get((this.app.signalk as any).self, 'navigation.position')?.value ??
        null
    }
    if (includeCreatedAt || state === ALARM_STATE.emergency) {
      alarm.value.createdAt = new Date().toISOString() as Timestamp
    }
    if (data) {
      alarm.value.data = { ...data }
    }

    this.alarms.set(id, alarm)
    this.emitNotification(alarm)
    return id
  }

  update(id: NotificationId, options: AlarmUpdateOptions) {
    if (!id) {
      throw new Error('Notification identifier not supplied!')
    }
    const alarm = this.alarms.get(id)
    if (!alarm) {
      throw new Error('Notification not found!')
    }

    const { state, message, data } = options
    const stateChanged = alarm.value.state !== state

    alarm.value.state = state ?? alarm.value.state
    alarm.status.canSilence =
      state && state === ALARM_STATE.emergency ? false : true
    alarm.value.message = message ?? alarm.value.message
    if (stateChanged) {
      alarm.status.silenced = false
      alarm.status.acknowledged = false
    }
    if (data) {
      alarm.value.data = { ...data }
    }

    this.alarms.set(id, alarm)
    this.emitNotification(alarm)
  }

  mob(message?: string): NotificationId {
    return this.raise({
      state: ALARM_STATE.emergency,
      message: message ?? 'Person Overboard!',
      path: 'mob' as Path,
      idInPath: true,
      includePosition: true,
      includeCreatedAt: true
    })
  }

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

  silence(id: NotificationId) {
    if (!id) {
      throw new Error('Notification identifier not supplied!')
    }
    if (!this.alarms.has(id)) {
      throw new Error('Alarm not found!')
    }
    const alarm = this.alarms.get(id) as Alarm
    alarm?.silence()
    this.emitNotification(alarm)
  }

  acknowledgeAll() {
    this.alarms.forEach((alarm: Alarm) => {
      alarm?.acknowledge()
      this.emitNotification(alarm)
    })
  }

  acknowledge(id: NotificationId) {
    if (!id) {
      throw new Error('Notification identifier not supplied!')
    }
    if (!this.alarms.has(id)) {
      throw new Error('Alarm not found!')
    }
    const alarm = this.alarms.get(id) as Alarm
    alarm?.acknowledge()
    this.emitNotification(alarm)
  }

  clear(id: NotificationId) {
    if (!id) {
      throw new Error('Notification identifier not supplied!')
    }
    if (!this.alarms.has(id)) {
      throw new Error('Alarm not found!')
    }
    const alarm = this.alarms.get(id) as Alarm
    alarm?.clear()
    this.emitNotification(alarm)
  }

  processNotificationUpdate(u: Update, context: Context) {
    if (hasValues(u) && u.values.length) {
      const id = u.notificationId as NotificationId
      let alarm: Alarm
      if (this.alarms.has(id)) {
        alarm = this.alarms.get(id) as Alarm
        alarm.syncFromNotificationUpdate(u, context)
        this.alarms.set(id, alarm)
      } else {
        alarm = new Alarm()
        alarm.syncFromNotificationUpdate(u, context)
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
    const idsToDelete: NotificationId[] = []
    const nextClean: NotificationId[] = []
    this.alarms.forEach((v: Alarm, k: NotificationId) => {
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

    idsToDelete.forEach((id) => {
      this.alarms.delete(id)
    })
  }
}
