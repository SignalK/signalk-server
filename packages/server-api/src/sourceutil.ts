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
  if (source.canName) {
    return `${source.label}.${source.canName}` as SourceRef
  }
  if (source.src) {
    return `${source.label}.${source.src}` as SourceRef
  }
  if (typeof source === 'object') {
    return (source.label +
      (source.talker ? '.' + source.talker : '.XX')) as SourceRef
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
  if (identity.indexOf('urn:mrn:imo') === 0) {
    vesselData.mmsi = identity.substring(MMSI_PREFIX.length)
  } else if (identity.indexOf('urn:mrn:signalk') === 0) {
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
    full.self = identity
  }
}
