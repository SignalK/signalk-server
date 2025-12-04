/**
 * WASM Plugin Registration and Management
 *
 * Manages the global plugin registry and handles plugin registration.
 * Maintains the plugin map and provides lookup functions.
 */

import * as path from 'path'
import * as fs from 'fs'
import Debug from 'debug'
import { WasmPlugin, WasmPluginMetadata } from './types'
import { getWasmRuntime, WasmCapabilities } from '../wasm-runtime'
import {
  getPluginStoragePaths,
  initializePluginVfs,
  readPluginConfig,
  writePluginConfig
} from '../wasm-storage'
import { setupWasmPluginRoutes } from './plugin-routes'
import {
  migrateResourceProviderPluginId,
  updateResourceProviderInstance
} from '../bindings/resource-provider'

const debug = Debug('signalk:wasm:loader')

// Global plugin registry
export const wasmPlugins: Map<string, WasmPlugin> = new Map()

// Crash recovery timers
export const restartTimers: Map<string, NodeJS.Timeout> = new Map()

// Forward declarations for circular dependency resolution
let _startWasmPlugin: (app: any, pluginId: string) => Promise<void>
let _updateWasmPluginConfig: (app: any, pluginId: string, configuration: any, configPath: string) => Promise<void>
let _unloadWasmPlugin: (app: any, pluginId: string) => Promise<void>
let _stopWasmPlugin: (pluginId: string) => Promise<void>

/**
 * Initialize lifecycle function references (called from index.ts to resolve circular dependencies)
 */
export function initializeLifecycleFunctions(
  startWasmPlugin: (app: any, pluginId: string) => Promise<void>,
  updateWasmPluginConfig: (app: any, pluginId: string, configuration: any, configPath: string) => Promise<void>,
  unloadWasmPlugin: (app: any, pluginId: string) => Promise<void>,
  stopWasmPlugin: (pluginId: string) => Promise<void>
) {
  _startWasmPlugin = startWasmPlugin
  _updateWasmPluginConfig = updateWasmPluginConfig
  _unloadWasmPlugin = unloadWasmPlugin
  _stopWasmPlugin = stopWasmPlugin
}

/**
 * Helper to update plugin status and sync state property
 */
export function setPluginStatus(plugin: WasmPlugin, status: WasmPlugin['status']) {
  plugin.status = status
  plugin.state = status
}

/**
 * Add Node.js plugin compatibility properties to WASM plugin
 * This allows WASM plugins to be used interchangeably with Node.js plugins
 */
function addNodejsPluginCompat(plugin: WasmPlugin, pluginId: string): void {
  // Add 'started' getter for Node.js plugin compatibility
  Object.defineProperty(plugin, 'started', {
    get() { return this.status === 'running' },
    enumerable: true,
    configurable: true
  })

  // Add 'stop' method for Node.js plugin compatibility
  ;(plugin as any).stop = async function() {
    if (_stopWasmPlugin) {
      await _stopWasmPlugin(pluginId)
    }
  }
}

/**
 * Register a WASM plugin from package metadata
 */
