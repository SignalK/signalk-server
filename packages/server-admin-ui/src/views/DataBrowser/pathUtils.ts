// The same Signal K path can have multiple values from different sources.
// We combine them as "path$source" to create a unique key.

export function getPath$SourceKey(path: string, source?: string): string {
  return `${path}$${source ?? ''}`
}

export function getPathFromKey(path$SourceKey: string): string {
  const idx = path$SourceKey.indexOf('$')
  return idx >= 0 ? path$SourceKey.substring(0, idx) : path$SourceKey
}
