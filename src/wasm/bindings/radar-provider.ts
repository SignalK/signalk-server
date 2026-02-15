/**
 * WASM Radar Provider Support
 *
 * Handles radar provider registration and handler invocation for WASM plugins.
 * Integrates with Signal K's Radar API at /signalk/v2/api/vessels/self/radars
 */

import Debug from 'debug'
import {
  WasmRadarProvider,
  WasmPluginInstance,
  WasmCapabilities,
  SignalKApp,
  WasmRawExports
} from '../types'

const debug = Debug('signalk:wasm:radar-provider')

/**
 * Registered radar providers from WASM plugins
 * Key: pluginId
 */
export const wasmRadarProviders: Map<string, WasmRadarProvider> = new Map()

/**
 * Call a WASM radar handler function
 * Handles both AssemblyScript and Rust plugins with Asyncify support for async operations
 */
export async function callWasmRadarHandler(
  pluginInstance: WasmPluginInstance,
  handlerName: string,
  requestJson: string
): Promise<string | null> {
  try {
    const asLoader = pluginInstance.asLoader
    // Use raw instance exports for calling handlers
    const rawExports = pluginInstance.instance?.exports as
      | (WasmRawExports & WebAssembly.Exports)
      | undefined

    // Debug: list available exports when handler is not found
    if (rawExports) {
      const exportNames = Object.keys(rawExports).filter((k) =>
        k.startsWith('radar_')
      )
      debug(
        `[${pluginInstance.pluginId}] Looking for ${handlerName}, available radar_ exports: ${exportNames.join(', ')}`
      )
    } else {
      debug(`[${pluginInstance.pluginId}] No rawExports available`)
    }

    if (asLoader && typeof asLoader.exports[handlerName] === 'function') {
      // AssemblyScript: allocate string in WASM memory, pass pointer, get string pointer back
      // Need to handle Asyncify for handlers that call fetchSync
      const requestPtr = asLoader.exports.__newString(requestJson)

      // Get the handler function with proper typing
      const handlerFn = asLoader.exports[handlerName] as (ptr: number) => number

      // Set up Asyncify resume handling
      let resumePromiseResolve: ((result: string | null) => void) | null = null
      const resumePromise = new Promise<string | null>((resolve) => {
        resumePromiseResolve = resolve
      })

      // Store the result pointer from the handler call
      let handlerResultPtr: number = 0

      if (pluginInstance.setAsyncifyResume) {
        pluginInstance.setAsyncifyResume(() => {
          debug(`Re-calling ${handlerName} to resume from rewind state`)
          const resumeResultPtr = handlerFn(requestPtr)
          const result = asLoader.exports.__getString(resumeResultPtr)
          if (resumePromiseResolve) {
            resumePromiseResolve(result)
          }
          return resumeResultPtr
        })
      }

      // Call the handler
      handlerResultPtr = handlerFn(requestPtr)

      // Check if we're in Asyncify unwind state
      if (typeof asLoader.exports.asyncify_get_state === 'function') {
        const state = asLoader.exports.asyncify_get_state()
        debug(`Asyncify state after ${handlerName}: ${state}`)

        if (state === 1) {
          // State 1 = unwound, waiting for async operation
          debug(
            `${handlerName} is in unwound state - waiting for async operation to complete`
          )
          const result = await resumePromise
          debug(`${handlerName} async operation completed`)
          if (pluginInstance.setAsyncifyResume) {
            pluginInstance.setAsyncifyResume(null)
          }
          return result
        } else {
          // Not in async state, clean up
          if (pluginInstance.setAsyncifyResume) {
            pluginInstance.setAsyncifyResume(null)
          }
        }
      }

      // Normal synchronous return
      return asLoader.exports.__getString(handlerResultPtr)
    } else if (rawExports && typeof rawExports[handlerName] === 'function') {
      // Rust: buffer-based string passing
      if (typeof rawExports.allocate !== 'function') {
        debug(`Plugin ${pluginInstance.pluginId} missing allocate export`)
        return null
      }

      const responseMaxLen = 65536 // 64KB response buffer
      const responsePtr = rawExports.allocate(responseMaxLen)
      const memory = rawExports.memory as WebAssembly.Memory

      let writtenLen: number

      // radar_get_radars takes only output buffer params: (output_ptr, output_len) -> written_len
      if (handlerName === 'radar_get_radars') {
        writtenLen = rawExports[handlerName](responsePtr, responseMaxLen)
      } else {
        // Other handlers take request + output: (request_ptr, request_len, response_ptr, response_max_len) -> written_len
        const requestBytes = Buffer.from(requestJson, 'utf8')
        const requestPtr = rawExports.allocate(requestBytes.length)

        // Write request to WASM memory
        const memView = new Uint8Array(memory.buffer)
        memView.set(requestBytes, requestPtr)

        writtenLen = rawExports[handlerName](
          requestPtr,
          requestBytes.length,
          responsePtr,
          responseMaxLen
        )

        // Deallocate request buffer
        if (typeof rawExports.deallocate === 'function') {
          rawExports.deallocate(requestPtr, requestBytes.length)
        }
      }

      // Read response from WASM memory
      const responseBytes = new Uint8Array(
        memory.buffer,
        responsePtr,
        writtenLen
      )
      const responseJson = new TextDecoder('utf-8').decode(responseBytes)

      // Deallocate response buffer
      if (typeof rawExports.deallocate === 'function') {
        rawExports.deallocate(responsePtr, responseMaxLen)
      }

      return responseJson
    }

    debug(
      `Handler ${handlerName} not found in plugin ${pluginInstance.pluginId}`
    )
    return null
  } catch (error) {
    debug(`Error calling radar handler ${handlerName}: ${error}`)
    return null
  }
}

