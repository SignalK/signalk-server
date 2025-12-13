/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * WASM Plugin Lifecycle Operations
 *
 * Manages plugin lifecycle operations including start, stop, reload, unload,
 * crash handling, and shutdown. Handles state transitions and cleanup.
 */

import * as path from 'path'
import * as fs from 'fs'
import Debug from 'debug'
import { uniqBy } from 'lodash'
import { WasmPlugin } from './types'
import {
  wasmPlugins,
  restartTimers,
  setPluginStatus,
  registerWasmPlugin
} from './plugin-registry'
import {
  getWasmRuntime,
  resetWasmRuntime,
  initializeWasmRuntime
} from '../wasm-runtime'
import {
  resetSubscriptionManager,
  initializeSubscriptionManager
} from '../wasm-subscriptions'
import { backwardsCompat } from './plugin-routes'
import { updateResourceProviderInstance } from '../bindings/resource-provider'
import { updateWeatherProviderInstance } from '../bindings/weather-provider'
import { updateRadarProviderInstance } from '../bindings/radar-provider'
import { socketManager } from '../bindings/socket-manager'
import { modulesWithKeyword } from '../../modules'

const debug = Debug('signalk:wasm:loader')

// Track poll timers for plugins that request periodic polling
const pollTimers: Map<string, NodeJS.Timeout> = new Map()

// Track delta subscription unsubscribe functions for plugins
const deltaUnsubscribers: Map<string, () => void> = new Map()

/**
 * Add WASM plugin webapp to the app.webapps array
 */
function addPluginWebapp(app: any, plugin: WasmPlugin): void {
  if (!plugin.metadata) {
    return
  }

  const packageJson = require(
    `${plugin.packageLocation}/${plugin.packageName}/package.json`
  )

  // Check if this plugin has webapp keywords
  const isWebapp = packageJson.keywords?.includes('signalk-webapp')
  const isEmbeddableWebapp = packageJson.keywords?.includes(
    'signalk-embeddable-webapp'
  )

  if (!isWebapp && !isEmbeddableWebapp) {
    return
  }

  // Check if already in the list
  if (isWebapp) {
    const existing = app.webapps?.find((w: any) => w.name === packageJson.name)
    if (!existing) {
      debug(`Adding ${plugin.id} to app.webapps`)
      app.webapps = app.webapps || []
      app.webapps.push(packageJson)
    }
  }

  if (isEmbeddableWebapp) {
    const existing = app.embeddablewebapps?.find(
      (w: any) => w.name === packageJson.name
    )
    if (!existing) {
      debug(`Adding ${plugin.id} to app.embeddablewebapps`)
      app.embeddablewebapps = app.embeddablewebapps || []
      app.embeddablewebapps.push(packageJson)
    }
  }
}

/**
 * Remove WASM plugin webapp from the app.webapps array
 */
function removePluginWebapp(app: any, plugin: WasmPlugin): void {
  if (!plugin.metadata) {
    return
  }

  debug(`Removing ${plugin.packageName} from webapp lists`)

  // Remove from webapps
  if (app.webapps) {
    app.webapps = app.webapps.filter((w: any) => w.name !== plugin.packageName)
  }

  // Remove from embeddablewebapps
  if (app.embeddablewebapps) {
    app.embeddablewebapps = app.embeddablewebapps.filter(
      (w: any) => w.name !== plugin.packageName
    )
  }
}

/**
 * Filter webapps to only include enabled plugin webapps
 */
function filterEnabledWebapps(app: any, webapps: any[]): any[] {
  if (!app.plugins || !app.getPluginOptions) {
    return webapps
  }

  const enabledPluginNames = new Set<string>()
  const allPluginNames = new Set<string>()

  for (const plugin of app.plugins) {
    if (plugin.packageName) {
      allPluginNames.add(plugin.packageName)

      let isEnabled = false
      if (plugin.type === 'wasm') {
        isEnabled = plugin.enabled === true
      } else {
        const pluginOptions = app.getPluginOptions(plugin.id)
        isEnabled = pluginOptions?.enabled === true
      }

      if (isEnabled) {
        enabledPluginNames.add(plugin.packageName)
      }
    }
  }

  return webapps.filter((w: any) => {
    const isPluginWebapp = allPluginNames.has(w.name)
    if (!isPluginWebapp) return true // Keep standalone webapps
    return enabledPluginNames.has(w.name)
  })
}

/**
 * Emit server event to update admin UI webapps list (for hotplug support)
 */
