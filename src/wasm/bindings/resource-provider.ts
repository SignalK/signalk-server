/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WASM Resource Provider Support
 *
 * Handles resource provider registration and handler invocation for WASM plugins
 */

import Debug from 'debug'
import { WasmResourceProvider, WasmPluginInstance } from '../types'

const debug = Debug('signalk:wasm:resource-provider')

/**
 * Registered resource providers from WASM plugins
 * Key: pluginId:resourceType
 */
export const wasmResourceProviders: Map<string, WasmResourceProvider> =
  new Map()

/**
 * Call a WASM resource handler function
 * Handles both AssemblyScript and Rust plugins
 */
export function callWasmResourceHandler(
  pluginInstance: WasmPluginInstance,
  handlerName: string,
  requestJson: string
): string | null {
  try {
    const asLoader = pluginInstance.asLoader
    const rawExports = pluginInstance.instance?.exports as any

    if (asLoader && typeof asLoader.exports[handlerName] === 'function') {
      // AssemblyScript: allocate string in WASM memory, pass pointer, get string pointer back
      const requestPtr = asLoader.exports.__newString(requestJson)
      const resultPtr = asLoader.exports[handlerName](requestPtr)
      return asLoader.exports.__getString(resultPtr)
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
    debug(`Error calling resource handler ${handlerName}: ${error}`)
    return null
  }
}

/**
 * Update resource provider references with a newly loaded plugin instance
 */
export function updateResourceProviderInstance(
  pluginId: string,
  pluginInstance: WasmPluginInstance
): void {
  if (wasmResourceProviders && wasmResourceProviders.size > 0) {
    wasmResourceProviders.forEach((provider, key) => {
      if (provider.pluginId === pluginId) {
        provider.pluginInstance = pluginInstance
        debug(`Updated resource provider ${key} with plugin instance`)
      }
    })
  }
}

/**
 * Clean up resource provider registrations for a plugin
 * @param pluginId The plugin ID
 * @param app The Signal K app (optional, if provided will also unregister from ResourcesApi)
 */
export function cleanupResourceProviders(pluginId: string, app?: any): void {
  const keysToDelete: string[] = []
  wasmResourceProviders.forEach((provider, key) => {
    if (provider.pluginId === pluginId) {
      keysToDelete.push(key)
    }
  })
  keysToDelete.forEach((key) => {
    debug(`Removing resource provider registration: ${key}`)
    wasmResourceProviders.delete(key)
  })

  // Also unregister from Signal K ResourcesApi
  if (
    app &&
    app.resourcesApi &&
    typeof app.resourcesApi.unRegister === 'function'
  ) {
    try {
      app.resourcesApi.unRegister(pluginId)
      debug(`Unregistered ${pluginId} from ResourcesApi`)
    } catch (error) {
      debug(`Error unregistering from ResourcesApi: ${error}`)
    }
  }
}

/**
 * Create the sk_register_resource_provider host binding
 */
export function createResourceProviderBinding(
  pluginId: string,
  capabilities: { resourceProvider?: boolean },
  app: any,
  readUtf8String: (ptr: number, len: number) => string
): (typePtr: number, typeLen: number) => number {
  return (typePtr: number, typeLen: number): number => {
    try {
      const resourceType = readUtf8String(typePtr, typeLen)
      debug(
        `[${pluginId}] Registering as resource provider for: ${resourceType}`
      )

      // Check if plugin has resourceProvider capability
      if (!capabilities.resourceProvider) {
        debug(`[${pluginId}] resourceProvider capability not granted`)
        return 0 // Failure
      }

      // Check if app and resourcesApi are available
      if (!app || !app.resourcesApi) {
        debug(`[${pluginId}] app.resourcesApi not available`)
        return 0
      }

      // Store the registration (we'll update the pluginInstance reference after instance creation)
      const key = `${pluginId}:${resourceType}`
      wasmResourceProviders.set(key, {
        pluginId,
        resourceType,
        pluginInstance: null // Will be set after full instance creation
      })

      // Create wrapper methods that call into WASM
      // Note: resourceType is captured from closure scope
      const providerMethods = {
        listResources: async (query: {
          [key: string]: any
        }): Promise<{ [id: string]: any }> => {
          const provider = wasmResourceProviders.get(key)
          if (!provider || !provider.pluginInstance) {
            debug(`[${pluginId}] Resource provider instance not ready`)
            return {}
          }

          // Include resourceType so WASM knows which type to list
          const queryJson = JSON.stringify({ ...query, resourceType })
          const result = callWasmResourceHandler(
            provider.pluginInstance,
            'resources_list_resources',
            queryJson
          )
          return result ? JSON.parse(result) : {}
        },
        getResource: async (id: string, property?: string): Promise<object> => {
          const provider = wasmResourceProviders.get(key)
          if (!provider || !provider.pluginInstance) {
            debug(`[${pluginId}] Resource provider instance not ready`)
            return {}
          }

          // Include resourceType so WASM knows which storage to search
          const requestJson = JSON.stringify({ id, property, resourceType })
          const result = callWasmResourceHandler(
            provider.pluginInstance,
            'resources_get_resource',
            requestJson
          )
          return result ? JSON.parse(result) : {}
        },
        setResource: async (
          id: string,
          value: { [key: string]: any }
        ): Promise<void> => {
          const provider = wasmResourceProviders.get(key)
          if (!provider || !provider.pluginInstance) {
            debug(`[${pluginId}] Resource provider instance not ready`)
            return
          }

          // Include resourceType so WASM knows which storage to update
          const requestJson = JSON.stringify({ id, value, resourceType })
          callWasmResourceHandler(
            provider.pluginInstance,
            'resources_set_resource',
            requestJson
          )
        },
        deleteResource: async (id: string): Promise<void> => {
          const provider = wasmResourceProviders.get(key)
          if (!provider || !provider.pluginInstance) {
            debug(`[${pluginId}] Resource provider instance not ready`)
            return
          }

          // Include resourceType so WASM knows which storage to delete from
          const requestJson = JSON.stringify({ id, resourceType })
          callWasmResourceHandler(
            provider.pluginInstance,
            'resources_delete_resource',
            requestJson
          )
        }
      }

      // Register with Signal K ResourcesApi
      app.resourcesApi.register(pluginId, {
        type: resourceType,
        methods: providerMethods
      })

      debug(
        `[${pluginId}] Successfully registered as ${resourceType} resource provider`
      )
      return 1 // Success
    } catch (error) {
      debug(`Plugin register resource provider error: ${error}`)
      return 0
    }
  }
}
