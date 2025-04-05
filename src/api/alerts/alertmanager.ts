import { v4 as uuidv4 } from 'uuid'
import {
  SourceRef,
  AlertMetaData,
  isAlertPriority,
  AlertPriority,
  AlertProcess,
  AlertAlarmState,
  AlertValue
} from '@signalk/server-api'
import { AlertsApplication } from '.'

const ALARM_SILENCE_TIME = 30000 // 30 secs
const ALERT_ESCALATION_TIME = 5 * 60000 // 5 min

// Alert States
type ALERT_STATE = 'normal' | 'abnormal_unack' | 'abnormal_ack'

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

  private silencedTimer!: NodeJS.Timeout
  private escalationTimer!: NodeJS.Timeout
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
    this.clearTimers()
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

  /** Update the Alert priority and set abnormal_unack state */
  updatePriority(value: AlertPriority) {
    if (!isAlertPriority(value)) {
      throw new Error('Invalid Alert Priority supplied!')
    } else {
      if (value === this.priority) return
      this.resolved = undefined
      this.silenced = false
      this.priority = value
      this.setAlertState('abnormal_unack')
      this.notify()
      this.startEscalationTimer()
    }
  }

  // Unacknowledged alert escalation timer
  startEscalationTimer(interval: number = ALERT_ESCALATION_TIME) {
    if (this.priority === 'warning') {
      console.log(`Starting Alert Escalation Timer....`)
      this.escalationTimer = setTimeout(() => {
        if (!this.acknowledged && this.priority === 'warning') {
          console.log(`Escalating Alert from WARNING to ALARM`)
          this.updatePriority('alarm')
        }
      }, interval)
    }
  }

  /** raise an alert amnd set abnormal_unack state */
  raise(priority?: AlertPriority, metaData?: AlertMetaData) {
    this.metaData = metaData ?? {
      sourceRef: 'alertsApi' as SourceRef,
      message: `Alert created at ${this.created}`
    }
    this.updatePriority(priority as AlertPriority)
  }

  /** return to normal condition */
  resolve() {
    this.setAlertState('normal')
    this.resolved = new Date()
    this.notify()
  }

  /** acknowledge alert */
  ack() {
    this.setAlertState('abnormal_ack')
    this.notify()
  }

  /** un-acknowledge alert */
  unAck() {
    this.setAlertState('abnormal_ack')
    this.notify()
    this.startEscalationTimer()
  }

  /** temporarily silence alert */
  silence(): boolean {
    if (this.priority === 'alarm' && this.process !== 'normal') {
      this.silenced = true
      this.notify()
      this.silencedTimer = setTimeout(() => {
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

  private clearTimers() {
    if (this.silencedTimer) {
      clearTimeout(this.silencedTimer)
      this.silenced = false
    }
    if (this.escalationTimer) {
      clearTimeout(this.escalationTimer)
    }
  }

  private setAlertState(state: ALERT_STATE) {
    this.clearTimers()
    if (state === 'normal') {
      this.process = 'normal' as AlertProcess
      this.alarmState = 'inactive' as AlertAlarmState
    } else if (state === 'abnormal_unack') {
      this.process = 'abnormal' as AlertProcess
      this.alarmState = 'active' as AlertAlarmState
      this.acknowledged = false
    } else if (state === 'abnormal_ack') {
      this.process = 'abnormal' as AlertProcess
      this.alarmState = 'active' as AlertAlarmState
      this.acknowledged = true
    }
  }

  /** Emit notification */
  private notify() {
    let method: string[]
    if (this.alarmState === 'inactive') {
      method = []
    } else if (
      this.silenced ||
      this.acknowledged ||
      this.priority === 'caution'
    ) {
      method = ['visual']
    } else {
      method = ['visual', 'sound']
    }
    const state = this.process === 'normal' ? 'normal' : this.priority
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

interface AlertListParams {
  priority: AlertPriority
  top: number
  unack: string
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

  add(alert: Alert): string {
    this.alerts.set(alert.value.id, alert)
    return alert.value.id
  }

  get(id: string) {
    return this.alerts.get(id)
  }

  delete(id: string) {
    if (this.alerts.get(id)?.canRemove) {
      this.alerts.get(id)?.destroy()
      this.alerts.delete(id)
    } else {
      throw new Error('Cannot remove alert as it is still in abnormal state!')
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
