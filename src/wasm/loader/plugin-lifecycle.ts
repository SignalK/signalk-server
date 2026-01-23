/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WASM Plugin Lifecycle Operations
 *
 * Manages plugin lifecycle operations including start, stop, reload, unload,
 * crash handling, and shutdown. Handles state transitions and cleanup.
 */

import Debug from 'debug'
import { WasmPlugin } from './types'
import { wasmPlugins, restartTimers, setPluginStatus } from './plugin-registry'
import { getWasmRuntime, resetWasmRuntime } from '../wasm-runtime'
import { resetSubscriptionManager } from '../wasm-subscriptions'
import { backwardsCompat } from './plugin-routes'
import { updateResourceProviderInstance } from '../bindings/resource-provider'
import { updateWeatherProviderInstance } from '../bindings/weather-provider'
import { updateRadarProviderInstance } from '../bindings/radar-provider'
import { socketManager } from '../bindings/socket-manager'
import { getEventManager, resetEventManager, ServerEvent } from '../wasm-events'

const debug = Debug('signalk:wasm:loader')

// Track poll timers for plugins that request periodic polling
const pollTimers: Map<string, NodeJS.Timeout> = new Map()

// Track delta subscription unsubscribe functions for plugins
const deltaUnsubscribers: Map<string, () => void> = new Map()

// Track event subscription state for plugins
const eventSubscriptionActive: Set<string> = new Set()

// Mutex for serializing network-capable plugin starts
// as-fetch uses global state that gets corrupted with parallel plugin starts
let networkPluginStartMutex: Promise<void> = Promise.resolve()

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

  // Serialize starts for network-capable plugins to avoid as-fetch global state corruption
  if (plugin.metadata?.capabilities?.network) {
    debug(`Plugin ${pluginId} has network capability, waiting for mutex...`)
    const previousMutex = networkPluginStartMutex
    let releaseMutex: () => void
    networkPluginStartMutex = new Promise((resolve) => {
      releaseMutex = resolve
    })
    await previousMutex
    debug(`Plugin ${pluginId} acquired start mutex`)
    try {
      await startWasmPluginInternal(app, plugin, pluginId)
    } finally {
      debug(`Plugin ${pluginId} releasing start mutex`)
      releaseMutex!()
    }
  } else {
    await startWasmPluginInternal(app, plugin, pluginId)
  }
}

async function startWasmPluginInternal(
  app: any,
  plugin: WasmPlugin,
  pluginId: string
): Promise<void> {
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

    // Set up event subscription if plugin exports event_handler
    if (plugin.instance?.exports?.event_handler) {
      debug(`Setting up event subscription for ${pluginId}`)

      const eventManager = getEventManager()

      // Create the event callback that calls the WASM export
      const eventCallback = (event: ServerEvent) => {
        try {
          if (
            plugin.status === 'running' &&
            plugin.instance?.exports?.event_handler
          ) {
            const eventJson = JSON.stringify(event)
            plugin.instance.exports.event_handler(eventJson)
          }
        } catch (eventError) {
          debug(`[${pluginId}] event_handler error: ${eventError}`)
        }
      }

      // Check if plugin has serverEvents capability
      if (plugin.metadata?.capabilities?.serverEvents) {
        // Re-register with the actual callback (replaces placeholder from FFI)
        // Get current subscriptions to preserve event type filtering
        const existingSubs = eventManager.getSubscriptions(pluginId)
        if (existingSubs.length > 0) {
          // Preserve the event types from existing subscription
          const eventTypes = existingSubs[0].eventTypes
          eventManager.unregister(pluginId)
          eventManager.register(pluginId, eventTypes, eventCallback)
          debug(`Updated event subscription callback for ${pluginId}`)
        } else {
          // No existing subscription, register for all allowed events
          eventManager.register(pluginId, [], eventCallback)
          debug(
            `Registered new event subscription for ${pluginId} (all allowed events)`
          )
        }

        // Replay any buffered events (from hot-reload)
        eventManager.replayBuffered(pluginId, eventCallback)

        eventSubscriptionActive.add(pluginId)
        debug(`Event subscription active for ${pluginId}`)
      } else {
        debug(
          `[${pluginId}] has event_handler but serverEvents capability not granted`
        )
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

    // Unsubscribe from server events
    if (eventSubscriptionActive.has(pluginId)) {
      const eventManager = getEventManager()
      eventManager.unregister(pluginId)
      eventSubscriptionActive.delete(pluginId)
      debug(`Stopped event subscription for ${pluginId}`)
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

    // Start buffering events during reload (if plugin has event subscription)
    const eventManager = getEventManager()
    const hadEventSubscription = eventSubscriptionActive.has(pluginId)
    if (hadEventSubscription) {
      eventManager.startBuffering(pluginId)
      debug(`Started event buffering for ${pluginId} during reload`)
    }

    // Stop the plugin
    if (wasRunning) {
      await stopWasmPlugin(pluginId)
    }

    // Configuration is preserved in the plugin object through the reload

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

    // Stop event buffering (buffered events are replayed in startWasmPluginInternal)
    if (hadEventSubscription) {
      eventManager.stopBuffering(pluginId)
      debug(`Stopped event buffering for ${pluginId}`)
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
 * Shutdown all WASM plugins
 */
export async function shutdownAllWasmPlugins(): Promise<void> {
  debug('Shutting down all WASM plugins')
  debug(`Number of plugins in registry: ${wasmPlugins.size}`)

  // Clear all restart timers
  for (const timer of restartTimers.values()) {
    clearTimeout(timer)
  }
  restartTimers.clear()

  // Stop all plugins
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
    } catch (error) {
      debug(`Error stopping plugin ${plugin.id}:`, error)
    }
  }

  // Shutdown runtime
  const runtime = getWasmRuntime()
  await runtime.shutdown()

  // Reset singletons
  resetWasmRuntime()
  resetSubscriptionManager()
  resetEventManager()

  wasmPlugins.clear()
  debug('All WASM plugins shut down')
}
