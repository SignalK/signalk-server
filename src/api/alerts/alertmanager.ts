import { v4 as uuidv4 } from 'uuid'
import { Path, Position, SourceRef } from '@signalk/server-api'
import { AlertsApplication } from '.'

export type AlertPriority = 'emergency' | 'alarm' | 'warning' | 'caution'
export type AlertProcess = 'normal' | 'abnormal'
export type AlertAlarmState = 'active' | 'inactive'

interface AlertAdditionalProperties {
  name?: string
  message?: string
  position?: Position
  path?: Path
  sourceRef?: SourceRef
}
export interface AlertMetaData extends AlertAdditionalProperties {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [index: string]: any
}

export interface AlertValue {
  id: string
  created: Date
  resolved: Date
  priority: AlertPriority
  process: AlertProcess
  alarmState: AlertAlarmState
  acknowledged: boolean
  silenced: boolean
  metaData: AlertMetaData
}

export interface AlertListParams {
  priority: AlertPriority
  top: number
  unack: string
}

export const isAlertPriority = (value: AlertPriority) => {
  return ['emergency', 'alarm', 'warning', 'caution'].includes(value)
}

const ALARM_SILENCE_TIME = 30000 // 30 secs

// Class encapsulating an alert
export class Alert {
  protected id: string
  protected created: Date
  protected resolved!: Date | undefined
  protected priority: AlertPriority = 'caution'
  protected process: AlertProcess = 'normal'
  protected alarmState: AlertAlarmState = 'inactive'
  protected acknowledged: boolean = false
  protected silenced: boolean = false
  protected metaData: AlertMetaData = {}

  private timer!: NodeJS.Timeout
  private app: AlertsApplication

  constructor(
    app: AlertsApplication,
    priority?: AlertPriority,
    metaData?: AlertMetaData
  ) {
    this.app = app
    this.id = uuidv4()
    this.created = new Date()
    this.raise(priority, metaData)
  }

  /** clean up */
  destroy() {
    this.clearSilencer()
  }

  /** return Alert value */
  get value(): AlertValue {
    return {
      id: this.id,
      created: this.created,
      resolved: this.resolved as Date,
      priority: this.priority,
      process: this.process,
      alarmState: this.alarmState,
      acknowledged: this.acknowledged,
      silenced: this.silenced,
      metaData: this.metaData
    }
  }

  get canRemove(): boolean {
    return this.process === 'normal'
  }

  /** Set / update Alert metadata */
  set properties(values: AlertMetaData) {
    this.metaData = Object.assign({}, this.metaData, values)
    this.notify()
  }

  /** Update the Alert priority */
  updatePriority(value: AlertPriority) {
    if (!isAlertPriority(value)) {
      throw new Error('Invalid Alert Priority supplied!')
    } else {
      if (value === this.priority) return
      // set the new Alert state for the supplied priority
      this.priority = value
      this.process = 'abnormal'
      this.resolved = undefined
      this.silenced = false
      this.acknowledged = false
      if (['emergency', 'alarm'].includes(value)) {
        this.alarmState = 'active'
      } else {
        this.alarmState = 'inactive'
      }
      this.notify()
    }
  }

  /**set to abnormal condition */
  raise(priority?: AlertPriority, metaData?: AlertMetaData) {
    this.clearSilencer()
    this.metaData = metaData ?? {
      sourceRef: 'alertsApi' as SourceRef,
      message: `Alert created at ${this.created}`
    }
    this.updatePriority(priority as AlertPriority)
  }

  /** return to normal condition */
  resolve() {
    this.clearSilencer()
    this.alarmState = 'inactive'
    this.process = 'normal'
    this.resolved = new Date()
    this.notify()
  }

  /** acknowledge alert */
  ack() {
    this.clearSilencer()
    this.alarmState = 'active'
    this.acknowledged = true
    this.notify()
  }

  /** un-acknowledge alert */
  unAck() {
    this.clearSilencer()
    this.alarmState = ['emergency', 'alarm'].includes(this.priority)
      ? 'active'
      : 'inactive'
    this.acknowledged = false
    this.notify()
  }

  /** temporarily silence alert */
  silence(): boolean {
    if (this.priority === 'alarm' && this.process !== 'normal') {
      this.silenced = true
      this.notify()
      this.timer = setTimeout(() => {
        // unsilence after 30 secs
        console.log(
          `*** Alert ${this.metaData.name ?? 'id'} (${
            this.id
          }) has been unsilenced.`
        )
        this.silenced = false
        this.notify()
      }, ALARM_SILENCE_TIME)
      console.log(
        `*** Silence alert ${this.metaData.name ?? 'id'} (${this.id}) for ${
          ALARM_SILENCE_TIME / 1000
        } seconds.`
      )
      return true
    } else {
      return false
    }
  }

  private clearSilencer() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.silenced = false
    }
  }

  /** Emit notification */
  private notify() {
    const method =
      this.alarmState === 'inactive'
        ? []
        : this.silenced
        ? ['visual']
        : ['visual', 'sound']
    const state = this.alarmState === 'inactive' ? 'normal' : this.priority
    const meta: AlertMetaData = Object.assign({}, this.metaData)
    delete meta.message
    delete meta.sourceRef
    meta['created'] = this.created
    const msg = {
      id: this.id,
      method: method,
      state: state,
      message: this.metaData.message ?? '',
      metaData: meta
    }
    const path = `notifications.${meta.path ? meta.path + '.' : ''}${msg.id}`
    delete meta.path
    this.app.handleMessage(this.metaData.sourceRef ?? 'alertsApi', {
      updates: [
        {
          values: [
            {
              path: path,
              value: msg
            }
          ]
        }
      ]
    })
  }
}

// Alert Manager
export class AlertManager {
  private alerts: Map<string, Alert> = new Map()

  constructor() {}

  list(params?: AlertListParams) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let r: { [key: string]: any } = {}
    const hasParams = Object.keys(params ?? {}).length !== 0
    this.alerts.forEach((al: Alert, k: string) => {
      // filter priority
      if (hasParams && typeof params?.priority !== 'undefined') {
        if (params?.priority === al.value.priority) {
          r[k] = al.value
        }
      }
      // filter unack
      else if (
        hasParams &&
        typeof params?.unack !== 'undefined' &&
        params?.unack !== '0'
      ) {
        if (
          ['emergency', 'alarm'].includes(al.value.priority) &&
          !al.value.acknowledged
        ) {
          r[k] = al.value
        }
      } else {
        r[k] = al.value
      }
    })
    // filter top x
    if (hasParams && typeof params?.top !== 'undefined') {
      const t = Number(params.top)
      const ra = Object.entries(r)
      if (ra.length > t) {
        r = {}
        ra.slice(0 - t).forEach((i) => {
          r[i[0]] = i[1]
        })
      }
    }
    return r
  }

  add(alert: Alert) {
    this.alerts.set(alert.value.id, alert)
  }

  get(id: string) {
    return this.alerts.get(id)
  }

  delete(id: string) {
    if (this.alerts.get(id)?.canRemove) {
      this.alerts.get(id)?.destroy()
      this.alerts.delete(id)
    }
  }

  ackAll() {
    for (const al of this.alerts) {
      if (al) al[1].value.acknowledged = true
    }
  }

  silenceAll() {
    for (const al of this.alerts) {
      if (al) al[1].silence()
    }
  }

  /** remove resolved alerts */
  clean() {
    for (const al of this.alerts) {
      if (al && al[1].canRemove) {
        al[1].destroy()
        this.alerts.delete(al[0])
      }
    }
  }
}
