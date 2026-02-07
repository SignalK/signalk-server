import {
  ALARM_METHOD,
  ALARM_STATE,
  AlarmStatus,
  Context,
  Delta,
  hasValues,
  Notification,
  Path,
  SourceRef,
  Timestamp,
  Update,
  Value
} from '@signalk/server-api'
import { buildKey } from './notificationManager'

export interface AlarmProperties {
  context: Context
  path: Path
  value: Value
}

export class Alarm {
  private external = false // true when alarm was created from delta
  status: AlarmStatus = {
    silenced: false,
    acknowledged: false,
    canSilence: true,
    canAcknowledge: true,
    canClear: false
  }
  private context: Context = '' as Context
  private update: Update = {
    values: [],
    $source: 'notificationsApi' as SourceRef,
    timestamp: undefined,
    notificationId: undefined
  }
  private path: Path = '' as Path
  public value: Notification = {
    state: ALARM_STATE.normal,
    method: [ALARM_METHOD.visual, ALARM_METHOD.sound],
    message: '',
    status: this.status
  }

  /**
   * Alarm Object
   * @param notificationId Notification identifier
   */
  constructor(notificationId?: string) {
    if (notificationId) {
      this.timeStamp()
      this.status.canClear = true
      this.update.notificationId = notificationId
      this.path = `notifications.${notificationId}` as Path
    }
  }

  /**
   * Extract and populate attributes from update and context
   * @param update Update object
   * @param context Context value
   */
  private parseDelta(update: Update, context: Context) {
    this.context = context
    this.update = update
    if (hasValues(this.update)) {
      this.path = this.update.values[0].path
      // ensure value is not empty
      if (this.update.values[0].value) {
        this.value = this.update.values[0].value as Notification
      } else {
        this.value.message = ''
        this.value.method = []
        this.value.state = ALARM_STATE.normal
      }
    }
  }

  /**
   * Align notification alarm method with state and recorded user action
   */
  private alignAlarmMethod() {
    if (this.status.acknowledged) {
      if (this.value.state === 'emergency') {
        this.value.method = [ALARM_METHOD.visual]
      } else {
        this.value.method = []
      }
    } else if (this.status.silenced) {
      if (this.value.state !== 'emergency') {
        this.value.method = this.value.method.filter((i) => i !== 'sound')
      }
    }
  }

  /** Update the timestamp to the current date / time */
  private timeStamp() {
    this.update.timestamp = new Date().toISOString() as Timestamp
  }

  /**
   * Create / update alarm from incoming update and context
   * @param update Update object
   * @param context Context value
   */
  public syncFromNotificationUpdate(update: Update, context: Context) {
    this.external = true
    this.status.canClear = false

    this.parseDelta(update, context)

    if (
      !this.status.acknowledged &&
      this.value &&
      'acknowledgeStatus' in this.value
    ) {
      this.status.acknowledged =
        this.value.acknowledgeStatus === 'Yes' ? true : false
    }
    if (
      !this.status.silenced &&
      this.value &&
      'temporarySilenceStatus' in this.value
    ) {
      this.status.silenced =
        this.value.temporarySilenceStatus === 'Yes' ? true : false
    }

    if (this.value && 'temporarySilenceSupport' in this.value) {
      this.status.canSilence =
        this.value.temporarySilenceSupport === 'Yes' ? true : false
    }
    if (this.value && 'acknowledgeSupport' in this.value) {
      this.status.canAcknowledge =
        this.value.acknowledgeSupport === 'Yes' ? true : false
    }
    this.alignAlarmMethod()
  }

  /**
   * Returns true if Alarm is external (generated from incoming Delta message)
   */
  get isExternal(): boolean {
    return this.external
  }

  /**
   * Generates and returns the delta payload for use with `handleMessage()`
   * @returns Delta message payload
   */
  get delta(): Delta {
    if (hasValues(this.update)) {
      this.update.values = [
        {
          path: this.path,
          value: this.value
            ? Object.assign(
                this.value,
                { id: this.update.notificationId },
                { status: this.status }
              )
            : this.value
        }
      ]
    }
    const d: Delta = { updates: [this.update] }
    if (this.external) {
      d.context = this.context
    }
    return d
  }

  /** Return Alarm properties */
  get properties(): AlarmProperties {
    return {
      context: this.context,
      path: this.path,
      value: this.value
    }
  }

  /**
   * Return the external key (context/path/$source) of an alarm generated from incoming Delta.
   */
  get extKey(): string {
    return buildKey(this.context, this.path, this.update.$source as SourceRef)
  }

  /**
   * Sets the path associated with the alarm.
   * @param id If supplied, the identifier will be appended to the notification path.
   */
  public setPath(path: Path, id?: string) {
    if (path) {
      path = path.startsWith('notifications.')
        ? path
        : (`notifications.${path}` as Path)
      this.path = id ? (`${path}.${id}` as Path) : path
    }
  }

  /** Silence Alarm */
  public silence() {
    if (!this.status.canSilence) {
      throw new Error('Alarm cannot be silenced!')
    }
    if (this.status.silenced || this.status.acknowledged) {
      throw new Error('Alarm already silenced or acknowledged!')
    }
    if (this.value.state === 'emergency') {
      throw new Error('Cannot silence Emergency Alarm!')
    }
    this.status.silenced = true
    this.alignAlarmMethod()
    this.timeStamp()
  }

  /** Acknowledge Alarm */
  public acknowledge() {
    if (!this.status.canAcknowledge) {
      throw new Error('Alarm cannot be acknowledged!')
    }
    if (this.status.acknowledged) {
      throw new Error('Alarm already acknowledged!')
    }
    this.status.acknowledged = true
    this.alignAlarmMethod()
    this.timeStamp()
  }

  /**
   * Clears the Alarm by setting state = normal and resetting status.
   */
  public clear() {
    if (!this.status.canClear) {
      throw new Error('Alarm cannot be cleared!')
    }
    this.value.state = ALARM_STATE.normal
    this.status.silenced = false
    this.status.acknowledged = false
    this.timeStamp()
  }
}
