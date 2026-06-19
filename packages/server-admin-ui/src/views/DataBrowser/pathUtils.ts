// The same Signal K path can have multiple values from different sources.
// We combine them as "path$source" to create a unique key.

export function getPath$SourceKey(path: string, source?: string): string {
  return `${path}$${source ?? ''}`
}

export function getPathFromKey(path$SourceKey: string): string {
  const idx = path$SourceKey.indexOf('$')
  return idx >= 0 ? path$SourceKey.substring(0, idx) : path$SourceKey
}

// Resolve a vessel's display name from its stored context data. The
// `name` leaf arrives flattened under the empty-path object and is
// keyed per source as `name$<source>`, so a bare `['name']` lookup
// never matches — scan for the first key whose path is `name`.
export function findContextName(
  contextData: Record<string, { value?: unknown }> | undefined
): string | undefined {
  if (!contextData) return undefined
  for (const key of Object.keys(contextData)) {
    if (getPathFromKey(key) === 'name') {
      const value = contextData[key]?.value
      return typeof value === 'string' ? value : undefined
    }
  }
  return undefined
}
