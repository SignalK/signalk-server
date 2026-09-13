import type { Path, SourceRef } from './deltas'

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
  // which then leaks into priority configuration and ACL checks. Fall
  // back per branch so a missing label doesn't double the suffix
  // (e.g. canName.canName) — pick a label that's distinct from the
  // suffix the branch will emit.
  if (source.canName) {
    const label = source.label || source.src || 'unknown_source'
    return `${label}.${source.canName}` as SourceRef
  }
  if (source.src !== undefined && source.src !== null) {
    const label = source.label || source.canName || 'unknown_source'
    return `${label}.${source.src}` as SourceRef
  }
  if (typeof source === 'object') {
    // A plugin source is fully identified by its label (the plugin id):
    // there is no talker or device address to disambiguate, and the
    // `.XX` fallback below would make $source `<pluginId>.XX`, which no
    // longer matches the bare plugin id that `excludeSelf` resolves to —
    // so a plugin emitting `source: { label, type: 'plugin' }` would see
    // its own output back. Return the bare label for plugin sources.
    if (source.type === 'plugin') {
      return (source.label || 'unknown_source') as SourceRef
    }
    const label = source.label || 'unknown_source'
    return `${label}${source.talker ? '.' + source.talker : '.XX'}` as SourceRef
  }
  // source is actually a $source string
  return source as SourceRef
}

const MMSI_PREFIX = 'urn:mrn:imo:mmsi:'

// Property names `fillIdentityField` writes onto a vessel context.
const IDENTITY_FIELD_MMSI = 'mmsi'
const IDENTITY_FIELD_UUID = 'uuid'
const IDENTITY_FIELD_URL = 'url'

// Vessel identity paths `fillIdentityField` may write as a bare primitive
// rather than a value object.
const IDENTITY_PATHS = new Set<string>([
  IDENTITY_FIELD_MMSI,
  IDENTITY_FIELD_UUID,
  IDENTITY_FIELD_URL
])

/**
 * True when `path` is a vessel identity path that `fillIdentityField`
 * may write onto the vessel context as a bare primitive.
 */
export function isIdentityPath(path: Path): boolean {
  return IDENTITY_PATHS.has(path)
}

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
    vesselData[IDENTITY_FIELD_MMSI] = identity.substring(MMSI_PREFIX.length)
  } else if (identity.startsWith('urn:mrn:signalk')) {
    vesselData[IDENTITY_FIELD_UUID] = identity
  } else {
    vesselData[IDENTITY_FIELD_URL] = identity
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
