// Delta subscription
export interface DeltaSubscription {
  context: string
  subscribe: Array<{
    path: string
    period: number
    format: 'delta' | 'full'
    policy: 'instant' | 'ideal' | 'fixed'
    minPeriod: number
  }>
}

// Delta Message
export interface DeltaMessage {
  updates?: Array<{ values: Update[] }>
  metas?: Array<{ values: Meta[] }>
}

// Update delta
export interface Update {
  path: string
  value: object | number | string | null | Notification
}

// Notification payload
export interface Notification {
  state: ALARM_STATE
  method: ALARM_METHOD[]
  message: string
}

// MetaMessage
export interface Meta {
  path: string
  value: MetaValue
}

// Meta payload
export interface MetaValue {
  description: string
  units?: string
  example?: string
}

// Notification attribute types
export enum ALARM_STATE {
  nominal = 'nominal',
  normal = 'normal',
  alert = 'alert',
  warn = 'warn',
  alarm = 'alarm',
  emergency = 'emergency'
}

export enum ALARM_METHOD {
  visual = 'visual',
  sound = 'sound'
}
