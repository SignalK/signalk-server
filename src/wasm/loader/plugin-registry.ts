/**
 * WASM Plugin Registration and Management
 *
 * Manages the global plugin registry and handles plugin registration.
 * Maintains the plugin map and provides lookup functions.
 */

import * as path from 'path'
import * as fs from 'fs'
import Debug from 'debug'
import express from 'express'
import { WasmPlugin } from './types'
import { SignalKApp, WebappMetadata } from '../types'
import { getWasmRuntime, WasmCapabilities } from '../wasm-runtime'
import {
  getPluginStoragePaths,
  initializePluginVfs,
  readPluginConfig,
  writePluginConfig
} from '../wasm-storage'
import { setupWasmPluginRoutes } from './plugin-routes'
import { updateResourceProviderInstance } from '../bindings/resource-provider'
import { updateWeatherProviderInstance } from '../bindings/weather-provider'
import { updateRadarProviderInstance } from '../bindings/radar-provider'
import { derivePluginId } from '../../pluginid'

const debug = Debug('signalk:wasm:loader')

/**
 * Package.json structure for WASM plugins
 */
interface WasmPackageJson {
  version?: string
  description?: string
  keywords?: string[]
  wasmManifest?: string
  wasmCapabilities?: {
    network?: boolean
    storage?: 'vfs-only' | 'none'
    dataRead?: boolean
    dataWrite?: boolean
    serialPorts?: boolean
    putHandlers?: boolean
    httpEndpoints?: boolean
    resourceProvider?: boolean
    weatherProvider?: boolean
    radarProvider?: boolean
    rawSockets?: boolean
    serverEvents?: boolean
  }
  signalk?: Record<string, unknown>
}

interface PluginMetadata {
  version?: string
}

// Global plugin registry
export const wasmPlugins: Map<string, WasmPlugin> = new Map()

// Crash recovery timers
export const restartTimers: Map<string, NodeJS.Timeout> = new Map()

// Forward declarations for circular dependency resolution
let _startWasmPlugin: (app: SignalKApp, pluginId: string) => Promise<void>
let _updateWasmPluginConfig: (
  app: SignalKApp,
  pluginId: string,
  configuration: unknown,
  configPath: string
) => Promise<void>
let _stopWasmPlugin: (pluginId: string) => Promise<void>

/**
 * Initialize lifecycle function references (called from index.ts to resolve circular dependencies)
 */
export function initializeLifecycleFunctions(
  startWasmPlugin: (app: SignalKApp, pluginId: string) => Promise<void>,
  updateWasmPluginConfig: (
    app: SignalKApp,
    pluginId: string,
    configuration: unknown,
    configPath: string
  ) => Promise<void>,
  stopWasmPlugin: (pluginId: string) => Promise<void>
) {
  _startWasmPlugin = startWasmPlugin
  _updateWasmPluginConfig = updateWasmPluginConfig
  _stopWasmPlugin = stopWasmPlugin
}

/**
 * Helper to update plugin status and sync state property
 */
export function setPluginStatus(
  plugin: WasmPlugin,
  status: WasmPlugin['status']
) {
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
    get() {
      return this.status === 'running'
    },
    enumerable: true,
    configurable: true
  })

  // Add 'stop' method for Node.js plugin compatibility
  plugin.stop = async function () {
    if (_stopWasmPlugin) {
      await _stopWasmPlugin(pluginId)
    }
  }
}

/**
 * Mount webapp static files and register with app.webapps for WASM plugins
 * that have the signalk-webapp keyword
 */
function mountWasmWebapp(
  app: SignalKApp,
  packageName: string,
  packageJson: WasmPackageJson,
  location: string
): void {
  const keywords = packageJson.keywords || []

  // Check if this is a webapp
  if (!keywords.includes('signalk-webapp')) {
    return
  }

  // Find public folder
  const packagePath = path.join(location, packageName)
  let webappPath = packagePath
  if (fs.existsSync(path.join(packagePath, 'public'))) {
    webappPath = path.join(packagePath, 'public')
  }

  // Mount static files
  debug(`Mounting WASM webapp /${packageName}: ${webappPath}`)
  if (app.use) {
    app.use('/' + packageName, express.static(webappPath))
  }

  // Create webapp metadata for admin UI
  const webappMetadata = {
    name: packageName,
    version: packageJson.version,
    description: packageJson.description || '',
    keywords: keywords,
    signalk: packageJson.signalk || {}
  }

  // Register with app.webapps
  if (!app.webapps) {
    app.webapps = []
  }
  // Avoid duplicates
  if (!app.webapps.find((w: WebappMetadata) => w.name === packageName)) {
    app.webapps.push(webappMetadata)
    debug(`Registered WASM webapp: ${packageName}`)
  }

  // Also register as embeddable webapp if it has that keyword
  if (keywords.includes('signalk-embeddable-webapp')) {
    if (!app.embeddablewebapps) {
      app.embeddablewebapps = []
    }
    if (
      !app.embeddablewebapps.find((w: WebappMetadata) => w.name === packageName)
    ) {
      app.embeddablewebapps.push(webappMetadata)
      debug(`Registered WASM embeddable webapp: ${packageName}`)
    }
  }
}

