import { Brand } from '.'

export interface WithContext {
  context: Context
}

export interface NormalizedDelta extends WithContext {
  $source: SourceRef
  source: Source
  path: Path
  value: Value
  isMeta: boolean
}

export type SourceRef = Brand<string, 'sourceRef'>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Source = any
export type Path = Brand<string, 'path'>
export type Timestamp = Brand<string, 'timestamp'>
export type Context = Brand<string, 'context'>
export type Value = object | number | string | null | Notification

// Delta subscription
export interface DeltaSubscription {
  context: Context
  subscribe: Array<{
    path: Path
    period: number
    format: 'delta' | 'full'
    policy: 'instant' | 'ideal' | 'fixed'
    minPeriod: number
  }>
}

// "Classic" Delta with values
export interface ValuesDelta {
  context?: Context
  updates: Update[]
}

export interface MetaDelta {
  metas: Array<{ values: Meta[] }>
}

// Delta Message
export type Delta = ValuesDelta | MetaDelta

export interface Update {
  timestamp?: Timestamp
  source?: Source
  $source?: SourceRef
  values: PathValue[]
}

// Update delta
export interface PathValue {
  path: Path
  value: Value
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
  description?: string
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
