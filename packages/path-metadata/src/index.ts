/**
 * Signal K Path Metadata Registry
 *
 * Provides lookup of well-known path metadata (units, description, enum)
 * via regex-based matching. Supports runtime additions from meta deltas.
 */

import type { PathMetadataEntry } from './types'

import { rootMetadata } from './root'
import { navigationMetadata } from './navigation'
import { environmentMetadata } from './environment'
import { electricalMetadata } from './electrical'
import { tanksMetadata } from './tanks'
import { propulsionMetadata } from './propulsion'
import { performanceMetadata } from './performance'
import { sailsMetadata } from './sails'
import { steeringMetadata } from './steering'
import { designMetadata } from './design'
import { registrationsMetadata } from './registrations'
import { communicationMetadata } from './communication'
import { sensorsMetadata } from './sensors'
import { notificationsMetadata } from './notifications'

export type { PathMetadataEntry } from './types'
export { getAISShipTypeName } from './ais-ship-types'
export { getAtonTypeName } from './aton-types'

const vesselMetadata: Record<string, PathMetadataEntry> = {
  ...navigationMetadata,
  ...environmentMetadata,
  ...electricalMetadata,
  ...tanksMetadata,
  ...propulsionMetadata,
  ...performanceMetadata,
  ...sailsMetadata,
  ...steeringMetadata,
  ...designMetadata,
  ...registrationsMetadata,
  ...communicationMetadata,
  ...sensorsMetadata,
  ...notificationsMetadata
}

/**
 * Expand /vessels/* paths to also cover /aircraft/*, /aton/*, /sar/*
 * since they share the same data model structure.
 */
function expandContextPrefixes(
  entries: Record<string, PathMetadataEntry>
): Record<string, PathMetadataEntry> {
  const expanded: Record<string, PathMetadataEntry> = {}
  for (const [key, value] of Object.entries(entries)) {
    expanded[key] = value
    if (key.startsWith('/vessels/*/')) {
      const suffix = key.slice('/vessels/*/'.length)
      expanded[`/aircraft/*/${suffix}`] = value
      expanded[`/aton/*/${suffix}`] = value
      expanded[`/sar/*/${suffix}`] = value
    }
  }
  return expanded
}

interface RegexEntry {
  pattern: RegExp
  key: string
  metadata: PathMetadataEntry
}

// Metadata is a PATH-keyed, context-INDEPENDENT namespace: a path's units /
// description are identical no matter which context root it appears under
// (vessels.<id>, meteo.<id>, aircraft.<id>, a bare 'meteo', ...). The four
// entity families share one data model, so their identity-scoped seed keys
// (/vessels/*/<path> and the /aircraft|/aton|/sar expansions) reduce to a
// single path-keyed matcher '/*/<path>'. Non-context keys (/self, /version,
// the /resources/* tree) are not '/<root>/*/<path>'-shaped and pass through
// unchanged, so they keep literal matching and cannot leak across roots.
const CONTEXT_ROOT_PREFIX = /^\/(?:vessels|aircraft|aton|sar)\/\*\//
function toMatchKey(key: string): string {
  return key.replace(CONTEXT_ROOT_PREFIX, '/*/')
}

// Strip the context root + identity (first two dot segments) so a lookup
// resolves the same meta under ANY context, yielding the '/*/<tail>' shape
// the re-keyed matcher expects. Callers only ever pass context-prefixed
// paths (vessels.self.<path>, <context>.<identity>.<path>); resources are
// served by ResourceProvider and never reach getMetadata (rest.js next()s
// on the 'resources' prefix before any getMetadata call), so the
// unconditional two-segment strip is safe.
function toLookupPath(path: string): string {
  return '/*/' + path.split('.').slice(2).join('/')
}