/**
 * Update radar provider references with a newly loaded plugin instance
 */
export function updateRadarProviderInstance(
  pluginId: string,
  pluginInstance: WasmPluginInstance
): void {
  const provider = wasmRadarProviders.get(pluginId)
  if (provider) {
    provider.pluginInstance = pluginInstance
    debug(`Updated radar provider ${pluginId} with plugin instance`)
  }
}

/**
 * Clean up radar provider registrations for a plugin
 * @param pluginId The plugin ID
 * @param app The Signal K app (optional, if provided will also unregister from RadarApi)
 */
export function cleanupRadarProviders(
  pluginId: string,
  app?: SignalKApp
): void {
  if (wasmRadarProviders.has(pluginId)) {
    debug(`Removing radar provider registration: ${pluginId}`)
    wasmRadarProviders.delete(pluginId)
  }

  // Also unregister from Signal K RadarApi
  if (app && app.radarApi && typeof app.radarApi.unRegister === 'function') {
    try {
      app.radarApi.unRegister(pluginId)
      debug(`Unregistered ${pluginId} from RadarApi`)
    } catch (error) {
      debug(`Error unregistering from RadarApi: ${error}`)
    }
  }
}

/**
 * Create the sk_register_radar_provider host binding
 *
 * WASM plugins call this to register as a radar provider.
 * The plugin must export handler functions:
 * - radar_get_radars() -> JSON array of radar IDs
 * - radar_get_radar_info(requestJson) -> RadarInfo JSON
 * - radar_set_power(requestJson) -> boolean success
 * - radar_set_range(requestJson) -> boolean success
 * - radar_set_gain(requestJson) -> boolean success
 * - radar_set_controls(requestJson) -> boolean success
 */
