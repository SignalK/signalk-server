/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WASM Weather Provider Support
 *
 * Handles weather provider registration and handler invocation for WASM plugins.
 * Integrates with Signal K's Weather API at /signalk/v2/api/weather
 */

import Debug from 'debug'
import { WasmWeatherProvider, WasmPluginInstance } from '../types'

const debug = Debug('signalk:wasm:weather-provider')

/**
 * Registered weather providers from WASM plugins
 * Key: pluginId
 */
export const wasmWeatherProviders: Map<string, WasmWeatherProvider> = new Map()

/**
 * Call a WASM weather handler function
 * Handles both AssemblyScript and Rust plugins with Asyncify support for async operations
 */
export async function callWasmWeatherHandler(
  pluginInstance: WasmPluginInstance,
  handlerName: string,
  requestJson: string
): Promise<string | null> {
  try {
    const asLoader = pluginInstance.asLoader
    const rawExports = pluginInstance.instance?.exports as any

    if (asLoader && typeof asLoader.exports[handlerName] === 'function') {
      // AssemblyScript: allocate string in WASM memory, pass pointer, get string pointer back
      // Need to handle Asyncify for handlers that call fetchSync
      const requestPtr = asLoader.exports.__newString(requestJson)

      // Set up Asyncify resume handling
      let resumePromiseResolve: ((result: string | null) => void) | null = null
      const resumePromise = new Promise<string | null>((resolve) => {
        resumePromiseResolve = resolve
      })

      // Store the result pointer from the handler call
      let handlerResultPtr: any = null

      if (pluginInstance.setAsyncifyResume) {
        pluginInstance.setAsyncifyResume(() => {
          debug(`Re-calling ${handlerName} to resume from rewind state`)
          const resumeResultPtr = asLoader.exports[handlerName](requestPtr)
          const result = asLoader.exports.__getString(resumeResultPtr)
          if (resumePromiseResolve) {
            resumePromiseResolve(result)
          }
          return resumeResultPtr
        })
      }

      // Call the handler
      handlerResultPtr = asLoader.exports[handlerName](requestPtr)

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

      const requestBytes = Buffer.from(requestJson, 'utf8')
      const requestPtr = rawExports.allocate(requestBytes.length)
      const responseMaxLen = 65536 // 64KB response buffer
      const responsePtr = rawExports.allocate(responseMaxLen)

      // Write request to WASM memory
      const memory = rawExports.memory as WebAssembly.Memory
      const memView = new Uint8Array(memory.buffer)
      memView.set(requestBytes, requestPtr)

      // Call handler: (request_ptr, request_len, response_ptr, response_max_len) -> written_len
      const writtenLen = rawExports[handlerName](
        requestPtr,
        requestBytes.length,
        responsePtr,
        responseMaxLen
      )

      // Read response from WASM memory
      const responseBytes = new Uint8Array(
        memory.buffer,
        responsePtr,
        writtenLen
      )
      const responseJson = new TextDecoder('utf-8').decode(responseBytes)

      // Deallocate buffers
      if (typeof rawExports.deallocate === 'function') {
        rawExports.deallocate(requestPtr, requestBytes.length)
        rawExports.deallocate(responsePtr, responseMaxLen)
      }

      return responseJson
    }

    debug(
      `Handler ${handlerName} not found in plugin ${pluginInstance.pluginId}`
    )
    return null
  } catch (error) {
    debug(`Error calling weather handler ${handlerName}: ${error}`)
    return null
  }
}

/**
 * Update weather provider references with a newly loaded plugin instance
 */
export function updateWeatherProviderInstance(
  pluginId: string,
  pluginInstance: WasmPluginInstance
): void {
  const provider = wasmWeatherProviders.get(pluginId)
  if (provider) {
    provider.pluginInstance = pluginInstance
    debug(`Updated weather provider ${pluginId} with plugin instance`)
  }
}

/**
 * Clean up weather provider registrations for a plugin
 * @param pluginId The plugin ID
 * @param app The Signal K app (optional, if provided will also unregister from WeatherApi)
 */
