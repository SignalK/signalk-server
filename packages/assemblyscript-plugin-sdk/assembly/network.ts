/**
 * Network API for AssemblyScript plugins
 *
 * Provides capability checking for network access
 * Requires 'network' capability in plugin manifest
 *
 * For HTTP requests, use as-fetch directly:
 *
 * @example
 * ```typescript
 * import { fetchSync } from 'as-fetch/sync'
 * import { Response } from 'as-fetch/assembly'
 * import { hasNetworkCapability } from 'signalk-assemblyscript-plugin-sdk'
 *
 * if (!hasNetworkCapability()) {
 *   setError('Network capability not granted')
 *   return 1
 * }
 *
 * const response = fetchSync('https://api.example.com/data')
 * if (response && response.status === 200) {
 *   const data = response.text()
 *   // Process data...
 * }
 * ```
 */

/**
 * @internal
 * Check if network capability is granted
 */
@external("env", "sk_has_capability")
declare function sk_has_capability_ffi(capPtr: usize, capLen: usize): i32

/**
 * Check if network capability is available
 *
 * @returns true if plugin has network capability
 *
 * @example
 * ```typescript
 * if (!hasNetworkCapability()) {
 *   setError('Network capability not granted')
 *   return 1
 * }
 * ```
 */
export function hasNetworkCapability(): boolean {
  const capName = 'network'
  const buffer = String.UTF8.encode(capName)
  const ptr = changetype<usize>(buffer)
  return sk_has_capability_ffi(ptr, buffer.byteLength) === 1
}
