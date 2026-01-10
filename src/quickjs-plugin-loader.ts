/**
 * QuickJS WASM Plugin Loader
 * 
 * Provides support for running JavaScript plugins in a sandboxed QuickJS WASM environment.
 * This allows JavaScript plugins to run with:
 * - Memory isolation
 * - Resource limits
 * - Controlled access to Signal K APIs
 */

import { newQuickJSWASMModuleFromVariant, newVariant, memoizePromiseFactory } from 'quickjs-emscripten'
import type { QuickJSContext, QuickJSRuntime } from 'quickjs-emscripten'
import { createDebug } from './debug'
import fs from 'node:fs'
import path from 'node:path'

const debug = createDebug('signalk:quickjs-plugin-loader')

// Memoize the QuickJS module to avoid reloading it multiple times
const getQuickJS = memoizePromiseFactory(() => {
  const variant = newVariant({
    // Use the synchronous variant for simplicity
    type: 'sync'
  })
  return newQuickJSWASMModuleFromVariant(variant)
})

interface QuickJSPluginConfig {
  enabled: boolean
  configuration?: any
}

interface QuickJSPluginInstance {
  id: string
  name: string
  runtime: QuickJSRuntime
  context: QuickJSContext
  started: boolean
  config: QuickJSPluginConfig
}

/**
 * QuickJS Plugin Manager
 * Manages JavaScript plugins running in QuickJS WASM sandboxes
 */
export class QuickJSPluginManager {
  private plugins: Map<string, QuickJSPluginInstance> = new Map()
  private app: any

  constructor(app: any) {
    this.app = app
  }

  /**
   * Load a JavaScript plugin file into QuickJS
   */
  async loadPlugin(pluginId: string, pluginPath: string): Promise<void> {
    debug(`Loading QuickJS plugin: ${pluginId} from ${pluginPath}`)

    try {
      // Read the plugin JavaScript file
      const pluginCode = fs.readFileSync(pluginPath, 'utf-8')

      // Get QuickJS module
      const QuickJS = await getQuickJS()

      // Create a runtime and context for this plugin
      const runtime = QuickJS.newRuntime()
      
      // Set memory limit (16MB default)
      runtime.setMemoryLimit(16 * 1024 * 1024)
      
      // Set max stack size (512KB)
      runtime.setMaxStackSize(512 * 1024)

      const context = runtime.newContext()

      // Set up the Signal K API bridge
      this.setupSignalKAPI(context, pluginId)

      // Evaluate the plugin code
      const result = context.evalCode(pluginCode, pluginPath)
      
      if (result.error) {
        const error = context.dump(result.error)
        result.error.dispose()
        throw new Error(`Failed to load plugin: ${error}`)
      }
      result.value.dispose()

      // Get plugin metadata
      const nameHandle = context.evalCode('typeof plugin !== "undefined" && plugin.name ? plugin.name : "Unknown Plugin"')
      const name = nameHandle.error ? 'Unknown Plugin' : context.getString(nameHandle.value)
      nameHandle.value.dispose()

      // Store the plugin instance
      const instance: QuickJSPluginInstance = {
        id: pluginId,
        name,
        runtime,
        context,
        started: false,
        config: { enabled: false }
      }

      this.plugins.set(pluginId, instance)
      debug(`Successfully loaded QuickJS plugin: ${name}`)

    } catch (error) {
      debug(`Error loading QuickJS plugin ${pluginId}:`, error)
      throw error
    }
  }