function buildRegexArray(
  allEntries: Record<string, PathMetadataEntry>
): RegexEntry[] {
  const result: RegexEntry[] = []
  const seen = new Set<string>()
  for (const [key, metadata] of Object.entries(allEntries)) {
    // Skip entries whose key ends in a bare wildcard. These are container
    // shapes (e.g. /vessels/*/electrical/ac/RegExp defines "an AC bus",
    // not "any child of electrical.ac"). Letting them match would attach
    // the container description to plugin-invented siblings — matches the
    // old @signalk/signalk-schema behaviour. Evaluated on the ORIGINAL key,
    // before re-keying.
    if (key.endsWith('/*') || key.endsWith('/RegExp')) {
      continue
    }
    // Re-key to the path-only matcher. The /aircraft|/aton|/sar expansions
    // collapse onto the same '/*/<tail>' matcher as their /vessels/* source;
    // the seen-Set drops the duplicates so the hot-path .find() stays short.
    // Object.entries preserves insertion order and expandContextPrefixes
    // emits the /vessels/* key before its expansions, so the first (and only
    // retained) entry carries the /vessels/* metadata — identical object,
    // so dropping the rest is harmless.
    const matchKey = toMatchKey(key)
    if (seen.has(matchKey)) {
      continue
    }
    seen.add(matchKey)
    // Convert path wildcards to regex on the re-keyed matcher:
    // * → [^/]+ and RegExp → [^/]+
    const pattern = matchKey
      .replace(/\*/g, '[^/]+')
      .replace(/RegExp/g, '[^/]+')
      .replace(/\(([^)]+)\)/g, '($1)') // preserve regex groups like (single)|([A-C])
    try {
      result.push({
        pattern: new RegExp(`^${pattern}$`),
        key: matchKey,
        metadata
      })
    } catch (e) {
      // A bad metadata key shouldn't take the whole registry down, but
      // it must be visible so the typo or unescaped regex special
      // character can be tracked down. The check runs once at module
      // load over a static set of keys, so warning in production is
      // both cheap and the only way to catch a bug introduced by a
      // future schema sync.
      console.warn(
        `path-metadata: skipping invalid pattern for key "${key}": ${(e as Error).message}`
      )
    }
  }
  return result
}

export class MetadataRegistry {
  // allMetadata stays keyed by the original on-disk keys (/vessels/*/...,
  // /resources/*, /self, /version) and backs getAllMetadata() -> /paths, so
  // the endpoint and PathReference.tsx (which filters on '/vessels/*/') keep
  // the exact same JSON shape. Runtime per-path clones live in a separate
  // path-only map so they never reshape that /paths view.
  private allMetadata: Record<string, PathMetadataEntry>
  private runtimeClones: Record<string, PathMetadataEntry>
  private regexEntries: RegexEntry[]
  private readonly seedEntries: Record<string, PathMetadataEntry>

  constructor(entries: Record<string, PathMetadataEntry>) {
    this.seedEntries = entries
    this.allMetadata = { ...entries }
    this.runtimeClones = {}
    this.regexEntries = buildRegexArray(this.allMetadata)
  }

  /**
   * Restore the registry to its construction-time state, dropping any
   * runtime additions made via addMetaData / internalGetMetadata. Intended
   * for test isolation; production code should not call this.
   */
  reset(): void {
    this.allMetadata = { ...this.seedEntries }
    this.runtimeClones = {}
    this.regexEntries = buildRegexArray(this.allMetadata)
  }

  /**
   * Look up metadata for a dot-separated Signal K path.
   * Returns the metadata entry or undefined if no match.
   */
  getMetadata(path: string): PathMetadataEntry | undefined {
    // Context-independent lookup first (strip context root + identity).
    // Fall back to the literal path so non-context root entries — /self,
    // /version — still resolve when looked up bare; those keys are not
    // '/<root>/*/<tail>'-shaped, so they never participate in the
    // path-only matcher.
    return (
      this.getMetadataForLookupPath(toLookupPath(path)) ??
      this.getMetadataForLookupPath('/' + path.replace(/\./g, '/'))
    )
  }

  // Match an already-normalized '/*/<tail>' lookup path against the regex
  // array. Shared by getMetadata and addMetaData's seed lookup so the
  // path-only normalization lives in exactly one place.
  private getMetadataForLookupPath(
    slashPath: string
  ): PathMetadataEntry | undefined {
    const result = this.regexEntries.find((entry) =>
      entry.pattern.test(slashPath)
    )
    return result && result.metadata && Object.keys(result.metadata).length > 0
      ? result.metadata
      : undefined
  }

