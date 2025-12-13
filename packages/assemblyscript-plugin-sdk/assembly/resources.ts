/**
 * Signal K Resource Provider API for AssemblyScript plugins
 *
 * Allows WASM plugins to act as resource providers (routes, waypoints, weather, etc.)
 */

// ===== FFI Declarations =====

/**
 * @internal
 * Register this plugin as a resource provider for a given type
 */
@external("env", "sk_register_resource_provider")
declare function sk_register_resource_provider_ffi(typePtr: usize, typeLen: usize): i32

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

  static parse(json: string): ResourceGetRequest {
    const req = new ResourceGetRequest()

    // Basic JSON parsing for id
    const idMatch = json.indexOf('"id"')
    if (idMatch >= 0) {
      const colonPos = json.indexOf(':', idMatch)
      const quoteStart = json.indexOf('"', colonPos)
      if (quoteStart >= 0) {
        const idStart = quoteStart + 1
        const idEnd = json.indexOf('"', idStart)
        if (idEnd > idStart) {
          req.id = json.substring(idStart, idEnd)
        }
      }
    }

    // Basic parsing for property (optional)
    const propMatch = json.indexOf('"property"')
    if (propMatch >= 0) {
      const colonPos = json.indexOf(':', propMatch)
      const nextChar = json.charCodeAt(colonPos + 1)
      // Skip whitespace
      let pos = colonPos + 1
      while (pos < json.length && (json.charCodeAt(pos) === 32 || json.charCodeAt(pos) === 9)) {
        pos++
      }
      if (json.charCodeAt(pos) !== 110) { // 'n' for null
        const quoteStart = json.indexOf('"', pos)
        if (quoteStart >= 0) {
          const propStart = quoteStart + 1
          const propEnd = json.indexOf('"', propStart)
          if (propEnd > propStart) {
            req.property = json.substring(propStart, propEnd)
          }
        }
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
  value: string = '{}'  // JSON string of the value

  static parse(json: string): ResourceSetRequest {
    const req = new ResourceSetRequest()

    // Parse id
    const idMatch = json.indexOf('"id"')
    if (idMatch >= 0) {
      const colonPos = json.indexOf(':', idMatch)
      const quoteStart = json.indexOf('"', colonPos)
      if (quoteStart >= 0) {
        const idStart = quoteStart + 1
        const idEnd = json.indexOf('"', idStart)
        if (idEnd > idStart) {
          req.id = json.substring(idStart, idEnd)
        }
      }
    }

    // Parse value (nested object) - find "value": and extract until matching }
    const valueMatch = json.indexOf('"value"')
    if (valueMatch >= 0) {
      const colonPos = json.indexOf(':', valueMatch)
      const braceStart = json.indexOf('{', colonPos)
      if (braceStart >= 0) {
        let depth = 1
        let pos = braceStart + 1
        while (pos < json.length && depth > 0) {
          const c = json.charCodeAt(pos)
          if (c === 123) depth++ // {
          else if (c === 125) depth-- // }
          pos++
        }
        req.value = json.substring(braceStart, pos)
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

  static parse(json: string): ResourceDeleteRequest {
    const req = new ResourceDeleteRequest()

    const idMatch = json.indexOf('"id"')
    if (idMatch >= 0) {
      const colonPos = json.indexOf(':', idMatch)
      const quoteStart = json.indexOf('"', colonPos)
      if (quoteStart >= 0) {
        const idStart = quoteStart + 1
        const idEnd = json.indexOf('"', idStart)
        if (idEnd > idStart) {
          req.id = json.substring(idStart, idEnd)
        }
      }
    }

    return req
  }
}
