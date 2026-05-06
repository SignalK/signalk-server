//
// Filters delta updates targeting the self vessel context. Static identity
// data (name, mmsi, design dimensions, GPS antenna offsets, callsignVhf) is
// configured at the server level and must not be overwritten by deltas from
// other providers; the only exception is the special `defaults` $source that
// carries the server-level base data itself.
//
// The hot path is `filterStaticSelfData` -> `filterSelfDataKP`, called for
// every value of every self-context delta.
//

import { Context, Delta, PathValue, Update } from '@signalk/server-api'

const ROOT_VESSEL_FILTERED_KEYS: ReadonlySet<string> = new Set(['name', 'mmsi'])

const SELF_DATA_FILTERED_PATHS: ReadonlySet<string> = new Set([
  'design.aisShipType',
  'design.beam',
  'design.length',
  'design.draft',
  'sensors.gps.fromBow',
  'sensors.gps.fromCenter'
])

const COMMUNICATION_FILTERED_KEYS: ReadonlySet<string> = new Set([
  'callsignVhf'
])

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object'
}

function omitKeys(
  obj: Record<string, unknown>,
  exclude: ReadonlySet<string>
): Record<string, unknown> {
  const res: Record<string, unknown> = {}
  for (const k of Object.keys(obj)) {
    if (!exclude.has(k)) {
      res[k] = obj[k]
    }
  }
  return res
}

// Probe the small filter Set against the (typically larger) input object
// rather than enumerating the input's keys.
function hasAnyKey(obj: object, keys: ReadonlySet<string>): boolean {
  for (const k of keys) {
    if (k in obj) {
      return true
    }
  }
  return false
}

// Accepts Partial<Delta> because the upstream input pipeline produces deltas
// with optional fields and patches them in place; see handleMessage in
// src/index.ts.
export function filterStaticSelfData(
  delta: Partial<Delta>,
  selfContext: Context
): Partial<Delta> {
  if (delta.context !== selfContext || !delta.updates) {
    return delta
  }
  const keptUpdates: Update[] = []
  for (const update of delta.updates) {
    if (!('values' in update) || update['$source'] === 'defaults') {
      keptUpdates.push(update)
      continue
    }
    const kept: PathValue[] = []
    for (const pathValue of update.values) {
      const nvp = filterSelfDataKP(pathValue)
      if (nvp) {
        kept.push(nvp)
      }
    }
    if (kept.length === 0) {
      // Every value was filtered out. Keep the update only if it still
      // carries a meta payload; otherwise drop it so empty husk updates
      // don't flow downstream.
      if ('meta' in update) {
        delete (update as { values?: PathValue[] }).values
        keptUpdates.push(update)
      }
    } else {
      update.values = kept
      keptUpdates.push(update)
    }
  }
  delta.updates = keptUpdates
  return delta
}

function filterSelfDataKP(pathValue: PathValue): PathValue | null {
  // Path '' carries the vessel root: filter top-level identity keys plus the
  // communication subobject's callsignVhf.
  if (pathValue.path === '') {
    if (!isRecord(pathValue.value)) {
      // Malformed self-root payload (null, primitive). Pass through unchanged
      // rather than throwing so co-batched valid updates are not lost.
      return pathValue
    }
    let value = pathValue.value
    if (hasAnyKey(value, ROOT_VESSEL_FILTERED_KEYS)) {
      value = omitKeys(value, ROOT_VESSEL_FILTERED_KEYS)
      pathValue.value = value
    }
    const comm = value.communication
    if (isRecord(comm) && hasAnyKey(comm, COMMUNICATION_FILTERED_KEYS)) {
      const filtered = omitKeys(comm, COMMUNICATION_FILTERED_KEYS)
      if (Object.keys(filtered).length === 0) {
        delete value.communication
      } else {
        value.communication = filtered
      }
    }
    if (Object.keys(value).length === 0) {
      return null
    }
    return pathValue
  }
  if (SELF_DATA_FILTERED_PATHS.has(pathValue.path)) {
    return null
  }
  return pathValue
}
