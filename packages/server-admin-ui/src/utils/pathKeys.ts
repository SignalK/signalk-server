// The same Signal K path can have multiple values from different sources.
// We combine them as "path$source" to create a unique key.

export function getPath$SourceKey(path: string, source?: string): string {
  return `${path}$${source ?? ''}`
}

export function getPathFromKey(path$SourceKey: string): string {
  const idx = path$SourceKey.indexOf('$')
  return idx >= 0 ? path$SourceKey.substring(0, idx) : path$SourceKey
}

// True when the key's path component is `name` — the vessel display-name
// leaf — regardless of source suffix. Allocation-free so the per-delta
// updatePath store action can call it for every incoming value.
export function isNameKey(path$SourceKey: string): boolean {
  return path$SourceKey === 'name' || path$SourceKey.startsWith('name$')
}

// Resolve a vessel's display name from its stored context data. The
// `name` leaf arrives flattened under the empty-path object and is
// keyed per source as `name$<source>`, so a bare `['name']` lookup
// never matches — scan for a key whose path is `name`. Keep scanning
// past a non-string value so a malformed entry from one source doesn't
// hide a valid name reported by another.
export function findContextName(
  contextData: Record<string, { value?: unknown }> | undefined
): string | undefined {
  if (!contextData) return undefined
  for (const key of Object.keys(contextData)) {
    if (getPathFromKey(key) === 'name') {
      const value = contextData[key]?.value
      if (typeof value === 'string') return value
    }
  }
  return undefined
}
