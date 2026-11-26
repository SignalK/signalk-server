import { Position } from '.'
import { Brand } from './brand'

/**
 * Object property names that are unsafe to use as keys when building or
 * walking a nested object tree from untrusted input: assigning through
 * them reaches Object.prototype and pollutes every object in the process.
 * None are valid Signal K context or path segments, so deltas containing
 * them are dropped rather than allowed to mutate the prototype chain.
 * @hidden
 */
export const FORBIDDEN_PATH_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype'
])

const FORBIDDEN_SUBSTRING = /__proto__|constructor|prototype/

/**
 * Whether a dotted context or path has a FORBIDDEN_PATH_KEYS segment.
 * @hidden
 */
export function hasForbiddenPathSegment(dotted: string): boolean {
  // Substring pre-check keeps the common case free of the split allocation.
  if (!FORBIDDEN_SUBSTRING.test(dotted)) {
    return false
  }
  for (const part of dotted.split('.')) {
    if (FORBIDDEN_PATH_KEYS.has(part)) {
      return true
    }
  }
  return false
}

// Sources key several lookup tables, so a source named after any inherited
// member (toString, valueOf, ...) would resolve to a builtin, not just
// the three keys that reach a prototype.
const INHERITED_KEYS = new Set([
  ...Object.getOwnPropertyNames(Object.prototype),
  ...FORBIDDEN_PATH_KEYS
])

// The source fields FullSignalK and the delta cache use as object keys.
const SOURCE_KEY_FIELDS = [
  'label',
  'src',
  'canName',
  'talker',
  'instance',
  'pgn',
  'sentence'
] as const

// Source strings repeat on every delta from a device, so those already found
// safe skip the split. Bounded so unique sources cannot grow it without limit.
const MAX_SAFE_SOURCE_KEYS = 10000
const safeSourceKeys = new Set<string>()

function isUnsafeSourceKey(value: unknown): boolean {
  if (value === undefined || value === null || typeof value === 'number') {
    return false
  }
  if (typeof value === 'string' && safeSourceKeys.has(value)) {
    return false
  }
  for (const part of String(value).split('.')) {
    if (INHERITED_KEYS.has(part)) {
      return true
    }
  }
  if (typeof value === 'string') {
    if (safeSourceKeys.size >= MAX_SAFE_SOURCE_KEYS) {
      safeSourceKeys.clear()
    }
    safeSourceKeys.add(value)
  }
  return false
}

/**
 * Whether an update's `$source` or `source` would resolve to an inherited
 * member when used as an object key.
 * @hidden
 */
export function hasUnsafeSourceKey(update: {
  $source?: unknown
  source?: unknown
}): boolean {
  if (isUnsafeSourceKey(update.$source)) {
    return true
  }
  const source = update.source
  if (source === null || typeof source !== 'object') {
    return isUnsafeSourceKey(source)
  }
  for (const field of SOURCE_KEY_FIELDS) {
    if (isUnsafeSourceKey((source as Record<string, unknown>)[field])) {
      return true
    }
  }
  return false
}

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
  /** The location or part of the vessel where the notification originates from, for display purposes, e.g. "Engine Room". Not the vessel's geographic position. */
  location?: string
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
    type?: 'linear' | 'logarithmic' | 'power' | 'squareroot'
    power?: number
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
  acknowledgedAt?: Timestamp
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
