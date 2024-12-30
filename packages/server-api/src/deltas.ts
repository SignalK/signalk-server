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

export interface Delta {
  context?: Context
  updates: Update[]
}

/**
 * @deprecated earlier mistake assumed ValuesDelta and MetaDelta were separate
 */
export type ValuesDelta = Delta
/**
 * @deprecated earlier mistake assumed ValuesDelta and MetaDelta were separate
 */
export type MetaDelta = Delta

export type Update = {
  timestamp?: Timestamp
  source?: Source
  $source?: SourceRef
} & ({ values: PathValue[] } | { meta: Meta[] }) // require either values or meta or both

export function hasValues(u: Update): u is Update & { values: PathValue[] } {
  return 'values' in u && Array.isArray(u.values)
}

export function hasMeta(u: Update): u is Update & { meta: Meta[] } {
  return 'meta' in u && Array.isArray(u.meta)
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
  data?: { [key: string]: object | number | string | null }
  id?: string
}

// MetaMessage
export interface Meta {
  path: Path
  value: MetaValue
}

// Meta payload
export interface MetaValue {
  description?: string
  units?: string
  example?: string
  timeout?: number
  displayName?: string
  displayScale?: {
    lower: number
    upper: number
  }
  zones?: {
    upper: number
    lower: number
    state: string
  }[]
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
