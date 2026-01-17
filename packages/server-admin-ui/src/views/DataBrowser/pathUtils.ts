/**
 * Generate a unique key for a path+source combination.
 * This key uniquely identifies a data value in Signal K where the same path
 * can have multiple values from different sources.
 *
 * @param path - The Signal K path (e.g., "navigation.position")
 * @param source - The $source identifier (e.g., "n2k-01.115")
 * @returns A unique key in format "path$source"
 */
export function getPath$SourceKey(path: string, source?: string): string {
  return `${path}$${source ?? ''}`
}

/**
 * Extract the path from a path$SourceKey.
 *
 * @param path$SourceKey - The combined key (e.g., "navigation.position$n2k-01.115")
 * @returns The path portion (e.g., "navigation.position")
 */
export function getPathFromKey(path$SourceKey: string): string {
  const idx = path$SourceKey.indexOf('$')
  return idx >= 0 ? path$SourceKey.substring(0, idx) : path$SourceKey
}
