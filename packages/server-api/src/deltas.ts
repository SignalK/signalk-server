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
  /**
   * Optional staleness-state container preserved through the cache so
   * replayed deltas (and the HTTP API snapshot built from the cache)
   * surface the server's `state.timedOut` flag, matching what a live WS
   * client received in the original delta.
   */
  state?: PathValueState
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
export type NotificationId = Brand<string, 'notificationId'>

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
  state?: PathValueState
}

/**
 * Out-of-band metadata about a particular delta value, set by the server when
 * a value is anything other than a fresh reading from its source. Distinct
 * from `Meta` (which describes the path itself) and from `value` (which is
 * what the source reported). Clients that don't recognise `state` ignore it.
 *
 * @category Server API
 */
export interface PathValueState {
  /**
   * Set to `true` on the synthetic delta the server emits when a source's
   * `meta.timeout` has elapsed since its last update. A sensor that
   * legitimately publishes `value: null` (e.g. an echosounder with no
   * bottom return) does not carry this flag.
   */
  readonly timedOut?: boolean
  /**
   * The last good (non-null) value seen from the timed-out source and its
   * original timestamp. Absent if no good value was ever received.
   */
  readonly lastValue?: {
    readonly timestamp: Timestamp
    readonly value: Value
  }
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
  data?: Record<string, Value>
}

// MetaMessage
/** @category Server API */
export interface Meta {
  path: Path
  value: MetaValue
}

/**
 * Update contract for a path. Determines whether the server's staleness
 * enforcer treats silence as a failure (`periodic`) or as unchanged state
 * (`event`).
 *
 * @category Server API
 */
export type UpdateContract = 'periodic' | 'event'

// Meta payload
/** @category Server API */
export interface MetaValue {
  description?: string
  units?: string
  example?: string
  /**
   * Time in seconds after which a path+source's last value is considered
   * stale. `'auto'` lets the server derive the timeout from observed delta
   * arrival rate. `0` disables enforcement for the path.
   */
  timeout?: number | 'auto'
  /**
   * Declares the path's update contract for staleness enforcement.
   * Defaults to `'periodic'` when absent.
   */
  updateContract?: UpdateContract
  displayName?: string
  displayScale?: {
    lower: number
    upper: number
  }
  zones?: Zone[]
  supportsPut?: boolean
  displayUnits?: {
    category: string
    targetUnit: string
    displayFormat?: string
    formula: string
    inverseFormula: string
    symbol: string
  }
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
