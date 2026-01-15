/**
 * Signal K Server API functions for AssemblyScript plugins
 *
 * These functions provide the FFI bridge to the Signal K server
 */

import { Delta } from './signalk'

// ===== FFI Declarations =====
// These functions are provided by the Signal K server

/**
 * @internal
 * Emit delta to Signal K server
 * @param deltaPtr - Pointer to delta JSON string
 * @param deltaLen - Length of delta JSON string
 * @param version - Signal K version: 0 = v1 (default), 1 = v2
 */
@external("env", "sk_handle_message")
declare function sk_handle_message_ffi(deltaPtr: usize, deltaLen: usize, version: i32): void

/**
 * @internal
 * Set plugin status message
 */
@external("env", "sk_set_status")
declare function sk_set_status_ffi(msgPtr: usize, msgLen: usize): void

/**
 * @internal
 * Set plugin error message
 */
@external("env", "sk_set_error")
declare function sk_set_error_ffi(msgPtr: usize, msgLen: usize): void

/**
 * @internal
 * Debug logging
 */
@external("env", "sk_debug")
declare function sk_debug_ffi(msgPtr: usize, msgLen: usize): void

/**
 * @internal
 * Get value from vessel.self path
 */
@external("env", "sk_get_self_path")
declare function sk_get_self_path_ffi(
  pathPtr: usize,
  pathLen: usize,
  bufPtr: usize,
  bufLen: usize
): i32

/**
 * @internal
 * Get value from any context path
 */
@external("env", "sk_get_path")
declare function sk_get_path_ffi(
  pathPtr: usize,
  pathLen: usize,
  bufPtr: usize,
  bufLen: usize
): i32

/**
 * @internal
 * Read plugin configuration
 */
@external("env", "sk_read_config")
declare function sk_read_config_ffi(bufPtr: usize, bufLen: usize): i32

/**
 * @internal
 * Save plugin configuration
 */
@external("env", "sk_save_config")
declare function sk_save_config_ffi(configPtr: usize, configLen: usize): i32

// ===== Public API Functions =====

/**
 * Signal K version for delta emission
 */
export const SK_VERSION_V1: i32 = 1
export const SK_VERSION_V2: i32 = 2

/**
 * Emit a delta message to the Signal K server
 *
 * @param delta The delta message to emit
 * @param skVersion Signal K version: SK_VERSION_V1 (default) or SK_VERSION_V2
 *
 * Use SK_VERSION_V1 (default) for regular navigation data.
 * Use SK_VERSION_V2 for Course API paths and other v2-specific data to prevent
 * v2 data from being mixed into the v1 full data model.
 *
 * @example
 * ```typescript
 * // Emit v1 delta (default - for regular navigation data)
 * const delta = createSimpleDelta('my-plugin', 'environment.temperature', '25.5')
 * emit(delta)
 *
 * // Emit v2 delta (for Course API and v2-specific paths)
 * const courseDelta = createSimpleDelta('my-plugin', 'navigation.course.nextPoint', positionJson)
 * emit(courseDelta, SK_VERSION_V2)
 * ```
 */
export function emit(delta: Delta, skVersion: i32 = SK_VERSION_V1): void {
  const json = delta.toJSON()
  const buffer = String.UTF8.encode(json)
  const ptr = changetype<usize>(buffer)
  sk_handle_message_ffi(ptr, buffer.byteLength, skVersion)
}

/**
 * Set plugin status message (shown in admin UI)
 *
 * @param message Status message
 *
 * @example
 * ```typescript
 * setStatus('Running normally')
 * ```
 */
export function setStatus(message: string): void {
  const buffer = String.UTF8.encode(message)
  const ptr = changetype<usize>(buffer)
  sk_set_status_ffi(ptr, buffer.byteLength)
}

/**
 * Set plugin error message (shown in admin UI)
 *
 * @param message Error message
 *
 * @example
 * ```typescript
 * setError('Failed to connect to sensor')
 * ```
 */