  /**
   * Get or create a metadata entry for a specific context+path combination.
   * Used internally by FullSignalK to attach metadata to first-seen values.
   * If an exact entry doesn't exist, clones the matched pattern entry
   * so runtime metadata additions don't pollute the template.
   */
  internalGetMetadata(path: string): PathMetadataEntry | undefined {
    const parts = path.split('.')
    // Need at least context root + identity + one path segment to
    // produce a meaningful per-path key. Anything shorter would yield
    // keys like "/*/" that match nothing.
    if (parts.length < 3) {
      return undefined
    }
    // Key by PATH alone so a value first seen under any context
    // (vessels.self, meteo.<id>, ...) shares one cloned per-path entry.
    const key = `/*/${parts.slice(2).join('/')}`

    // Check for an existing per-path clone first
    if (this.runtimeClones[key]) {
      return this.runtimeClones[key]
    }

    // Find via regex against the path-only lookup form
    const result = this.regexEntries.find((entry) => entry.pattern.test(key))
    if (!result || Object.keys(result.metadata).length === 0) {
      return undefined
    }

    // Deep clone the matched entry so runtime additions are per-path.
    // Spec entries can carry nested objects (displayScale, zones, *Method
    // arrays) — a shallow clone would share those nested references with
    // the template, so a plugin tweaking displayScale on one path would
    // silently change every other path that matches the same wildcard.
    const cloned: PathMetadataEntry = structuredClone(result.metadata)
    this.runtimeClones[key] = cloned
    // Escape special chars first, then replace wildcard. Front of the
    // array so this per-path clone wins over the generic spec wildcard —
    // and so a later addMetaData that merges into this same clone (e.g. a
    // PUT meta displayUnits override) is found ahead of the spec entry.
    const escaped = key.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    this.regexEntries.unshift({
      pattern: new RegExp(`^${escaped.replace(/\*/g, '[^/]+')}$`),
      key,
      metadata: cloned
    })
    return cloned
  }

  /**
   * Merge runtime metadata into the registry for a specific context+path.
   * Called when meta deltas are received. Mirrors the @signalk/signalk-schema
   * v2.25 semantics:
   *  - If the exact per-path key already exists, merge the new fields in.
   *  - If it doesn't, seed the new entry from any matching spec (RegExp)
   *    template so untouched fields (units, enum, etc.) stay intact, then
   *    merge the plugin's fields on top. The per-path regex goes to the
   *    FRONT of the lookup array so getMetadata() finds it before the
   *    generic spec wildcard.
   */
  addMetaData(
    _context: string,
    path: string,
    meta: Record<string, unknown>
  ): void {
    // An empty path would key the entry at "/*/" (no tail) and mask every
    // per-path entry. The context is intentionally ignored: metadata is a
    // path-keyed, context-independent namespace, so a meta delta under ANY
    // context (including an identity-less 'meteo') populates the path for
    // all contexts.
    if (!path) {
      return
    }
    const key = `/*/${path.replace(/\./g, '/')}`
    const existing = this.runtimeClones[key]
    if (existing) {
      Object.assign(existing, meta)
      return
    }

    // Seed from the matching spec template by PATH, if any, so untouched
    // fields like units / enum survive when a plugin only updates
    // description. The key is already the normalized '/*/<tail>' form.
    const seed = this.getMetadataForLookupPath(key)
    const entry: PathMetadataEntry = { description: '' }
    if (seed) Object.assign(entry, seed)
    Object.assign(entry, meta)
    this.runtimeClones[key] = entry

    // Escape special chars first, then replace wildcard. The entry fronts
    // the generic spec wildcard for EVERY context, not just one root.
    const escaped = key.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    this.regexEntries.unshift({
      pattern: new RegExp(`^${escaped.replace(/\*/g, '[^/]+')}$`),
      key,
      metadata: entry
    })
  }

  /** Return all registered metadata entries (for the /paths endpoint). */
  getAllMetadata(): Record<string, PathMetadataEntry> {
    return this.allMetadata
  }
}

const allEntries = expandContextPrefixes({
  ...rootMetadata,
  ...vesselMetadata
})

export const metadataRegistry = new MetadataRegistry(allEntries)

/** Look up metadata for a dot-separated Signal K path. */
export function getMetadata(path: string): PathMetadataEntry | undefined {
  return metadataRegistry.getMetadata(path)
}
