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

// ---------------------------------------------------------------------------
// Assemble all vessel-prefixed metadata
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Regex-based metadata lookup
// ---------------------------------------------------------------------------

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
    try {
      result.push({
        pattern: new RegExp(`^${pattern}$`),
        key,
        metadata
      })
    } catch {
      // Skip invalid patterns
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// MetadataRegistry — singleton
// ---------------------------------------------------------------------------

export class MetadataRegistry {
  private allMetadata: Record<string, PathMetadataEntry>
  private regexEntries: RegexEntry[]

  constructor(entries: Record<string, PathMetadataEntry>) {
    this.allMetadata = { ...entries }
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

    // Clone the matched entry so runtime additions are per-path
    const cloned = { ...result.metadata }
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
   * Called when meta deltas are received.
   */
  addMetaData(
    context: string,
    path: string,
    meta: Record<string, unknown>
  ): void {
    // Use wildcard key pattern so lookups with any identity match
    const root = context.split('.')[0]
    const key = `/${root}/*/${path.replace(/\./g, '/')}`
    let entry = this.allMetadata[key]
    if (!entry) {
      entry = { description: '' }
      this.allMetadata[key] = entry
      // Escape special chars first, then replace wildcard
      const escaped = key.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      this.regexEntries.push({
        pattern: new RegExp(`^${escaped.replace(/\*/g, '[^/]+')}$`),
        key,
        metadata: entry
      })
    }
    Object.assign(entry, meta)
  }

  /** Return all registered metadata entries (for the /paths endpoint). */
  getAllMetadata(): Record<string, PathMetadataEntry> {
    return this.allMetadata
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

const allEntries = expandContextPrefixes({
  ...rootMetadata,
  ...vesselMetadata
})

export const metadataRegistry = new MetadataRegistry(allEntries)

/** Look up metadata for a dot-separated Signal K path. */
export function getMetadata(path: string): PathMetadataEntry | undefined {
  return metadataRegistry.getMetadata(path)
}
