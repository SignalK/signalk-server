/**
 * WASM Plugin Types
 *
 * Shared type definitions for WASM plugin system
 */

import { SKVersion, Delta as SignalKDelta } from '@signalk/server-api'
import type { IRouter } from 'express'

// Re-export for convenience
export { SKVersion }

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
  serverEvents?: boolean // Can receive and emit server events
}

/**
 * Delta message for internal WASM use
 */
export interface WasmDelta {
  context?: string
  updates: Array<{
    source?: Record<string, unknown>
    timestamp?: string
    values?: Array<{ path: string; value: unknown }>
    meta?: Array<{ path: string; value: unknown }>
  }>
}

export interface PutHandlerResponse {
  state: 'COMPLETED' | 'PENDING' | 'FAILED'
  statusCode: number
  message?: string
}

export type PutHandlerCallback = (
  context: string,
  path: string,
  value: unknown,
  cb: (result: PutHandlerResponse) => void
) => void

export interface BinaryStreamManager {
  emitData: (streamId: string, data: Buffer) => void
}

/**
 * Resource provider registration interface (subset of full API)
 */
export interface ResourcesApiSubset {
  register: (pluginId: string, provider: unknown) => void
  unRegister: (pluginId: string) => void
}

/**
 * Weather provider registration interface (subset of full API)
 */
export interface WeatherApiSubset {
  register: (pluginId: string, provider: unknown) => void
  unRegister: (pluginId: string) => void
}

/**
 * Radar provider registration interface (subset of full API)
 */
export interface RadarApiSubset {
  register: (pluginId: string, provider: unknown) => void
  unRegister: (pluginId: string) => void
}

export interface WebappMetadata {
  name: string
  location?: string
  version?: string
  description?: string
  keywords?: string[]
  signalk?: Record<string, unknown>
}

export type PluginStatusCallback = (pluginId: string, message: string) => void

/**
 * SignalK App interface - minimal interface for WASM plugin host bindings
 * This represents the subset of the full ServerAPI that WASM plugins interact with
 */
export interface SignalKApp {
  // Data model access
  handleMessage?: (
    pluginId: string,
    delta: WasmDelta | SignalKDelta,
    version?: SKVersion
  ) => void
  getSelfPath?: (path: string) => unknown
  getPath?: (path: string) => unknown

  // Plugin status
  setPluginStatus?: PluginStatusCallback
  setPluginError?: PluginStatusCallback

  // Action handlers (PUT)
  registerActionHandler?: (
    context: string,
    path: string,
    pluginId: string,
    callback: PutHandlerCallback
  ) => void

  // Provider APIs
  resourcesApi?: ResourcesApiSubset
  weatherApi?: WeatherApiSubset
  radarApi?: RadarApiSubset

  // Binary streaming
  binaryStreamManager?: BinaryStreamManager

  // Event emitter
  signalk?: {
    on: (event: string, handler: (delta: SignalKDelta) => void) => void
    removeListener?: (
      event: string,
      handler: (delta: SignalKDelta) => void
    ) => void
  }
  emit?: (event: string, data: unknown) => boolean
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void
  ) => void

  // Configuration
  config?: {
    configPath: string
  }

  // Plugin registry
  plugins?: WasmPluginLike[]
  pluginsMap?: Record<string, WasmPluginLike>

  // Webapps
  webapps?: WebappMetadata[]
  embeddablewebapps?: WebappMetadata[]

  // Express routing
  _router?: IRouter
  // Express use() has multiple overloads - use permissive signature
  use?: (path: string | string[], handler: unknown) => void
}

export interface WasmPluginLike {
  id: string
  name: string
  type?: string
  enabled?: boolean
}

/**
 * Raw WASM module exports - all possible exports from a WASM plugin
 */
export interface WasmRawExports {
  memory: WebAssembly.Memory

  // Memory management (Rust plugins)
  allocate?: (size: number) => number
  deallocate?: (ptr: number, size: number) => void

  // Plugin identity (Rust: buffer-based)
  plugin_id?: (outPtr: number, outLen: number) => number
  plugin_name?: (outPtr: number, outLen: number) => number
  plugin_schema?: (outPtr: number, outLen: number) => number

  // Lifecycle
  plugin_start?: (configPtr: number, configLen: number) => number
  plugin_stop?: () => number

  // HTTP endpoints
  http_endpoints?: (outPtr: number, outLen: number) => number

  // Periodic polling
  poll?: () => number

  // Delta handler
  delta_handler?: (ptr: number, len: number) => void

  // Event handler
  event_handler?: (ptr: number, len: number) => void

  // Index signature for dynamic handler access
  [key: string]: unknown
}

export interface WasiInstance {
  start: (instance: WebAssembly.Instance) => void
  initialize?: (instance: WebAssembly.Instance) => void
  getImportObject: () => Record<string, Record<string, WebAssembly.ImportValue>>
}

export interface AssemblyScriptLoader {
  exports: {
    __newString: (str: string) => number
    __getString: (ptr: number) => string
    [key: string]: unknown
  }
}

/**
 * WASM binary format types
 */
export type WasmFormat = 'wasi-p1' | 'unknown'

/**
 * WASM plugin instance representing a loaded plugin
 */
export interface WasmPluginInstance {
  pluginId: string
  wasmPath: string
  vfsRoot: string
  capabilities: WasmCapabilities
  format: WasmFormat // Binary format: wasi-p1
  wasi: WasiInstance // Node.js WASI instance
  module: WebAssembly.Module
  instance: WebAssembly.Instance
  exports: WasmPluginExports
  // AssemblyScript loader instance (if AssemblyScript plugin)
  asLoader?: AssemblyScriptLoader
  // Asyncify support: function to set the resume callback for async operations
  setAsyncifyResume?: (fn: (() => unknown) | null) => void
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
  // Optional: Receives server events as JSON strings
  // Enables plugins to react to server state changes (connections, statistics, etc.)
  event_handler?: (eventJson: string) => void
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
  app?: SignalKApp
  debug: (...args: unknown[]) => void
}