export function createRadarProviderBinding(
  pluginId: string,
  capabilities: Pick<WasmCapabilities, 'radarProvider'>,
  app: SignalKApp | undefined,
  readUtf8String: (ptr: number, len: number) => string
): (namePtr: number, nameLen: number) => number {
  return (namePtr: number, nameLen: number): number => {
    try {
      const providerName = readUtf8String(namePtr, nameLen)
      debug(`[${pluginId}] Registering as radar provider: ${providerName}`)

      // Check if plugin has radarProvider capability
      if (!capabilities.radarProvider) {
        debug(`[${pluginId}] radarProvider capability not granted`)
        return 0 // Failure
      }

      // Check if app and radarApi are available
      if (!app || !app.radarApi) {
        debug(`[${pluginId}] app.radarApi not available`)
        return 0
      }

      // Store the registration (we'll update the pluginInstance reference after instance creation)
      wasmRadarProviders.set(pluginId, {
        pluginId,
        providerName,
        pluginInstance: null // Will be set after full instance creation
      })

      // Create RadarProvider object that calls into WASM handlers
      const radarProvider = {
        name: providerName,
        methods: {
          pluginId: pluginId,

          /**
           * Get list of radar IDs this provider manages
           */
          getRadars: async (): Promise<string[]> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return []
            }

            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_get_radars',
              '{}'
            )

            if (result) {
              try {
                return JSON.parse(result)
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_get_radars response: ${e}`
                )
                return []
              }
            }
            return []
          },

          /**
           * Get radar info for a specific radar
           * @param radarId The radar ID
           */
          getRadarInfo: async (radarId: string): Promise<unknown> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return null
            }

            const requestJson = JSON.stringify({ radarId })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_get_radar_info',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result)
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_get_radar_info response: ${e}`
                )
                return null
              }
            }
            return null
          },

          /**
           * Set radar power state
           * @param radarId The radar ID
           * @param state Power state
           */
          setPower: async (
            radarId: string,
            state: string
          ): Promise<boolean> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return false
            }

            const requestJson = JSON.stringify({ radarId, state })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_set_power',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result) === true
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_set_power response: ${e}`
                )
                return false
              }
            }
            return false
          },

          /**
           * Set radar range
           * @param radarId The radar ID
           * @param range Range in meters
           */
          setRange: async (
            radarId: string,
            range: number
          ): Promise<boolean> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return false
            }

            const requestJson = JSON.stringify({ radarId, range })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_set_range',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result) === true
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_set_range response: ${e}`
                )
                return false
              }
            }
            return false
          },

          /**
           * Set radar gain
           * @param radarId The radar ID
           * @param gain Gain settings
           */
          setGain: async (
            radarId: string,
            gain: { auto: boolean; value?: number }
          ): Promise<boolean> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return false
            }

            const requestJson = JSON.stringify({ radarId, gain })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_set_gain',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result) === true
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_set_gain response: ${e}`
                )
                return false
              }
            }
            return false
          },

          /**
           * Set radar sea clutter
           * @param radarId The radar ID
           * @param sea Sea clutter settings
           */
          setSea: async (
            radarId: string,
            sea: { auto: boolean; value?: number }
          ): Promise<boolean> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return false
            }

            const requestJson = JSON.stringify({ radarId, sea })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_set_sea',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result) === true
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_set_sea response: ${e}`
                )
                return false
              }
            }
            return false
          },

          /**
           * Set radar rain clutter
           * @param radarId The radar ID
           * @param rain Rain clutter settings
           */
          setRain: async (
            radarId: string,
            rain: { auto: boolean; value?: number }
          ): Promise<boolean> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return false
            }

            const requestJson = JSON.stringify({ radarId, rain })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_set_rain',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result) === true
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_set_rain response: ${e}`
                )
                return false
              }
            }
            return false
          },

          /**
           * Set multiple radar controls at once
           * @param radarId The radar ID
           * @param controls Controls to update
           */
          setControls: async (
            radarId: string,
            controls: Record<string, unknown>
          ): Promise<boolean> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return false
            }

            const requestJson = JSON.stringify({ radarId, controls })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_set_controls',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result) === true
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_set_controls response: ${e}`
                )
                return false
              }
            }
            return false
          },

          /**
           * Get capability manifest for a radar
           * @param radarId The radar ID
           */
          getCapabilities: async (radarId: string): Promise<unknown> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return null
            }

            const requestJson = JSON.stringify({ radarId })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_get_capabilities',
              requestJson
            )

            if (result) {
              try {
                const parsed = JSON.parse(result)
                if (parsed.error) {
                  debug(
                    `[${pluginId}] radar_get_capabilities error: ${parsed.error}`
                  )
                  return null
                }
                return parsed
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_get_capabilities response: ${e}`
                )
                return null
              }
            }
            return null
          },

          /**
           * Get current state
           * @param radarId The radar ID
           */
          getState: async (radarId: string): Promise<unknown> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return null
            }

            const requestJson = JSON.stringify({ radarId })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_get_state',
              requestJson
            )

            if (result) {
              try {
                const parsed = JSON.parse(result)
                if (parsed.error) {
                  debug(`[${pluginId}] radar_get_state error: ${parsed.error}`)
                  return null
                }
                return parsed
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_get_state response: ${e}`
                )
                return null
              }
            }
            return null
          },

          /**
           * Get a single control value
           * @param radarId The radar ID
           * @param controlId The control ID
           */
          getControl: async (
            radarId: string,
            controlId: string
          ): Promise<unknown> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return null
            }

            const requestJson = JSON.stringify({ radarId, controlId })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_get_control',
              requestJson
            )

            if (result) {
              try {
                const parsed = JSON.parse(result)
                if (parsed.error) {
                  debug(
                    `[${pluginId}] radar_get_control error: ${parsed.error}`
                  )
                  return null
                }
                return parsed
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_get_control response: ${e}`
                )
                return null
              }
            }
            return null
          },

          /**
           * Set a single control value
           * @param radarId The radar ID
           * @param controlId The control ID
           * @param value The value to set
           */
          setControl: async (
            radarId: string,
            controlId: string,
            value: unknown
          ): Promise<{ success: boolean; error?: string }> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return { success: false, error: 'Provider not ready' }
            }

            const requestJson = JSON.stringify({ radarId, controlId, value })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_set_control',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result)
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_set_control response: ${e}`
                )
                return { success: false, error: 'Invalid response' }
              }
            }
            return { success: false, error: 'No response' }
          },

          // ============================================
          // ARPA Target Methods
          // ============================================

          /**
           * Get all tracked ARPA targets
           * @param radarId The radar ID
           */
          getTargets: async (radarId: string): Promise<unknown> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return null
            }

            const requestJson = JSON.stringify({ radarId })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_get_targets',
              requestJson
            )

            if (result) {
              try {
                const parsed = JSON.parse(result)
                if (parsed.error) {
                  debug(
                    `[${pluginId}] radar_get_targets error: ${parsed.error}`
                  )
                  return null
                }
                return parsed
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_get_targets response: ${e}`
                )
                return null
              }
            }
            return null
          },

          /**
           * Manually acquire a target at the specified position
           * @param radarId The radar ID
           * @param bearing Bearing in degrees
           * @param distance Distance in meters
           */
          acquireTarget: async (
            radarId: string,
            bearing: number,
            distance: number
          ): Promise<{
            success: boolean
            targetId?: number
            error?: string
          }> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return { success: false, error: 'Provider not ready' }
            }

            const requestJson = JSON.stringify({ radarId, bearing, distance })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_acquire_target',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result)
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_acquire_target response: ${e}`
                )
                return { success: false, error: 'Invalid response' }
              }
            }
            return { success: false, error: 'No response' }
          },

          /**
           * Cancel tracking of a target
           * @param radarId The radar ID
           * @param targetId The target ID to cancel
           */
          cancelTarget: async (
            radarId: string,
            targetId: number
          ): Promise<boolean> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return false
            }

            const requestJson = JSON.stringify({ radarId, targetId })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_cancel_target',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result) === true
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_cancel_target response: ${e}`
                )
                return false
              }
            }
            return false
          },

          /**
           * Get ARPA settings
           * @param radarId The radar ID
           */
          getArpaSettings: async (radarId: string): Promise<unknown> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return null
            }

            const requestJson = JSON.stringify({ radarId })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_get_arpa_settings',
              requestJson
            )

            if (result) {
              try {
                const parsed = JSON.parse(result)
                if (parsed.error) {
                  debug(
                    `[${pluginId}] radar_get_arpa_settings error: ${parsed.error}`
                  )
                  return null
                }
                return parsed
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_get_arpa_settings response: ${e}`
                )
                return null
              }
            }
            return null
          },

          /**
           * Update ARPA settings
           * @param radarId The radar ID
           * @param settings Partial settings to update
           */
          setArpaSettings: async (
            radarId: string,
            settings: Record<string, unknown>
          ): Promise<{ success: boolean; error?: string }> => {
            const provider = wasmRadarProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Radar provider instance not ready`)
              return { success: false, error: 'Provider not ready' }
            }

            const requestJson = JSON.stringify({ radarId, settings })
            const result = await callWasmRadarHandler(
              provider.pluginInstance,
              'radar_set_arpa_settings',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result)
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse radar_set_arpa_settings response: ${e}`
                )
                return { success: false, error: 'Invalid response' }
              }
            }
            return { success: false, error: 'No response' }
          }
        }
      }

      // Register with Signal K RadarApi
      app.radarApi.register(pluginId, radarProvider)

      debug(
        `[${pluginId}] Successfully registered as radar provider: ${providerName}`
      )
      return 1 // Success
    } catch (error) {
      debug(`Plugin register radar provider error: ${error}`)
      return 0
    }
  }
}

