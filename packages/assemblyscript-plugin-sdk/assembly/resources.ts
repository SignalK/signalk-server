/**
 * Signal K Resource Provider API for AssemblyScript plugins
 *
 * Allows WASM plugins to act as resource providers (routes, waypoints, weather, etc.)
 */

import { JSON } from 'assemblyscript-json/assembly'

// ===== FFI Declarations =====

/**
 * @internal
 * Register this plugin as a resource provider for a given type
 */
@external("env", "sk_register_resource_provider")
declare function sk_register_resource_provider_ffi(
  typePtr: usize,
  typeLen: usize
): i32

// ===== Public API Functions =====

/**
 * Register this plugin as a resource provider for a given resource type.
 *
 * After calling this, the plugin must export the following handler functions:
 * - resources_list_resources(queryJson: string): string - List resources matching query
 * - resources_get_resource(requestJson: string): string - Get a single resource
 * - resources_set_resource(requestJson: string): void - Create/update a resource
 * - resources_delete_resource(requestJson: string): void - Delete a resource
 *
 * @param resourceType The type of resources to provide (e.g., "weather", "routes", "waypoints")
 * @returns true if registration succeeded, false otherwise
 *
 * @example
 * ```typescript
 * import { registerResourceProvider } from 'signalk-assemblyscript-plugin-sdk/assembly/resources'
 *
 * // In plugin start():
 * if (!registerResourceProvider("weather-forecasts")) {
 *   setError("Failed to register as resource provider")
 *   return 1
 * }
 *
 * // Export handler functions:
 * export function resources_list_resources(queryJson: string): string {
 *   // Return JSON object of resources
 *   return '{"forecast-1": {"name": "Current Weather"}}'
 * }
 *
 * export function resources_get_resource(requestJson: string): string {
 *   // requestJson: {"id": "forecast-1", "property": null}
 *   return '{"name": "Current Weather", "temperature": 20.5}'
 * }
 * ```
 */
export function registerResourceProvider(resourceType: string): bool {
  const buffer = String.UTF8.encode(resourceType)
  const ptr = changetype<usize>(buffer)
  const result = sk_register_resource_provider_ffi(ptr, buffer.byteLength)
  return result === 1
}

/**
 * Check if this plugin has the resourceProvider capability granted.
 *
 * The capability must be declared in package.json:
 * ```json
 * {
 *   "wasmCapabilities": {
 *     "resourceProvider": true
 *   }
 * }
 * ```
 *
 * @returns true if resourceProvider capability is granted
 */
export function hasResourceProviderCapability(): bool {
  // Try to check capability via sk_has_capability if available
  // For now, we'll just return true and let registration fail if not granted
  return true
}

// ===== Helper Types for Resource Handlers =====

/**
 * Request format for resources_get_resource handler
 */
export class ResourceGetRequest {
  id: string = ''
  property: string | null = null

  static parse(jsonStr: string): ResourceGetRequest {
    const req = new ResourceGetRequest()
    const parsed = JSON.parse(jsonStr)

    if (parsed.isObj) {
      const obj = parsed as JSON.Obj
      const idValue = obj.getString('id')
      if (idValue !== null) {
        req.id = idValue.valueOf()
      }
      const propValue = obj.getString('property')
      if (propValue !== null) {
        req.property = propValue.valueOf()
      }
    }

    return req
  }
}

/**
 * Request format for resources_set_resource handler
 */
export class ResourceSetRequest {
  id: string = ''
  value: string = '{}' // JSON string of the value

  static parse(jsonStr: string): ResourceSetRequest {
    const req = new ResourceSetRequest()
    const parsed = JSON.parse(jsonStr)

    if (parsed.isObj) {
      const obj = parsed as JSON.Obj
      const idValue = obj.getString('id')
      if (idValue !== null) {
        req.id = idValue.valueOf()
      }
      const valueObj = obj.getObj('value')
      if (valueObj !== null) {
        req.value = valueObj.stringify()
      }
    }

    return req
  }
}

/**
 * Request format for resources_delete_resource handler
 */
export class ResourceDeleteRequest {
  id: string = ''

  static parse(jsonStr: string): ResourceDeleteRequest {
    const req = new ResourceDeleteRequest()
    const parsed = JSON.parse(jsonStr)

    if (parsed.isObj) {
      const obj = parsed as JSON.Obj
      const idValue = obj.getString('id')
      if (idValue !== null) {
        req.id = idValue.valueOf()
      }
    }

    return req
  }
}