export async function registerWasmPlugin(
  app: any,
  packageName: string,
  metadata: any,
  location: string,
  configPath: string
): Promise<WasmPlugin> {
  debug(`Registering WASM plugin: ${packageName} from ${location}`)

  try {
    // Read package.json to get WASM metadata
    const packageJson = require(path.join(location, packageName, 'package.json'))

    if (!packageJson.wasmManifest) {
      throw new Error('Missing wasmManifest in package.json')
    }

    const wasmPath = path.join(location, packageName, packageJson.wasmManifest)
    const capabilities: WasmCapabilities = {
      network: packageJson.wasmCapabilities?.network || false,
      storage: packageJson.wasmCapabilities?.storage || 'vfs-only',
      dataRead: packageJson.wasmCapabilities?.dataRead !== false, // default true
      dataWrite: packageJson.wasmCapabilities?.dataWrite !== false, // default true
      serialPorts: packageJson.wasmCapabilities?.serialPorts || false,
      putHandlers: packageJson.wasmCapabilities?.putHandlers || false,
      httpEndpoints: packageJson.wasmCapabilities?.httpEndpoints || false,
      resourceProvider: packageJson.wasmCapabilities?.resourceProvider || false,
      rawSockets: packageJson.wasmCapabilities?.rawSockets || false
    }

    // Load WASM module temporarily just to get the plugin ID
    // We need the real plugin ID to find the correct config file
    const tempVfsRoot = path.join(configPath, 'plugin-config-data', '.temp-' + packageName.replace(/\//g, '-'))
    if (!fs.existsSync(tempVfsRoot)) {
      fs.mkdirSync(tempVfsRoot, { recursive: true })
    }

    const runtime = getWasmRuntime()
    const tempInstance = await runtime.loadPlugin(
      packageName,
      wasmPath,
      tempVfsRoot,
      capabilities,
      app
    )

    // Extract plugin ID from WASM exports
    const pluginId = tempInstance.exports.id()
    const pluginName = tempInstance.exports.name()
    const schemaJson = tempInstance.exports.schema()
    const schema = schemaJson ? JSON.parse(schemaJson) : {}

    // Migrate any resource provider registrations from packageName to real pluginId
    // This is needed because registerResourceProvider() is called during plugin_start()
    // before we know the real pluginId
    if (packageName !== pluginId) {
      migrateResourceProviderPluginId(packageName, pluginId)
    }

    // Update the plugin instance reference for resource providers
    updateResourceProviderInstance(pluginId, tempInstance)

    // Now check config using the REAL plugin ID
    const storagePaths = getPluginStoragePaths(configPath, pluginId, packageName)
    const savedConfig = readPluginConfig(storagePaths.configFile)

    // If plugin is disabled, create minimal plugin object and return early
    if (savedConfig.enabled === false) {
      debug(`Plugin ${packageName} is disabled, schema already extracted from WASM`)

      // Do NOT write config file here - UI shows "Configure" button when no config file exists
      // Config file will be created when user actually configures the plugin

      // Create a minimal plugin object without keeping WASM loaded
      const plugin: WasmPlugin = {
        id: pluginId,
        name: pluginName,
        type: 'wasm',
        packageName,
        version: metadata.version || packageJson.version,
        enabled: false,
        enableDebug: savedConfig.enableDebug || false,
        keywords: packageJson.keywords || [],
        packageLocation: location,
        configPath,
        metadata: {
          id: pluginId,
          name: pluginName,
          packageName,
          version: metadata.version || packageJson.version,
          wasmManifest: packageJson.wasmManifest,
          capabilities,
          packageLocation: location
        },
        instance: null as any, // Instance was destroyed
        status: 'stopped',
        schema, // Schema extracted from temp load
        configuration: savedConfig.configuration, // Keep undefined/null for UI "Configure" button logic
        crashCount: 0,
        restartBackoff: 1000,
        description: packageJson.description || '',
        state: 'stopped',
        format: tempInstance.format // Preserve format from temp instance
      }

      // Add Node.js plugin compatibility properties
      addNodejsPluginCompat(plugin, pluginId)

      // Register minimal plugin in global map
      wasmPlugins.set(pluginId, plugin)

      // Add to app.plugins array
      if (app.plugins) {
        app.plugins.push(plugin)
      }

      // Add to app.pluginsMap
      if (app.pluginsMap) {
        app.pluginsMap[pluginId] = plugin
      }

      // Set up basic REST API routes even though plugin is disabled
      // This allows Plugin Config UI to read/write config and enable the plugin
      setupWasmPluginRoutes(app, plugin, configPath, _updateWasmPluginConfig, _startWasmPlugin, _unloadWasmPlugin, _stopWasmPlugin)

      debug(`Registered disabled WASM plugin: ${pluginId} (${pluginName}) - schema available, instance not loaded`)
      return plugin
    }

    // Plugin is enabled - proceed with full load
    debug(`Plugin ${packageName} is enabled, initializing VFS and preparing for startup`)

    // Initialize VFS with the real plugin ID
    initializePluginVfs(storagePaths)

    // Clean up temp VFS
    if (fs.existsSync(tempVfsRoot)) {
      fs.rmSync(tempVfsRoot, { recursive: true, force: true })
    }

    // Write initial config file if it doesn't exist
    if (!fs.existsSync(storagePaths.configFile)) {
      debug(`Creating initial config file for ${packageName}`)
      writePluginConfig(storagePaths.configFile, savedConfig)
    }

    // Use the instance we already loaded
    const instance = tempInstance

    // Create plugin object
    const plugin: WasmPlugin = {
      id: pluginId,
      name: pluginName,
      type: 'wasm',
      packageName,
      version: metadata.version || packageJson.version,
      enabled: savedConfig.enabled || false,
      enableDebug: savedConfig.enableDebug || false,
      keywords: packageJson.keywords || [],
      packageLocation: location,
      configPath,
      metadata: {
        id: pluginId,
        name: pluginName,
        packageName,
        version: metadata.version || packageJson.version,
        wasmManifest: packageJson.wasmManifest,
        capabilities,
        packageLocation: location
      },
      instance,
      status: 'stopped',
      schema,
      configuration: savedConfig.configuration, // Keep undefined/null for UI "Configure" button logic
      crashCount: 0,
      restartBackoff: 1000, // Start with 1 second
      description: packageJson.description || '',
      state: 'stopped',
      format: instance.format // WASM binary format (wasi-p1 or component-model)
    }

    // Add Node.js plugin compatibility properties
    addNodejsPluginCompat(plugin, pluginId)

    // Register in global map
    wasmPlugins.set(pluginId, plugin)

    // Add to app.plugins array for unified plugin management
    if (app.plugins) {
      app.plugins.push(plugin)
    }

    // Add to app.pluginsMap for plugin API compatibility
    if (app.pluginsMap) {
      app.pluginsMap[pluginId] = plugin
    }

    // Set up REST API routes for this plugin
    setupWasmPluginRoutes(app, plugin, configPath, _updateWasmPluginConfig, _startWasmPlugin, _unloadWasmPlugin, _stopWasmPlugin)

    debug(`Registered WASM plugin: ${pluginId} (${pluginName})`)

    // Auto-start if enabled
    if (plugin.enabled) {
      await _startWasmPlugin(app, pluginId)
    }

    return plugin
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    debug(`Failed to register WASM plugin ${packageName}: ${errorMsg}`)
    throw new Error(`Failed to register WASM plugin: ${errorMsg}`)
  }
}

/**
 * Get all WASM plugins
 */
export function getAllWasmPlugins(): WasmPlugin[] {
  return Array.from(wasmPlugins.values())
}

/**
 * Get a WASM plugin by ID
 */
export function getWasmPlugin(pluginId: string): WasmPlugin | undefined {
  return wasmPlugins.get(pluginId)
}
