/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Binary Stream FFI Bindings
 *
 * Provides FFI bindings for WASM plugins to emit binary data streams
 * to connected WebSocket clients.
 */

import Debug from 'debug'

const debug = Debug('signalk:wasm:binary-stream')

/**
 * Helper to read binary data from WASM memory
 */
export function createBinaryDataReader(memoryRef: {
  current: WebAssembly.Memory | null
}) {
  return (ptr: number, len: number): Buffer => {
    if (!memoryRef.current) {
      throw new Error('WASM memory not initialized')
    }
    const bytes = new Uint8Array(memoryRef.current.buffer, ptr, len)
    return Buffer.from(bytes)
  }
}

/**
 * Create the sk_emit_binary_stream host binding
 *
 * WASM plugins call this to push binary data to stream subscribers.
 * Stream IDs should be scoped: "plugins/{pluginId}/{streamName}" or "radars/{radarId}"
 *
 * @param pluginId - Plugin identifier
 * @param app - SignalK application instance
 * @param readUtf8String - Function to read UTF-8 strings from WASM memory
 * @param readBinaryData - Function to read binary data from WASM memory
 * @returns FFI binding function
 */
export function createBinaryStreamBinding(
  pluginId: string,
  app: any,
  readUtf8String: (ptr: number, len: number) => string,
  readBinaryData: (ptr: number, len: number) => Buffer
): (
  streamIdPtr: number,
  streamIdLen: number,
  dataPtr: number,
  dataLen: number
) => number {
  return (
    streamIdPtr: number,
    streamIdLen: number,
    dataPtr: number,
    dataLen: number
  ): number => {
    try {
      // Extract stream ID and data from WASM memory
      const streamId = readUtf8String(streamIdPtr, streamIdLen)
      const data = readBinaryData(dataPtr, dataLen)

      debug(
        `[${pluginId}] sk_emit_binary_stream: streamId="${streamId}", ` +
          `dataLen=${dataLen} bytes`
      )

      // Validate stream ID format
      // Allow:
      // - "radars/{radarId}" (for radar providers)
      // - "plugins/{pluginId}/{streamName}" (for custom streams)
      const validRadarStream = /^radars\/[a-zA-Z0-9_-]+$/.test(streamId)
      const validPluginStream = streamId.startsWith(`plugins/${pluginId}/`)

      if (!validRadarStream && !validPluginStream) {
        debug(
          `[${pluginId}] Invalid stream ID: "${streamId}". ` +
            `Expected "radars/{radarId}" or "plugins/${pluginId}/{streamName}"`
        )
        return 0 // Failure
      }

      // Push to stream manager
      if (app && app.binaryStreamManager) {
        app.binaryStreamManager.emitData(streamId, data)
        return 1 // Success
      } else {
        debug(`[${pluginId}] Binary stream manager not available`)
        return 0 // Failure
      }
    } catch (error) {
      debug(`[${pluginId}] sk_emit_binary_stream error: ${error}`)
      return 0 // Failure
    }
  }
}
