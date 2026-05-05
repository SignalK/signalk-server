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

function buildRegexArray(
  allEntries: Record<string, PathMetadataEntry>
): RegexEntry[] {
  const result: RegexEntry[] = []
  for (const [key, metadata] of Object.entries(allEntries)) {
    // Convert path wildcards to regex: * → [^/]+ and RegExp → [^/]+
    const pattern = key
      .replace(/\*/g, '[^/]+')
      .replace(/RegExp/g, '[^/]+')
      .replace(/\(([^)]+)\)/g, '($1)') // preserve regex groups like (single)|([A-C])
    // Skip entries whose key ends in a bare wildcard. These are container
    // shapes (e.g. /vessels/*/electrical/ac/RegExp defines "an AC bus",
    // not "any child of electrical.ac"). Letting them match would attach
    // the container description to plugin-invented siblings — matches the
    // old @signalk/signalk-schema behaviour.
    if (key.endsWith('/*') || key.endsWith('/RegExp')) {
      continue
    }
    try {
      result.push({
        pattern: new RegExp(`^${pattern}$`),
        key,
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
  private allMetadata: Record<string, PathMetadataEntry>
  private regexEntries: RegexEntry[]
  private readonly seedEntries: Record<string, PathMetadataEntry>

  constructor(entries: Record<string, PathMetadataEntry>) {
    this.seedEntries = entries
    this.allMetadata = { ...entries }
    this.regexEntries = buildRegexArray(this.allMetadata)
  }

  /**
   * Restore the registry to its construction-time state, dropping any
   * runtime additions made via addMetaData / internalGetMetadata. Intended
   * for test isolation; production code should not call this.
   */
  reset(): void {
    this.allMetadata = { ...this.seedEntries }
    this.regexEntries = buildRegexArray(this.allMetadata)
  }

  /**
   * Look up metadata for a dot-separated Signal K path.
   * Returns the metadata entry or undefined if no match.
   */
  getMetadata(path: string): PathMetadataEntry | undefined {
    const slashPath = '/' + path.replace(/\./g, '/')
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
    const slashPath = '/' + path.replace(/\./g, '/')
    const parts = path.split('.')
    // Need at least context root + identity + one path segment to
    // produce a meaningful per-path key. Anything shorter would yield
    // keys like "/vessels/*/" that match nothing.
    if (parts.length < 3) {
      return undefined
    }
    // Use wildcard key so all identities share the same cloned entry
    const key = `/${parts[0]}/*/${parts.slice(2).join('/')}`

    // Check for existing wildcard entry first
    if (this.allMetadata[key]) {
      return this.allMetadata[key]
    }

    // Find via regex against the full path
    const result = this.regexEntries.find((entry) =>
      entry.pattern.test(slashPath)
    )
    if (!result || Object.keys(result.metadata).length === 0) {
      return undefined
    }

    // Deep clone the matched entry so runtime additions are per-path.
    // Spec entries can carry nested objects (displayScale, zones, *Method
    // arrays) — a shallow clone would share those nested references with
    // the template, so a plugin tweaking displayScale on one path would
    // silently change every other path that matches the same wildcard.
    const cloned: PathMetadataEntry = structuredClone(result.metadata)
    this.allMetadata[key] = cloned
    // Escape special chars first, then replace wildcard
    const escaped = key.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    this.regexEntries.push({
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
    context: string,
    path: string,
    meta: Record<string, unknown>
  ): void {
    // An empty path would key the entry at "/vessels/*/" (no tail) and
    // mask every per-vessel entry under the same context root.
    if (!path) {
      return
    }
    // Use wildcard key pattern so lookups with any identity match
    const root = context.split('.')[0]
    const key = `/${root}/*/${path.replace(/\./g, '/')}`
    const existing = this.allMetadata[key]
    if (existing) {
      Object.assign(existing, meta)
      return
    }

    // Seed from the matching spec template, if any, so untouched fields
    // like units / enum survive when a plugin only updates description.
    const seed = this.getMetadata(`${context}.${path}`)
    const entry: PathMetadataEntry = { description: '' }
    if (seed) Object.assign(entry, seed)
    Object.assign(entry, meta)
    this.allMetadata[key] = entry

    // Escape special chars first, then replace wildcard
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