export function setError(message: string): void {
  const buffer = String.UTF8.encode(message)
  const ptr = changetype<usize>(buffer)
  sk_set_error_ffi(ptr, buffer.byteLength)
}

/**
 * Log debug message to server logs
 *
 * @param message Debug message
 *
 * @example
 * ```typescript
 * debug('Processing data: ' + value.toString())
 * ```
 */
export function debug(message: string): void {
  const buffer = String.UTF8.encode(message)
  const ptr = changetype<usize>(buffer)
  sk_debug_ffi(ptr, buffer.byteLength)
}

/**
 * Get value from vessel.self path
 *
 * @param path Signal K path (e.g., 'navigation.speedOverGround')
 * @returns JSON-encoded value or null if not found
 *
 * @example
 * ```typescript
 * const speedJson = getSelfPath('navigation.speedOverGround')
 * if (speedJson !== null) {
 *   const speed = parseFloat(speedJson)
 *   debug('Current speed: ' + speed.toString())
 * }
 * ```
 */
export function getSelfPath(path: string): string | null {
  const pathBuffer = String.UTF8.encode(path)
  const pathPtr = changetype<usize>(pathBuffer)

  // Allocate buffer for result
  const resultBuffer = new ArrayBuffer(1024)
  const resultPtr = changetype<usize>(resultBuffer)

  const len = sk_get_self_path_ffi(
    pathPtr,
    pathBuffer.byteLength,
    resultPtr,
    1024
  )

  if (len === 0) {
    return null
  }

  // Decode result
  const bytes = Uint8Array.wrap(resultBuffer, 0, len)
  return String.UTF8.decode(bytes.buffer)
}

/**
 * Get value from any context path
 *
 * @param path Full Signal K path (e.g., 'vessels.urn:mrn:imo:mmsi:123456789.navigation.position')
 * @returns JSON-encoded value or null if not found
 *
 * @example
 * ```typescript
 * const posJson = getPath('vessels.self.navigation.position')
 * if (posJson !== null) {
 *   debug('Position: ' + posJson)
 * }
 * ```
 */
export function getPath(path: string): string | null {
  const pathBuffer = String.UTF8.encode(path)
  const pathPtr = changetype<usize>(pathBuffer)

  // Allocate buffer for result
  const resultBuffer = new ArrayBuffer(1024)
  const resultPtr = changetype<usize>(resultBuffer)

  const len = sk_get_path_ffi(
    pathPtr,
    pathBuffer.byteLength,
    resultPtr,
    1024
  )

  if (len === 0) {
    return null
  }

  // Decode result
  const bytes = Uint8Array.wrap(resultBuffer, 0, len)
  return String.UTF8.decode(bytes.buffer)
}

/**
 * Read plugin configuration
 *
 * @returns JSON string with configuration
 *
 * @example
 * ```typescript
 * const configJson = readConfig()
 * const config = JSON.parse<MyConfig>(configJson)
 * ```
 */
export function readConfig(): string {
  // Allocate buffer for result
  const resultBuffer = new ArrayBuffer(4096)
  const resultPtr = changetype<usize>(resultBuffer)

  const len = sk_read_config_ffi(resultPtr, 4096)

  if (len === 0) {
    return '{}'
  }

  // Decode result
  const bytes = Uint8Array.wrap(resultBuffer, 0, len)
  return String.UTF8.decode(bytes.buffer)
}

/**
 * Save plugin configuration
 *
 * @param config Configuration object (will be JSON-serialized)
 * @returns 0 on success, non-zero on error
 *
 * @example
 * ```typescript
 * const result = saveConfig(JSON.stringify(myConfig))
 * if (result !== 0) {
 *   setError('Failed to save configuration')
 * }
 * ```
 */
export function saveConfig(configJson: string): i32 {
  const buffer = String.UTF8.encode(configJson)
  const ptr = changetype<usize>(buffer)
  return sk_save_config_ffi(ptr, buffer.byteLength)
}