/**
 * Register a WASM plugin from package metadata
 */
export async function registerWasmPlugin(
  app: SignalKApp,
  packageName: string,
  metadata: PluginMetadata,
  location: string,
  configPath: string
): Promise<WasmPlugin> {
  debug(`Registering WASM plugin: ${packageName} from ${location}`)

  try {
    // Read package.json to get WASM metadata
    const packageJsonPath = path.join(location, packageName, 'package.json')
    const packageJson: WasmPackageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf-8')
    )

    if (!packageJson.wasmManifest) {
      throw new Error('Missing wasmManifest in package.json')
    }

    const wasmPath = path.join(location, packageName, packageJson.wasmManifest)

    // Mount webapp static files if this is a signalk-webapp
    mountWasmWebapp(app, packageName, packageJson, location)

    const capabilities: WasmCapabilities = {
      network: packageJson.wasmCapabilities?.network || false,
      storage: packageJson.wasmCapabilities?.storage || 'vfs-only',
      dataRead: packageJson.wasmCapabilities?.dataRead !== false, // default true
      dataWrite: packageJson.wasmCapabilities?.dataWrite !== false, // default true
      serialPorts: packageJson.wasmCapabilities?.serialPorts || false,
      putHandlers: packageJson.wasmCapabilities?.putHandlers || false,
      httpEndpoints: packageJson.wasmCapabilities?.httpEndpoints || false,
      resourceProvider: packageJson.wasmCapabilities?.resourceProvider || false,
      weatherProvider: packageJson.wasmCapabilities?.weatherProvider || false,
      radarProvider: packageJson.wasmCapabilities?.radarProvider || false,
      rawSockets: packageJson.wasmCapabilities?.rawSockets || false,
      serverEvents: packageJson.wasmCapabilities?.serverEvents || false
    }

    // Load WASM module temporarily to extract schema and display name
    const tempVfsRoot = path.join(
      configPath,
      'plugin-config-data',
      '.temp-' + derivePluginId(packageName)
    )
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

    // Derive plugin ID from npm package name (not from WASM exports)
    // This ensures uniqueness via npm registry and prevents ID conflicts
    const pluginId = derivePluginId(packageName)
    // Plugin display name from WASM exports, fallback to package name
    const pluginName = tempInstance.exports.name?.() || packageName
    const schemaJson = tempInstance.exports.schema()
    const schema = schemaJson ? JSON.parse(schemaJson) : {}

    // Update the plugin instance reference for providers
    updateResourceProviderInstance(pluginId, tempInstance)
    updateWeatherProviderInstance(pluginId, tempInstance)
    updateRadarProviderInstance(pluginId, tempInstance)

    // Now check config using the REAL plugin ID
    const storagePaths = getPluginStoragePaths(
      configPath,
      pluginId,
      packageName
    )
    const savedConfig = readPluginConfig(storagePaths.configFile)

    // If plugin is disabled, create minimal plugin object and return early
    if (savedConfig.enabled === false) {
      debug(
        `Plugin ${packageName} is disabled, schema already extracted from WASM`
      )

      // Do NOT write config file here - UI shows "Configure" button when no config file exists
      // Config file will be created when user actually configures the plugin

      // Create a minimal plugin object without keeping WASM loaded
      const pluginVersion = metadata.version || packageJson.version || '0.0.0'
      const plugin: WasmPlugin = {
        id: pluginId,
        name: pluginName,
        type: 'wasm',
        packageName,
        version: pluginVersion,
        enabled: false,
        enableDebug: savedConfig.enableDebug || false,
        keywords: packageJson.keywords || [],
        packageLocation: location,
        configPath,
        metadata: {
          id: pluginId,
          name: pluginName,
          packageName,
          version: pluginVersion,
          wasmManifest: packageJson.wasmManifest || '',
          capabilities,
          packageLocation: location
        },
        instance: undefined, // Instance was destroyed
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
      setupWasmPluginRoutes(
        app,
        plugin,
        configPath,
        _updateWasmPluginConfig,
        _startWasmPlugin,
        _stopWasmPlugin
      )

      debug(
        `Registered disabled WASM plugin: ${pluginId} (${pluginName}) - schema available, instance not loaded`
      )
      return plugin
    }

    // Plugin is enabled - proceed with full load
    debug(
      `Plugin ${packageName} is enabled, initializing VFS and preparing for startup`
    )

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
    const pluginVersion = metadata.version || packageJson.version || '0.0.0'

    // Create plugin object
    const plugin: WasmPlugin = {
      id: pluginId,
      name: pluginName,
      type: 'wasm',
      packageName,
      version: pluginVersion,
      enabled: savedConfig.enabled || false,
      enableDebug: savedConfig.enableDebug || false,
      keywords: packageJson.keywords || [],
      packageLocation: location,
      configPath,
      metadata: {
        id: pluginId,
        name: pluginName,
        packageName,
        version: pluginVersion,
        wasmManifest: packageJson.wasmManifest || '',
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
    setupWasmPluginRoutes(
      app,
      plugin,
      configPath,
      _updateWasmPluginConfig,
      _startWasmPlugin,
      _stopWasmPlugin
    )

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
