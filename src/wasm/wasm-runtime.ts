/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WASM Runtime Management
 *
 * Handles WASM runtime initialization, module loading,
 * and instance lifecycle management for Signal K WASM plugins.
 *
 * This is the main entry point that coordinates the various loaders
 * and bindings for different WASM plugin formats.
 */

import * as fs from 'fs'
import Debug from 'debug'

// Re-export types for backward compatibility
export {
  WasmCapabilities,
  WasmFormat,
  WasmPluginInstance,
  WasmPluginExports,
  WasmResourceProvider
} from './types'

// Re-export utilities
export { detectWasmFormat } from './utils/format-detection'

// Import loaders
import { loadStandardPlugin } from './loaders/standard-loader'

// Import bindings
import {
  cleanupResourceProviders,
  wasmResourceProviders
} from './bindings/resource-provider'
import {
  cleanupWeatherProviders,
  wasmWeatherProviders
} from './bindings/weather-provider'

// Import utilities
import { detectWasmFormat } from './utils/format-detection'

// Import types
import { WasmPluginInstance, WasmCapabilities } from './types'

const debug = Debug('signalk:wasm:runtime')

// Re-export provider maps for external access
export { wasmResourceProviders, wasmWeatherProviders }

export class WasmRuntime {
  private instances: Map<string, WasmPluginInstance> = new Map()
  private enabled: boolean = true

  constructor() {
    debug('Initializing WASM runtime')
  }

  /**
   * Check if WASM support is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Enable or disable WASM plugin support
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    debug(`WASM support ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Load and instantiate a WASM plugin module
   */
  async loadPlugin(
    pluginId: string,
    wasmPath: string,
    vfsRoot: string,
    capabilities: WasmCapabilities,
    app?: any
  ): Promise<WasmPluginInstance> {
    if (!this.enabled) {
      throw new Error('WASM support is disabled')
    }

    debug(`Loading WASM plugin: ${pluginId} from ${wasmPath}`)

    try {
      // Ensure VFS root exists
      if (!fs.existsSync(vfsRoot)) {
        fs.mkdirSync(vfsRoot, { recursive: true })
      }

      // Load WASM binary
      debug(`Reading WASM file: ${wasmPath}`)
      const wasmBuffer = fs.readFileSync(wasmPath)
      debug(`WASM file size: ${wasmBuffer.length} bytes`)

      const wasmFormat = detectWasmFormat(wasmBuffer)
      debug(`Detected WASM format: ${wasmFormat}`)

      if (wasmFormat !== 'wasi-p1') {
        throw new Error(
          `Unsupported WASM format: ${wasmFormat}. Only WASI P1 plugins (AssemblyScript/Rust) are supported.`
        )
      }

      // Load standard WASI P1 plugin (AssemblyScript or Rust)
      const pluginInstance = await loadStandardPlugin(
        pluginId,
        wasmPath,
        wasmBuffer,
        vfsRoot,
        capabilities,
        app
      )

      // Store the instance
      this.instances.set(pluginId, pluginInstance)

      debug(`Successfully loaded WASM plugin: ${pluginId}`)
      return pluginInstance
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      debug(`Failed to load WASM plugin ${pluginId}: ${errorMsg}`)
      throw new Error(`Failed to load WASM plugin ${pluginId}: ${errorMsg}`)
    }
  }

  /**
   * Unload a WASM plugin instance
   * @param pluginId The plugin ID to unload
   * @param app Optional Signal K app reference for proper API cleanup
   */
  async unloadPlugin(pluginId: string, app?: any): Promise<void> {
    const instance = this.instances.get(pluginId)
    if (!instance) {
      debug(`Plugin ${pluginId} not found in loaded instances`)
      return
    }

    debug(`Unloading WASM plugin: ${pluginId}`)

    try {
      // Call stop if available
      if (instance.exports.stop) {
        instance.exports.stop()
      }

      // Clean up resource provider registrations for this plugin
      // Pass app to also unregister from ResourcesApi
      cleanupResourceProviders(pluginId, app)

      // Clean up weather provider registrations for this plugin
      // Pass app to also unregister from WeatherApi
      cleanupWeatherProviders(pluginId, app)

      // Remove from instances
      this.instances.delete(pluginId)

      // Let GC clean up the instance
      debug(`Successfully unloaded WASM plugin: ${pluginId}`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      debug(`Error unloading WASM plugin ${pluginId}: ${errorMsg}`)
      throw error
    }
  }

  /**
   * Reload a WASM plugin (unload + load)
   */
  async reloadPlugin(pluginId: string): Promise<WasmPluginInstance> {
    const oldInstance = this.instances.get(pluginId)
    if (!oldInstance) {
      throw new Error(`Plugin ${pluginId} not loaded`)
    }

    const { wasmPath, vfsRoot, capabilities } = oldInstance

    // Unload old instance
    await this.unloadPlugin(pluginId)

    // Load new instance
    return this.loadPlugin(pluginId, wasmPath, vfsRoot, capabilities)
  }

  /**
   * Get a loaded plugin instance
   */
  getInstance(pluginId: string): WasmPluginInstance | undefined {
    return this.instances.get(pluginId)
  }

  /**
   * Get all loaded plugin instances
   */
  getAllInstances(): WasmPluginInstance[] {
    return Array.from(this.instances.values())
  }

  /**
   * Check if a plugin is loaded
   */
  isPluginLoaded(pluginId: string): boolean {
    return this.instances.has(pluginId)
  }

  /**
   * Shutdown the WASM runtime and unload all plugins
   */
  async shutdown(): Promise<void> {
    debug('Shutting down WASM runtime')

    const pluginIds = Array.from(this.instances.keys())
    for (const pluginId of pluginIds) {
      try {
        await this.unloadPlugin(pluginId)
      } catch (error) {
        debug(`Error unloading plugin ${pluginId} during shutdown:`, error)
      }
    }

    this.instances.clear()
    debug('WASM runtime shutdown complete')
  }
}

// Global singleton instance
let runtimeInstance: WasmRuntime | null = null

/**
 * Get the global WASM runtime instance
 */
export function getWasmRuntime(): WasmRuntime {
  if (!runtimeInstance) {
    runtimeInstance = new WasmRuntime()
  }
  return runtimeInstance
}

/**
 * Initialize the WASM runtime
 */
export function initializeWasmRuntime(): WasmRuntime {
  if (runtimeInstance) {
    debug('WASM runtime already initialized')
    return runtimeInstance
  }

  runtimeInstance = new WasmRuntime()
  return runtimeInstance
}

/**
 * Reset the WASM runtime singleton (for hotplug support)
 * This should be called after shutdown to allow re-initialization
 */
export function resetWasmRuntime(): void {
  debug('Resetting WASM runtime singleton')
  runtimeInstance = null
}
