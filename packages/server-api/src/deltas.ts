import { Position } from '.'
import { Brand } from './brand'

/** @hidden */
export interface WithContext {
  context: Context
}

/** @inline - Not exported as part of the public API */
type NormalizedBaseDelta = {
  context: Context
  $source: SourceRef
  /** @deprecated Use $source instead */
  source?: Source
  path: Path
  timestamp: Timestamp
}

/** @hidden */
export type NormalizedMetaDelta = NormalizedBaseDelta & {
  value: MetaValue
  isMeta: true
}

/** @hidden */
export type NormalizedValueDelta = NormalizedBaseDelta & {
  value: Value
  isMeta: false
}

/** @hidden */
export type NormalizedDelta = NormalizedValueDelta | NormalizedMetaDelta

/** @category Server API */
export type SourceRef = Brand<string, 'sourceRef'>
/** @category Server API */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Source = any

/** @category Server API */
export type Path = Brand<string, 'path'>
/** @category Server API */
export type Timestamp = Brand<string, 'timestamp'>
/** @category Server API */
export type Context = Brand<string, 'context'>

/** @category Server API */
export type Value = object | number | string | null | Notification | boolean

/** @category Server API */
export interface Delta {
  context?: Context
  updates: Update[]
}

/**
 * @deprecated earlier mistake assumed ValuesDelta and MetaDelta were separate
 * @hidden
 */
export type ValuesDelta = Delta
/**
 * @deprecated earlier mistake assumed ValuesDelta and MetaDelta were separate
 * @hidden
 */
export type MetaDelta = Delta

/** @category Server API */
export type Update = {
  timestamp?: Timestamp
  /** @deprecated Use $source (SourceRef) instead for more practical string-based referencing */
  source?: Source
  $source?: SourceRef
  notificationId?: string
} & ({ values: PathValue[] } | { meta: Meta[] }) // require either values or meta or both

/** @category Server API */
export function hasValues(u: Update): u is Update & { values: PathValue[] } {
  return 'values' in u && Array.isArray(u.values)
}

/** @category Server API */
export function hasMeta(u: Update): u is Update & { meta: Meta[] } {
  return 'meta' in u && Array.isArray(u.meta)
}

// Update delta
/** @category Server API */
export interface PathValue {
  path: Path
  value: Value
}

// Notification payload
/** @category Server API */
export interface Notification {
  state: ALARM_STATE
  method: ALARM_METHOD[]
  message: string
  status?: AlarmStatus
  position?: Position
  createdAt?: Timestamp
  id?: string
}

// MetaMessage
/** @category Server API */
export interface Meta {
  path: Path
  value: MetaValue
}

// Meta payload
/** @category Server API */
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
  zones?: Zone[]
  supportsPut?: boolean
}

// Notification attribute types
/** @category Server API */
export enum ALARM_STATE {
  nominal = 'nominal',
  normal = 'normal',
  alert = 'alert',
  warn = 'warn',
  alarm = 'alarm',
  emergency = 'emergency'
}

/** @category Server API */
export enum ALARM_METHOD {
  visual = 'visual',
  sound = 'sound'
}

/** @category Server API */
export interface AlarmStatus {
  silenced: boolean
  acknowledged: boolean
  canSilence: boolean
  canAcknowledge: boolean
  canClear: boolean
}

/** @category Server API */
export interface Zone {
  lower: number | undefined
  upper: number | undefined
  state: ALARM_STATE
  message: string
}
