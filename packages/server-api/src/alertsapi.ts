import { Path, Position, SourceRef } from '.'

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

export const isAlertPriority = (value: AlertPriority) => {
  return ['emergency', 'alarm', 'warning', 'caution'].includes(value)
}

