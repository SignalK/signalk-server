import {
  ALARM_METHOD,
  ALARM_STATE,
  ALARM_STATUS,
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

export interface AlarmProperties {
  context: Context
  path: Path
  value: Value
}

export class Alarm {
  private external = false // true when alarm was created from delta
  status: ALARM_STATUS = {
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

  constructor(value: string | Delta) {
    if (typeof value === 'string') {
      this.timeStamp()
      this.status.canClear = true
      this.update.notificationId = value
      this.path = `notifications.${value}` as Path
    } else {
      this.fromDelta(value)
    }
  }

  /** Initialise Alarm from peristed state */
  public init(v: Alarm) {
    this.path = v.path
    this.value = v.value
    this.external = v.external
    this.status = v.status
    this.context = v.context
    this.update = v.update
    this.path = v.path
    this.value = v.value
  }

  /** Extract and populate attrributes from delta */
  private parseDelta(delta: Delta) {
    this.context = delta.context as Context
    this.update = delta.updates[0]
    if (hasValues(this.update)) {
      this.path = this.update.values[0].path
      this.value = this.update.values[0].value as Notification
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

  /** Update the timestamp to now() */
  private timeStamp() {
    this.update.timestamp = new Date().toISOString() as Timestamp
  }

  /** create / update alarm from delta */
  public fromDelta(delta: Delta) {
    this.external = true
    this.status.canClear = false

    this.parseDelta(delta)

    if (!this.status.acknowledged && 'acknowledgeStatus' in this.value) {
      this.status.acknowledged =
        this.value.acknowledgeStatus === 'Yes' ? true : false
    }
    if (!this.status.silenced && 'temporarySilenceStatus' in this.value) {
      this.status.silenced =
        this.value.temporarySilenceStatus === 'Yes' ? true : false
    }

    if ('temporarySilenceSupport' in this.value) {
      this.status.canSilence =
        this.value.temporarySilenceSupport === 'Yes' ? true : false
    }
    if ('acknowledgeSupport' in this.value) {
      this.status.canAcknowledge =
        this.value.acknowledgeSupport === 'Yes' ? true : false
    }
    this.alignAlarmMethod()
  }

  /** Return delta to send */
  get delta(): Delta {
    if (hasValues(this.update)) {
      this.update.values = [
        {
          path: this.path,
          value: !this.value.id
            ? Object.assign(this.value, { id: this.update.notificationId })
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

  /** Return external key */
  get extKey(): string {
    return `${this.update.$source}/${this.context}/${this.path}`
  }

  /** Sets the path associated with the alarm
   * @param id If supplied the id will be appended to the notification path
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
