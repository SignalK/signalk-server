/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * JCO Pre-Transpiled Loader
 *
 * Loads pre-transpiled jco JavaScript modules (already converted from Component Model)
 */

import * as fs from 'fs'
import * as path from 'path'
import Debug from 'debug'
import { WasmPluginInstance, WasmCapabilities } from '../types'
import { createComponentSignalkApi } from '../bindings/signalk-api'
import { updateResourceProviderInstance } from '../bindings/resource-provider'
import { updateWeatherProviderInstance } from '../bindings/weather-provider'
import { updateRadarProviderInstance } from '../bindings/radar-provider'

const debug = Debug('signalk:wasm:loader:jco')

// Try to use native Node.js WASI first, fall back to @wasmer/wasi
let WASI: any
try {
  WASI = require('node:wasi').WASI
} catch {
  WASI = require('@wasmer/wasi').WASI
}

/**
 * Load a pre-transpiled jco plugin (JavaScript module)
 *
 * When wasmManifest points to a .js file, it's a pre-transpiled jco output
 * that we can load directly as a JavaScript module.
 */
export async function loadJcoPlugin(
  pluginId: string,
  jsPath: string,
  vfsRoot: string,
  capabilities: WasmCapabilities,
  app?: any
): Promise<WasmPluginInstance> {
  debug(`Loading pre-transpiled jco plugin: ${pluginId} from ${jsPath}`)

  try {
    // Convert to file:// URL for dynamic import on Windows/Unix
    const jsUrl = `file://${jsPath.replace(/\\/g, '/')}`
    debug(`Importing module from: ${jsUrl}`)

    // Create Signal K API callbacks for the plugin
    const signalkApi = createComponentSignalkApi(pluginId, app)

    // Try to load and inject callbacks into signalk-api.js before loading main module
    const signalkApiPath = path.join(path.dirname(jsPath), 'signalk-api.js')
    if (fs.existsSync(signalkApiPath)) {
      const signalkApiUrl = `file://${signalkApiPath.replace(/\\/g, '/')}`
      debug(`Injecting Signal K API callbacks from: ${signalkApiUrl}`)
      try {
        const signalkApiModule = await import(signalkApiUrl)
        if (typeof signalkApiModule._setCallbacks === 'function') {
          signalkApiModule._setCallbacks({
            debug: signalkApi.skDebug || signalkApi['sk-debug'],
            setStatus: signalkApi.skSetStatus || signalkApi['sk-set-status'],
            setError: signalkApi.skSetError || signalkApi['sk-set-error'],
            handleMessage:
              signalkApi.skHandleMessage || signalkApi['sk-handle-message']
          })
          debug(`Signal K API callbacks injected successfully`)
        }
      } catch (apiErr) {
        debug(`Could not inject signalk-api callbacks: ${apiErr}`)
      }
    }

    // Import the pre-transpiled module
    const componentModule = await import(jsUrl)
    debug(
      `Module imported, exports: ${Object.keys(componentModule).join(', ')}`
    )

    // Wait for WASM initialization if $init is exported (jco --tla-compat mode)
    if (
      componentModule.$init &&
      typeof componentModule.$init.then === 'function'
    ) {
      debug(`Waiting for WASM $init promise...`)
      try {
        await componentModule.$init
        debug(`WASM $init completed successfully`)
      } catch (initError) {
        debug(`WASM $init failed: ${initError}`)
        throw initError
      }
    }

    // Debug: Log all exports from the componentModule after $init
    debug(
      `After $init, componentModule keys: ${Object.keys(componentModule).join(', ')}`
    )
    if (componentModule.plugin) {
      debug(
        `componentModule.plugin keys: ${Object.keys(componentModule.plugin).join(', ')}`
      )
      const pluginFuncs = componentModule.plugin
      debug(
        `pluginId type: ${typeof pluginFuncs.pluginId}, value: ${pluginFuncs.pluginId}`
      )
      debug(
        `pluginName type: ${typeof pluginFuncs.pluginName}, value: ${pluginFuncs.pluginName}`
      )
      debug(
        `pluginStart type: ${typeof pluginFuncs.pluginStart}, value: ${pluginFuncs.pluginStart}`
      )
    }

    // Instantiate the component
    let componentInstance: any

    if (typeof componentModule.instantiate === 'function') {
      debug(`Instantiating via instantiate() function`)
      componentInstance = await componentModule.instantiate(
        (name: string) => {
          debug(`Import resolver called for: ${name}`)
          if (name.includes('signalk')) {
            return signalkApi
          }
          return {}
        },
        async (coreModule: string) => {
          const corePath = path.join(path.dirname(jsPath), coreModule)
          debug(`Loading core module: ${corePath}`)
          const coreBuffer = fs.readFileSync(corePath)
          return WebAssembly.compile(coreBuffer)
        }
      )
    } else if (componentModule.default) {
      componentInstance = componentModule.default
    } else {
      componentInstance = componentModule
    }

    debug(
      `Component instance created, keys: ${Object.keys(componentInstance || {}).join(', ')}`
    )

    // Find the plugin exports
    const pluginExports =
      componentInstance?.['signalk:plugin/plugin@1.0.0'] ||
      componentInstance?.plugin ||
      componentInstance?.['signalk:plugin/plugin'] ||
      componentInstance

    debug(
      `Plugin exports found, keys: ${Object.keys(pluginExports || {}).join(', ')}`
    )

    // Map Component Model exports to our standard interface
    const exports = {
      id: () => {
        const fn = pluginExports?.pluginId || pluginExports?.['plugin-id']
        debug(`Calling pluginId, fn type: ${typeof fn}`)
        try {
          const result = typeof fn === 'function' ? fn() : fn
          debug(`plugin_id() = ${result}`)
          return result || pluginId
        } catch (err) {
          debug(`plugin_id() threw error: ${err}`)
          throw err
        }
      },
      name: () => {
        const fn = pluginExports?.pluginName || pluginExports?.['plugin-name']
        const result = typeof fn === 'function' ? fn() : fn
        debug(`plugin_name() = ${result}`)
        return result || pluginId
      },
      schema: () => {
        const fn =
          pluginExports?.pluginSchema || pluginExports?.['plugin-schema']
        const result = typeof fn === 'function' ? fn() : fn
        debug(`plugin_schema() = ${result}`)
        return result || '{}'
      },
      start: async (config: string) => {
        const fn = pluginExports?.pluginStart || pluginExports?.['plugin-start']
        if (typeof fn === 'function') {
          debug(
            `Calling plugin_start with config: ${config.substring(0, 100)}...`
          )
          const result = await fn(config)
          debug(`plugin_start() = ${result}`)
          return typeof result === 'number' ? result : 0
        }
        debug(`No plugin_start function found`)
        return 0
      },
      stop: () => {
        const fn = pluginExports?.pluginStop || pluginExports?.['plugin-stop']
        if (typeof fn === 'function') {
          debug(`Calling plugin_stop`)
          const result = fn()
          debug(`plugin_stop() = ${result}`)
          return typeof result === 'number' ? result : 0
        }
        debug(`No plugin_stop function found`)
        return 0
      }
    }

    // Create a minimal WASI instance for compatibility tracking
    const wasi = new WASI({
      version: 'preview1',
      env: { PLUGIN_ID: pluginId },
      args: [],
      preopens: { '/': vfsRoot }
    })

    // Create plugin instance
    const pluginInstance: WasmPluginInstance = {
      pluginId,
      wasmPath: jsPath,
      vfsRoot,
      capabilities,
      format: 'component-model',
      wasi,
      module: null as any,
      instance: null as any,
      exports,
      componentModule: componentInstance
    }

    // Update provider references
    updateResourceProviderInstance(pluginId, pluginInstance)
    updateWeatherProviderInstance(pluginId, pluginInstance)
    updateRadarProviderInstance(pluginId, pluginInstance)

    debug(`Successfully loaded pre-transpiled jco plugin: ${pluginId}`)
    return pluginInstance
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    debug(`Failed to load pre-transpiled plugin ${pluginId}: ${errorMsg}`)
    if (error instanceof Error && error.stack) {
      debug(`Stack: ${error.stack}`)
    }
    throw new Error(
      `Failed to load pre-transpiled plugin ${pluginId}: ${errorMsg}`
    )
  }
}
