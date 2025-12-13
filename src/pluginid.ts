/**
 * Derives a plugin ID from an npm package name.
 *
 * The npm package name is used as the canonical plugin identifier,
 * with minimal transformation for filesystem safety:
 * - @ is replaced with _
 * - / is replaced with _
 *
 * Examples:
 * - "@signalk/example-weather-plugin" → "_signalk_example-weather-plugin"
 * - "my-simple-plugin" → "my-simple-plugin" (unchanged)
 *
 * This ensures:
 * - Unique plugin IDs (npm guarantees package name uniqueness)
 * - No discrepancies between package name and plugin ID
 * - Filesystem-safe identifiers for config files
 */
export function derivePluginId(packageName: string): string {
  return packageName.replace(/@/g, '_').replace(/\//g, '_')
}
