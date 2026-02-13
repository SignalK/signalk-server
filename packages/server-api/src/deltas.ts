import { Brand } from './brand'

export {
  ALARM_STATE,
  ALARM_METHOD,
  MetaValueSchema,
  ZoneSchema,
  type Zone,
  type AlarmStatus,
  type MetaValue,
  type Notification
} from './protocol-schemas'

import type { MetaValue, Notification } from './protocol-schemas'

// ---------------------------------------------------------------------------
// Branded types
// ---------------------------------------------------------------------------

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
export type NotificationId = Brand<string, 'notificationId'>

// ---------------------------------------------------------------------------
// Value — the union of possible delta values
// ---------------------------------------------------------------------------

/** @category Server API */
export type Value = object | number | string | null | Notification | boolean

// ---------------------------------------------------------------------------
// Delta & Update — use branded types for internal server code
// ---------------------------------------------------------------------------

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
export interface Delta {
  context?: Context
  updates: Update[]
}

/**
 * @deprecated Use Delta instead
 * @hidden
 */
export type ValuesDelta = Delta
/**
 * @deprecated Use Delta instead
 * @hidden
 */
export type MetaDelta = Delta

/** @category Server API */
export type Update = {
  timestamp?: Timestamp
  /** @deprecated Use $source (SourceRef) instead for more practical string-based referencing */
  source?: Source
  $source?: SourceRef
  notificationId?: NotificationId
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

// MetaMessage
/** @category Server API */
export interface Meta {
  path: Path
  value: MetaValue
}