/**
 * Create the sk_radar_emit_spokes host binding
 *
 * Convenience wrapper for radar plugins to emit binary spoke data.
 * Maps to sk_emit_binary_stream with "radars/{radarId}" stream ID format.
 *
 * @param pluginId - Plugin identifier
 * @param capabilities - Plugin capabilities
 * @param app - SignalK application instance
 * @param readUtf8String - Function to read UTF-8 strings from WASM memory
 * @param readBinaryData - Function to read binary data from WASM memory
 * @returns FFI binding function
 */
export function createRadarEmitSpokesBinding(
  pluginId: string,
  capabilities: { radarProvider?: boolean },
  app: SignalKApp | undefined,
  readUtf8String: (ptr: number, len: number) => string,
  readBinaryData: (ptr: number, len: number) => Buffer
): (
  radarIdPtr: number,
  radarIdLen: number,
  spokeDataPtr: number,
  spokeDataLen: number
) => number {
  return (
    radarIdPtr: number,
    radarIdLen: number,
    spokeDataPtr: number,
    spokeDataLen: number
  ): number => {
    try {
      // Check radar provider capability
      if (!capabilities.radarProvider) {
        debug(`[${pluginId}] radarProvider capability not granted`)
        return 0
      }

      // Extract radar ID and spoke data from WASM memory
      const radarId = readUtf8String(radarIdPtr, radarIdLen)
      const spokeData = readBinaryData(spokeDataPtr, spokeDataLen)

      // Only log periodically to avoid flooding logs (every ~1000 calls)
      if (Math.random() < 0.001) {
        debug(
          `[${pluginId}] sk_radar_emit_spokes: radarId="${radarId}", ` +
            `dataLen=${spokeDataLen} bytes`
        )
      }

      // Validate radar belongs to this plugin
      const provider = wasmRadarProviders.get(pluginId)
      if (!provider || !provider.pluginInstance) {
        debug(`[${pluginId}] Radar provider instance not ready`)
        return 0
      }

      // Use general binary stream with radar stream ID format
      const streamId = `radars/${radarId}`
      if (app && app.binaryStreamManager) {
        app.binaryStreamManager.emitData(streamId, spokeData)
        return 1 // Success
      } else {
        debug(`[${pluginId}] Binary stream manager not available`)
        return 0 // Failure
      }
    } catch (error) {
      debug(`[${pluginId}] sk_radar_emit_spokes error: ${error}`)
      return 0 // Failure
    }
  }
}