function emitWebappsUpdate(app: any): void {
  let allWebapps: any[] = []
    .concat(app.webapps || [])
    .concat(app.embeddablewebapps || [])

  // Filter to only include enabled plugin webapps
  allWebapps = filterEnabledWebapps(app, allWebapps)

  app.emit('serverevent', {
    type: 'RECEIVE_WEBAPPS_LIST',
    from: 'signalk-server',
    data: uniqBy(allWebapps, 'name')
  })
}

/**
 * Start a WASM plugin
 */
export async function startWasmPlugin(
  app: any,
  pluginId: string
): Promise<void> {
  const plugin = wasmPlugins.get(pluginId)
  if (!plugin) {
    throw new Error(`WASM plugin ${pluginId} not found`)
  }

  if (plugin.status === 'running') {
    debug(`Plugin ${pluginId} already running`)
    return
  }

  debug(`Starting WASM plugin: ${pluginId}`)
  setPluginStatus(plugin, 'starting')
  plugin.errorMessage = undefined

  try {
    if (!plugin.instance) {
      throw new Error('Plugin instance not loaded')
    }

    // Call plugin start() with configuration
    // Pass the entire configuration object including enableDebug at root level
    const startConfig = {
      ...plugin.configuration,
      enableDebug: plugin.enableDebug
    }
    const configJson = JSON.stringify(startConfig)
    debug(`Starting plugin with config: ${configJson}`)
    const result = await plugin.instance.exports.start(configJson)

    if (result !== 0) {
      throw new Error(`Plugin start() returned error code: ${result}`)
    }

    // Update provider instance references after plugin_start() completes
    // Providers are registered during start(), so we need to update
    // references using BOTH the packageName (used in env bindings) and real pluginId
    if (plugin.packageName) {
      updateResourceProviderInstance(plugin.packageName, plugin.instance)
      updateWeatherProviderInstance(plugin.packageName, plugin.instance)
      updateRadarProviderInstance(plugin.packageName, plugin.instance)
    }
    updateResourceProviderInstance(pluginId, plugin.instance)
    updateWeatherProviderInstance(pluginId, plugin.instance)
    updateRadarProviderInstance(pluginId, plugin.instance)

    setPluginStatus(plugin, 'running')
    plugin.statusMessage = 'Running'
    plugin.crashCount = 0 // Reset crash count on successful start
    plugin.restartBackoff = 1000

    // Add webapp to app.webapps array if this plugin is a webapp
    addPluginWebapp(app, plugin)

    // Set up periodic polling for plugins that export poll()
    // This is a generic mechanism for plugins that need to poll hardware,
    // sockets, or external systems (e.g., radar, NMEA receivers, sensors)
    if (plugin.instance?.exports?.poll) {
      const pollInterval = 1000 // Poll every 1 second
      debug(`Setting up poll timer for ${pluginId} (${pollInterval}ms)`)

      const pollTimer = setInterval(() => {
        try {
          if (plugin.status === 'running' && plugin.instance?.exports?.poll) {
            const result = plugin.instance.exports.poll()
            if (result !== 0) {
              debug(`[${pluginId}] poll() returned: ${result}`)
            }
          }
        } catch (pollError) {
          debug(`[${pluginId}] poll() error: ${pollError}`)
        }
      }, pollInterval)

      pollTimers.set(pluginId, pollTimer)
    }

    // Set up delta subscription if plugin exports delta_handler
    if (plugin.instance?.exports?.delta_handler) {
      debug(`Setting up delta subscription for ${pluginId}`)

      // Subscribe to deltas from the server
      if (app.signalk && typeof app.signalk.on === 'function') {
        const deltaHandler = (delta: any) => {
          try {
            if (
              plugin.status === 'running' &&
              plugin.instance?.exports?.delta_handler
            ) {
              const deltaJson = JSON.stringify(delta)
              plugin.instance.exports.delta_handler(deltaJson)
            }
          } catch (deltaError) {
            debug(`[${pluginId}] delta_handler error: ${deltaError}`)
          }
        }

        // Subscribe to delta events
        app.signalk.on('delta', deltaHandler)

        // Store unsubscribe function
        deltaUnsubscribers.set(pluginId, () => {
          if (app.signalk && typeof app.signalk.removeListener === 'function') {
            app.signalk.removeListener('delta', deltaHandler)
          }
        })

        debug(`Delta subscription active for ${pluginId}`)
      } else {
        debug(`Warning: app.signalk not available for delta subscription`)
      }
    }

    debug(`Successfully started WASM plugin: ${pluginId}`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    setPluginStatus(plugin, 'error')
    plugin.errorMessage = errorMsg
    debug(`Failed to start WASM plugin ${pluginId}: ${errorMsg}`)
    throw error
  }
}

/**
 * Stop a WASM plugin
 */
export async function stopWasmPlugin(pluginId: string): Promise<void> {
  const plugin = wasmPlugins.get(pluginId)
  if (!plugin) {
    throw new Error(`WASM plugin ${pluginId} not found`)
  }

  debug(`Stopping WASM plugin: ${pluginId}`)

  try {
    // Cancel any pending restart timers
    const timer = restartTimers.get(pluginId)
    if (timer) {
      clearTimeout(timer)
      restartTimers.delete(pluginId)
    }

    // Cancel any poll timers
    const pollTimer = pollTimers.get(pluginId)
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimers.delete(pluginId)
      debug(`Stopped poll timer for ${pluginId}`)
    }

    // Unsubscribe from delta events
    const deltaUnsubscriber = deltaUnsubscribers.get(pluginId)
    if (deltaUnsubscriber) {
      deltaUnsubscriber()
      deltaUnsubscribers.delete(pluginId)
      debug(`Stopped delta subscription for ${pluginId}`)
    }

    if (plugin.instance) {
      // Call plugin stop()
      const result = plugin.instance.exports.stop()
      if (result !== 0) {
        debug(`Plugin stop() returned error code: ${result}`)
      }
    }

    // Clean up any sockets opened by this plugin
    socketManager.closeAllForPlugin(pluginId)

    setPluginStatus(plugin, 'stopped')
    plugin.statusMessage = 'Stopped'
    debug(`Successfully stopped WASM plugin: ${pluginId}`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    debug(`Error stopping WASM plugin ${pluginId}: ${errorMsg}`)
    setPluginStatus(plugin, 'error')
    plugin.errorMessage = errorMsg
    throw error
  }
}

/**
 * Stop a WASM plugin and remove its webapp (for hotplug disable)
 * This is called when a plugin is disabled via the config UI
 */
export async function stopAndRemoveWasmPluginWebapp(
  app: any,
  pluginId: string
): Promise<void> {
  const plugin = wasmPlugins.get(pluginId)
  if (!plugin) {
    throw new Error(`WASM plugin ${pluginId} not found`)
  }

  await stopWasmPlugin(pluginId)

  // Remove webapp from app.webapps for hotplug support
  removePluginWebapp(app, plugin)
}

/**
 * Unload a WASM plugin completely (remove from memory and unregister routes)
 */
export async function unloadWasmPlugin(
  app: any,
  pluginId: string
): Promise<void> {
  const plugin = wasmPlugins.get(pluginId)
  if (!plugin) {
    throw new Error(`WASM plugin ${pluginId} not found`)
  }

  debug(`Unloading WASM plugin: ${pluginId}`)

  try {
    // Stop the plugin first if running
    if (plugin.status === 'running') {
      await stopWasmPlugin(pluginId)
    }

    // Remove HTTP routes from Express
    if (plugin.router) {
      debug(`Removing HTTP routes for ${pluginId}`)
      // Express doesn't have a built-in way to remove routes, so we need to
      // remove the middleware from the app stack
      const paths = backwardsCompat(`/plugins/${pluginId}`)

      // Remove all route handlers for this plugin
      paths.forEach((path) => {
        if (app._router && app._router.stack) {
          app._router.stack = app._router.stack.filter((layer: any) => {
            // Remove layers that match this plugin's path
            if (layer.route) {
              const routePath = layer.route.path
              // Handle both string and array cases for route.path
              if (typeof routePath === 'string') {
                return !routePath.startsWith(path)
              } else if (Array.isArray(routePath)) {
                return !routePath.some((p) => p.startsWith(path))
              }
              return true
            }
            if (layer.name === 'router' && layer.regexp) {
              return !layer.regexp.test(path)
            }
            return true
          })
        }
      })

      plugin.router = undefined
      debug(`Removed HTTP routes for ${pluginId}`)
    }

    // Remove webapp from app.webapps array if this plugin is a webapp
    removePluginWebapp(app, plugin)

    // Destroy WASM instance and free memory
    if (plugin.instance) {
      debug(`Destroying WASM instance for ${pluginId}`)

      // Clear any references to help garbage collection
      plugin.instance = undefined

      debug(`Destroyed WASM instance for ${pluginId}`)
    }

    setPluginStatus(plugin, 'stopped')
    plugin.statusMessage = 'Unloaded'
    debug(`Successfully unloaded WASM plugin: ${pluginId}`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    debug(`Error unloading WASM plugin ${pluginId}: ${errorMsg}`)
    setPluginStatus(plugin, 'error')
    plugin.errorMessage = errorMsg
    throw error
  }
}

/**
 * Reload a WASM plugin (hot-reload without server restart)
 */
export async function reloadWasmPlugin(
  app: any,
  pluginId: string
): Promise<void> {
  const plugin = wasmPlugins.get(pluginId)
  if (!plugin) {
    throw new Error(`WASM plugin ${pluginId} not found`)
  }

  debug(`Reloading WASM plugin: ${pluginId}`)

  try {
    const wasRunning = plugin.status === 'running'

    // Stop the plugin
    if (wasRunning) {
      await stopWasmPlugin(pluginId)
    }

    // Save current configuration
    const savedConfig = plugin.configuration

    // Reload WASM module
    const runtime = getWasmRuntime()
    await runtime.reloadPlugin(pluginId)

    // Get new instance
    const newInstance = runtime.getInstance(pluginId)
    if (!newInstance) {
      throw new Error('Failed to get reloaded instance')
    }

    plugin.instance = newInstance

    // Update schema from new instance
    const schemaJson = newInstance.exports.schema()
    plugin.schema = schemaJson ? JSON.parse(schemaJson) : {}

    // Restart if it was running
    if (wasRunning) {
      await startWasmPlugin(app, pluginId)
    }

    plugin.statusMessage = 'Reloaded successfully'
    debug(`Successfully reloaded WASM plugin: ${pluginId}`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    setPluginStatus(plugin, 'error')
    plugin.errorMessage = `Reload failed: ${errorMsg}`
    debug(`Failed to reload WASM plugin ${pluginId}: ${errorMsg}`)
    throw error
  }
}

/**
 * Handle WASM plugin crash with automatic restart
 */
export async function handleWasmPluginCrash(
  app: any,
  pluginId: string,
  error: Error
): Promise<void> {
  const plugin = wasmPlugins.get(pluginId)
  if (!plugin) {
    return
  }

  plugin.crashCount++
  plugin.lastCrash = new Date()
  setPluginStatus(plugin, 'crashed')
  plugin.errorMessage = `Crashed: ${error.message}`

  debug(
    `WASM plugin ${pluginId} crashed (count: ${plugin.crashCount}): ${error.message}`
  )

  // Give up after 3 crashes in quick succession
  if (plugin.crashCount >= 3) {
    setPluginStatus(plugin, 'error')
    plugin.errorMessage =
      'Plugin repeatedly crashing, automatic restart disabled'
    debug(`Plugin ${pluginId} disabled after 3 crashes`)
    return
  }

  // Schedule restart with exponential backoff
  plugin.restartBackoff = Math.min(plugin.restartBackoff * 2, 30000) // Max 30 seconds

  debug(`Scheduling restart for ${pluginId} in ${plugin.restartBackoff}ms`)

  const timer = setTimeout(async () => {
    try {
      debug(`Attempting automatic restart of ${pluginId}`)
      await reloadWasmPlugin(app, pluginId)
      plugin.statusMessage = 'Recovered from crash'
    } catch (restartError) {
      debug(`Failed to restart ${pluginId}:`, restartError)
      setPluginStatus(plugin, 'error')
      plugin.errorMessage = 'Failed to recover from crash'
    }
  }, plugin.restartBackoff)

  restartTimers.set(pluginId, timer)
}

/**
 * Filter out disabled WASM plugins from webapp arrays
 * Should be called after webapp system initializes
 */
export function filterDisabledWasmWebapps(app: any): void {
  debug('Filtering disabled WASM plugins from webapp lists')

  // Get all WASM plugins
  const allPlugins = Array.from(wasmPlugins.values())

  // For each disabled WASM plugin, remove it from webapp arrays
  for (const plugin of allPlugins) {
    if (!plugin.enabled) {
      removePluginWebapp(app, plugin)
    }
  }
}

/**
 * Shutdown all WASM plugins
 * @param app - The SignalK app instance (optional, for hotplug webapp updates)
 */
export async function shutdownAllWasmPlugins(app?: any): Promise<void> {
  debug('Shutting down all WASM plugins')
  debug(`Number of plugins in registry: ${wasmPlugins.size}`)

  // Clear all restart timers
  for (const timer of restartTimers.values()) {
    clearTimeout(timer)
  }
  restartTimers.clear()

  // Stop all plugins and remove their webapps
  const plugins = Array.from(wasmPlugins.values())
  debug(
    `Plugins to shutdown: ${plugins.map((p) => `${p.id}(${p.status})`).join(', ')}`
  )
  for (const plugin of plugins) {
    try {
      if (plugin.status === 'running') {
        debug(`Stopping plugin ${plugin.id}...`)
        await stopWasmPlugin(plugin.id)
        debug(`Plugin ${plugin.id} stopped, status now: ${plugin.status}`)
      } else {
        debug(
          `Plugin ${plugin.id} not running (status=${plugin.status}), skipping stop`
        )
      }
      // Remove webapp from lists (for hotplug)
      if (app) {
        removePluginWebapp(app, plugin)
      }
    } catch (error) {
      debug(`Error stopping plugin ${plugin.id}:`, error)
    }
  }

  // Emit webapp update event for hotplug (so UI updates immediately)
  if (app) {
    emitWebappsUpdate(app)
    debug('Emitted webapp list update event')
  }

  // Shutdown runtime
  const runtime = getWasmRuntime()
  await runtime.shutdown()

  // Reset singletons to allow re-initialization on hotplug
  resetWasmRuntime()
  resetSubscriptionManager()

  wasmPlugins.clear()
  debug('All WASM plugins shut down')
}

/**
 * Discover and register all WASM plugins (for hotplug re-enable)
 * This is called when the WASM interface is re-enabled at runtime
 * to re-discover and load all WASM plugins without requiring a server restart.
 * @param app - The SignalK app instance
 */
export async function discoverAndRegisterWasmPlugins(app: any): Promise<void> {
  debug('Discovering and registering WASM plugins for hotplug re-enable')

  // 0. Remove any existing WASM plugin entries from app.plugins to avoid duplicates
  // This handles the case where minimal entries were created when WASM was disabled
  if (app.plugins) {
    const wasmPluginIds = new Set<string>()
    app.plugins = app.plugins.filter((p: any) => {
      if (p.type === 'wasm') {
        wasmPluginIds.add(p.id)
        debug(`Removing existing WASM plugin entry: ${p.id}`)
        return false
      }
      return true
    })
    // Also remove from pluginsMap
    if (app.pluginsMap) {
      wasmPluginIds.forEach((id) => {
        delete app.pluginsMap[id]
      })
    }
  }

  // 1. Initialize WASM runtime and subscription manager
  debug('Initializing WASM runtime')
  app.wasmRuntime = initializeWasmRuntime()
  app.wasmSubscriptionManager = initializeSubscriptionManager()

  // 2. Discover all plugins with signalk-node-server-plugin keyword
  const allModules = modulesWithKeyword(
    app.config,
    'signalk-node-server-plugin'
  )
  debug(
    `Found ${allModules.length} plugins with signalk-node-server-plugin keyword`
  )

  // 3. Filter for WASM plugins only (those with wasmManifest in package.json)
  const wasmModules = allModules.filter((moduleData: any) => {
    const packageJsonPath = path.join(
      moduleData.location,
      moduleData.module,
      'package.json'
    )
    if (fs.existsSync(packageJsonPath)) {
      try {
        // Clear require cache to get fresh package.json
        delete require.cache[require.resolve(packageJsonPath)]
        const packageJson = require(packageJsonPath)
        return !!packageJson.wasmManifest
      } catch (err) {
        debug(`Error reading package.json for ${moduleData.module}:`, err)
        return false
      }
    }
    return false
  })

  debug(`Found ${wasmModules.length} WASM plugins to register`)

  // 4. Register all WASM plugins
  const registrationResults = await Promise.allSettled(
    wasmModules.map((moduleData: any) =>
      registerWasmPlugin(
        app,
        moduleData.module,
        moduleData.metadata,
        moduleData.location,
        app.config.configPath
      )
    )
  )

  // Log results
  let successCount = 0
  let failCount = 0
  registrationResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successCount++
      debug(`Successfully registered WASM plugin: ${wasmModules[index].module}`)
    } else {
      failCount++
      debug(
        `Failed to register WASM plugin ${wasmModules[index].module}:`,
        result.reason
      )
    }
  })

  debug(
    `WASM plugin discovery complete: ${successCount} succeeded, ${failCount} failed`
  )

  // 5. Emit webapp update event so UI reflects new plugins
  emitWebappsUpdate(app)
  debug('Emitted webapp list update event after WASM plugin discovery')
}