  /**
   * Start a loaded plugin
   */
  async startPlugin(pluginId: string, config: any = {}): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      throw new Error(`Plugin ${pluginId} not loaded`)
    }

    if (instance.started) {
      debug(`Plugin ${pluginId} already started`)
      return
    }

    try {
      debug(`Starting QuickJS plugin: ${pluginId}`)

      // Pass configuration to the plugin
      const configJson = JSON.stringify(config)
      const configHandle = instance.context.newString(configJson)
      
      // Call plugin.start(config) if it exists
      const startResult = instance.context.evalCode(`
        (function() {
          if (typeof plugin !== 'undefined' && typeof plugin.start === 'function') {
            return plugin.start(${instance.context.dump(configHandle)})
          }
          return 0
        })()
      `)

      configHandle.dispose()

      if (startResult.error) {
        const error = instance.context.dump(startResult.error)
        startResult.error.dispose()
        throw new Error(`Plugin start failed: ${error}`)
      }

      const returnValue = instance.context.getNumber(startResult.value)
      startResult.value.dispose()

      if (returnValue !== 0) {
        throw new Error(`Plugin start returned error code: ${returnValue}`)
      }

      instance.started = true
      instance.config = { enabled: true, configuration: config }
      debug(`Successfully started QuickJS plugin: ${pluginId}`)

    } catch (error) {
      debug(`Error starting QuickJS plugin ${pluginId}:`, error)
      throw error
    }
  }

  /**
   * Stop a running plugin
   */
  async stopPlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      throw new Error(`Plugin ${pluginId} not found`)
    }

    if (!instance.started) {
      debug(`Plugin ${pluginId} not running`)
      return
    }

    try {
      debug(`Stopping QuickJS plugin: ${pluginId}`)

      // Call plugin.stop() if it exists
      const stopResult = instance.context.evalCode(`
        (function() {
          if (typeof plugin !== 'undefined' && typeof plugin.stop === 'function') {
            return plugin.stop()
          }
          return 0
        })()
      `)

      if (stopResult.error) {
        const error = instance.context.dump(stopResult.error)
        stopResult.error.dispose()
        debug(`Warning: Plugin stop failed: ${error}`)
      } else {
        stopResult.value.dispose()
      }

      instance.started = false
      instance.config.enabled = false
      debug(`Successfully stopped QuickJS plugin: ${pluginId}`)

    } catch (error) {
      debug(`Error stopping QuickJS plugin ${pluginId}:`, error)
      throw error
    }
  }

  /**
   * Unload a plugin and clean up resources
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      return
    }

    try {
      if (instance.started) {
        await this.stopPlugin(pluginId)
      }

      // Clean up QuickJS resources
      instance.context.dispose()
      instance.runtime.dispose()

      this.plugins.delete(pluginId)
      debug(`Unloaded QuickJS plugin: ${pluginId}`)

    } catch (error) {
      debug(`Error unloading QuickJS plugin ${pluginId}:`, error)
      throw error
    }
  }

  /**
   * Get plugin information
   */
  getPlugin(pluginId: string): QuickJSPluginInstance | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins(): QuickJSPluginInstance[] {
    return Array.from(this.plugins.values())
  }

  /**
   * Setup Signal K API bridge for a plugin context
   */
  private setupSignalKAPI(context: QuickJSContext, pluginId: string): void {
    // Create the signalk global object
    const signalkAPI = {
      debug: (msg: string) => {
        debug(`[${pluginId}] ${msg}`)
      },
      
      setStatus: (msg: string) => {
        this.app.setPluginStatus(pluginId, msg)
      },

      setError: (msg: string) => {
        this.app.setPluginError(pluginId, msg)
      },

      getSelfPath: (path: string) => {
        const value = this.app.getSelfPath(path)
        return value ? JSON.stringify(value) : null
      },

      getPath: (path: string) => {
        const value = this.app.getPath(path)
        return value ? JSON.stringify(value) : null
      },

      emit: (delta: string) => {
        try {
          const deltaObj = JSON.parse(delta)
          this.app.handleMessage(pluginId, deltaObj)
        } catch (e) {
          debug(`Error emitting delta from ${pluginId}:`, e)
        }
      },

      subscribe: (subscription: string) => {
        try {
          const subObj = JSON.parse(subscription)
          // TODO: Implement subscription management
          debug(`Subscription request from ${pluginId}:`, subObj)
        } catch (e) {
          debug(`Error subscribing from ${pluginId}:`, e)
        }
      }
    }

    // Inject the API functions into the context
    Object.entries(signalkAPI).forEach(([name, fn]) => {
      const fnHandle = context.newFunction(name, (...args) => {
        try {
          const jsArgs = args.map(arg => context.dump(arg))
          const result = fn(...jsArgs)
          if (result !== undefined && result !== null) {
            return context.newString(String(result))
          }
          return context.undefined
        } catch (error) {
          return context.newString(`Error: ${error}`)
        }
      })

      context.setProp(context.global, name, fnHandle)
      fnHandle.dispose()
    })

    // Create a signalk namespace object
    const signalkHandle = context.newObject()
    
    Object.entries(signalkAPI).forEach(([name, fn]) => {
      const fnHandle = context.newFunction(name, (...args) => {
        try {
          const jsArgs = args.map(arg => context.dump(arg))
          const result = fn(...jsArgs)
          if (result !== undefined && result !== null) {
            return context.newString(String(result))
          }
          return context.undefined
        } catch (error) {
          return context.newString(`Error: ${error}`)
        }
      })

      context.setProp(signalkHandle, name, fnHandle)
      fnHandle.dispose()
    })

    context.setProp(context.global, 'signalk', signalkHandle)
    signalkHandle.dispose()

    debug(`Signal K API bridge set up for plugin: ${pluginId}`)
  }

  /**
   * Shutdown all plugins
   */
  async shutdown(): Promise<void> {
    debug('Shutting down all QuickJS plugins')
    
    for (const [pluginId] of this.plugins) {
      try {
        await this.unloadPlugin(pluginId)
      } catch (error) {
        debug(`Error during shutdown of plugin ${pluginId}:`, error)
      }
    }
  }
}
