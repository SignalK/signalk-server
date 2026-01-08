/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WASM Plugin Types
 *
 * Shared type definitions for WASM plugin system
 */

/**
 * Capabilities that can be granted to WASM plugins
 */
export interface WasmCapabilities {
  network: boolean
  storage: 'vfs-only' | 'none'
  dataRead: boolean
  dataWrite: boolean
  serialPorts: boolean
  putHandlers: boolean
  httpEndpoints?: boolean
  resourceProvider?: boolean // Can register as a resource provider
  weatherProvider?: boolean // Can register as a weather provider
  radarProvider?: boolean // Can register as a radar provider
  rawSockets?: boolean // Can open UDP/TCP sockets for radar, NMEA, etc.
}

/**
 * WASM binary format types
 */
export type WasmFormat = 'wasi-p1' | 'component-model' | 'unknown'

/**
 * WASM plugin instance representing a loaded plugin
 */
export interface WasmPluginInstance {
  pluginId: string
  wasmPath: string
  vfsRoot: string
  capabilities: WasmCapabilities
  format: WasmFormat // Binary format: wasi-p1 or component-model
  wasi: any // WASI type varies between Node.js and @wasmer/wasi
  module: WebAssembly.Module
  instance: WebAssembly.Instance
  exports: WasmPluginExports
  // AssemblyScript loader instance (if AssemblyScript plugin)
  asLoader?: any
  // Component Model transpiled module (if Component Model plugin)
  componentModule?: any
  // Asyncify support: function to set the resume callback for async operations
  setAsyncifyResume?: (fn: (() => any) | null) => void
}

/**
 * Standard exports expected from a WASM plugin
 */
export interface WasmPluginExports {
  id: () => string
  name: () => string
  schema: () => string
  start: (config: string) => number | Promise<number> // 0 = success, non-zero = error (async for Asyncify support)
  stop: () => number
  memory?: WebAssembly.Memory
  // Optional: HTTP endpoint registration
  http_endpoints?: () => string // Returns JSON array of endpoint definitions
  // Optional: Periodic polling - called every second when plugin is running
  // Useful for plugins that need to poll hardware, sockets, or external systems
  // Returns 0 on success, non-zero on error
  poll?: () => number
  // Optional: Delta handler - receives Signal K deltas as JSON strings
  // Enables plugins to react to navigation data changes, course updates, etc.
  delta_handler?: (deltaJson: string) => void
}

/**
 * Resource provider registration from a WASM plugin
 */
export interface WasmResourceProvider {
  pluginId: string
  resourceType: string
  // Reference to the plugin instance for calling handlers
  pluginInstance: WasmPluginInstance | null
}

/**
 * Weather provider registration from a WASM plugin
 */
export interface WasmWeatherProvider {
  pluginId: string
  providerName: string
  // Reference to the plugin instance for calling handlers
  pluginInstance: WasmPluginInstance | null
}

/**
 * Radar provider registration from a WASM plugin
 */
export interface WasmRadarProvider {
  pluginId: string
  providerName: string
  // Reference to the plugin instance for calling handlers
  pluginInstance: WasmPluginInstance | null
}

/**
 * Context passed to loader functions
 */
export interface LoaderContext {
  pluginId: string
  wasmPath: string
  vfsRoot: string
  capabilities: WasmCapabilities
  app?: any
  debug: (...args: any[]) => void
}