export function cleanupWeatherProviders(pluginId: string, app?: any): void {
  if (wasmWeatherProviders.has(pluginId)) {
    debug(`Removing weather provider registration: ${pluginId}`)
    wasmWeatherProviders.delete(pluginId)
  }

  // Also unregister from Signal K WeatherApi
  if (
    app &&
    app.weatherApi &&
    typeof app.weatherApi.unRegister === 'function'
  ) {
    try {
      app.weatherApi.unRegister(pluginId)
      debug(`Unregistered ${pluginId} from WeatherApi`)
    } catch (error) {
      debug(`Error unregistering from WeatherApi: ${error}`)
    }
  }
}

/**
 * Create the sk_register_weather_provider host binding
 *
 * WASM plugins call this to register as a weather provider.
 * The plugin must export handler functions:
 * - weather_get_observations(requestJson) -> responseJson
 * - weather_get_forecasts(requestJson) -> responseJson
 * - weather_get_warnings(requestJson) -> responseJson
 */
export function createWeatherProviderBinding(
  pluginId: string,
  capabilities: { weatherProvider?: boolean },
  app: any,
  readUtf8String: (ptr: number, len: number) => string
): (namePtr: number, nameLen: number) => number {
  return (namePtr: number, nameLen: number): number => {
    try {
      const providerName = readUtf8String(namePtr, nameLen)
      debug(`[${pluginId}] Registering as weather provider: ${providerName}`)

      // Check if plugin has weatherProvider capability
      if (!capabilities.weatherProvider) {
        debug(`[${pluginId}] weatherProvider capability not granted`)
        return 0 // Failure
      }

      // Check if app and weatherApi are available
      if (!app || !app.weatherApi) {
        debug(`[${pluginId}] app.weatherApi not available`)
        return 0
      }

      // Store the registration (we'll update the pluginInstance reference after instance creation)
      wasmWeatherProviders.set(pluginId, {
        pluginId,
        providerName,
        pluginInstance: null // Will be set after full instance creation
      })

      // Create WeatherProvider object that calls into WASM handlers
      const weatherProvider = {
        name: providerName,
        methods: {
          pluginId: pluginId,

          /**
           * Get weather observations for a position
           * @param position {latitude, longitude}
           * @param options {maxCount?, startDate?, custom?}
           */
          getObservations: async (
            position: { latitude: number; longitude: number },
            options?: any
          ): Promise<any[]> => {
            const provider = wasmWeatherProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Weather provider instance not ready`)
              return []
            }

            const requestJson = JSON.stringify({ position, options })
            const result = await callWasmWeatherHandler(
              provider.pluginInstance,
              'weather_get_observations',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result)
              } catch (e) {
                debug(
                  `[${pluginId}] Failed to parse observations response: ${e}`
                )
                return []
              }
            }
            return []
          },

          /**
           * Get weather forecasts for a position
           * @param position {latitude, longitude}
           * @param type 'daily' | 'point'
           * @param options {maxCount?, startDate?, custom?}
           */
          getForecasts: async (
            position: { latitude: number; longitude: number },
            type: 'daily' | 'point',
            options?: any
          ): Promise<any[]> => {
            const provider = wasmWeatherProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Weather provider instance not ready`)
              return []
            }

            const requestJson = JSON.stringify({ position, type, options })
            const result = await callWasmWeatherHandler(
              provider.pluginInstance,
              'weather_get_forecasts',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result)
              } catch (e) {
                debug(`[${pluginId}] Failed to parse forecasts response: ${e}`)
                return []
              }
            }
            return []
          },

          /**
           * Get weather warnings for a position
           * @param position {latitude, longitude}
           */
          getWarnings: async (position: {
            latitude: number
            longitude: number
          }): Promise<any[]> => {
            const provider = wasmWeatherProviders.get(pluginId)
            if (!provider || !provider.pluginInstance) {
              debug(`[${pluginId}] Weather provider instance not ready`)
              return []
            }

            const requestJson = JSON.stringify({ position })
            const result = await callWasmWeatherHandler(
              provider.pluginInstance,
              'weather_get_warnings',
              requestJson
            )

            if (result) {
              try {
                return JSON.parse(result)
              } catch (e) {
                debug(`[${pluginId}] Failed to parse warnings response: ${e}`)
                return []
              }
            }
            return []
          }
        }
      }

      // Register with Signal K WeatherApi
      app.weatherApi.register(pluginId, weatherProvider)

      debug(
        `[${pluginId}] Successfully registered as weather provider: ${providerName}`
      )
      return 1 // Success
    } catch (error) {
      debug(`Plugin register weather provider error: ${error}`)
      return 0
    }
  }
}
