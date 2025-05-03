import { Brand } from './brand'
import { MetaValue, Source, Timestamp } from './schema'

export interface WithContext {
  context: Context
}

/** @inline - Not exported as part of the public API */
type NormalizedBaseDelta = {
  context: Context
  $source: SourceRef
  source: Source
  path: Path
  timestamp: Timestamp
}

export type NormalizedMetaDelta = NormalizedBaseDelta & {
  value: MetaValue
  isMeta: true
}

export type NormalizedValueDelta = NormalizedBaseDelta & {
  value: UnspecifiedValue
  isMeta: false
}

export type NormalizedDelta = NormalizedValueDelta | NormalizedMetaDelta

export type SourceRef = Brand<string, 'sourceRef'>

export type Path = Brand<string, 'path'>
export type Context = Brand<string, 'context'>

// TSTODO: All uses of this should be replaced with `GetFieldType<SignalK, Path>`
export type UnspecifiedValue = unknown

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
  value: UnspecifiedValue
}

// MetaMessage
export interface Meta {
  path: Path
  value: MetaValue
}
