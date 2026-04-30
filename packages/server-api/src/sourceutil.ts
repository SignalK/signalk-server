import type { SourceRef } from './deltas'

/**
 * Extract a normalised SourceRef string from a source object.
 *
 * Handles NMEA 2000 (canName / src), NMEA 0183 (talker), plain string
 * ($source), and missing-source cases.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSourceId(source: any): SourceRef {
  if (!source) {
    return 'no_source' as SourceRef
  }
  // A source missing `label` would otherwise yield "undefined.<x>",
  // which then leaks into priority configuration and ACL checks.
  // Fall back through canName/src so the ref is at least identifiable.
  const label = source.label || source.canName || source.src || 'unknown_source'
  if (source.canName) {
    return `${label}.${source.canName}` as SourceRef
  }
  if (source.src !== undefined && source.src !== null) {
    return `${label}.${source.src}` as SourceRef
  }
  if (typeof source === 'object') {
    return `${label}${source.talker ? '.' + source.talker : '.XX'}` as SourceRef
  }
  // source is actually a $source string
  return source as SourceRef
}

const MMSI_PREFIX = 'urn:mrn:imo:mmsi:'

/**
 * Set the identity field (mmsi, uuid, or url) on a vessel data object
 * based on the identity string format.
 */
export function fillIdentityField(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vesselData: Record<string, any>,
  identity: string
): void {
  if (identity.startsWith(MMSI_PREFIX)) {
    vesselData.mmsi = identity.substring(MMSI_PREFIX.length)
  } else if (identity.startsWith('urn:mrn:signalk')) {
    vesselData.uuid = identity
  } else {
    vesselData.url = identity
  }
}

/**
 * Iterate all vessels in a full Signal K tree and set identity fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fillIdentity(full: Record<string, any>): void {
  if (!full.vessels) return
  for (const identity of Object.keys(full.vessels)) {
    fillIdentityField(full.vessels[identity], identity)
  }
}
