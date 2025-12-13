/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Component Model Loader
 *
 * Loads WASI Component Model plugins using jco transpilation
 */

import * as fs from 'fs'
import * as path from 'path'
import Debug from 'debug'
import { WasmPluginInstance, WasmCapabilities } from '../types'
import { createComponentSignalkApi } from '../bindings/signalk-api'
import { updateResourceProviderInstance } from '../bindings/resource-provider'
import { updateWeatherProviderInstance } from '../bindings/weather-provider'
import { updateRadarProviderInstance } from '../bindings/radar-provider'

const debug = Debug('signalk:wasm:loader:component')

// Try to use native Node.js WASI first, fall back to @wasmer/wasi
let WASI: any
try {
  WASI = require('node:wasi').WASI
} catch {
  WASI = require('@wasmer/wasi').WASI
}

/**
 * Load a WASI Component Model plugin using jco transpilation
 *
 * Component Model binaries (e.g., from .NET 10) cannot be loaded directly
 * by Node.js WASI. We use jco to transpile them to JavaScript + WASI P1.
 */
export async function loadComponentModelPlugin(
  pluginId: string,
  wasmPath: string,
  wasmBuffer: Buffer,
  vfsRoot: string,
  capabilities: WasmCapabilities,
  app?: any
): Promise<WasmPluginInstance> {
  debug(`Loading Component Model plugin: ${pluginId}`)

  try {
    // Import jco transpile dynamically
    const { transpile } = await import('@bytecodealliance/jco')

    // Transpile the Component Model WASM to JavaScript bindings
    debug(`Transpiling Component Model to JavaScript...`)

    // Get the output directory for transpiled files
    const transpiledDir = path.join(
      path.dirname(wasmPath),
      '.jco-transpiled',
      pluginId
    )
    if (!fs.existsSync(transpiledDir)) {
      fs.mkdirSync(transpiledDir, { recursive: true })
    }

    // Transpile the component
    const { files } = await transpile(wasmBuffer, {
      name: pluginId.replace(/[^a-zA-Z0-9]/g, '_'),
      instantiation: 'async',
      map: {
        'wasi:cli/*': '@bytecodealliance/preview2-shim/cli#*',
        'wasi:clocks/*': '@bytecodealliance/preview2-shim/clocks#*',
        'wasi:filesystem/*': '@bytecodealliance/preview2-shim/filesystem#*',
        'wasi:io/*': '@bytecodealliance/preview2-shim/io#*',
        'wasi:random/*': '@bytecodealliance/preview2-shim/random#*',
        'wasi:sockets/*': '@bytecodealliance/preview2-shim/sockets#*'
      }
    })

    // Write transpiled files to disk
    for (const [filename, content] of Object.entries(files)) {
      const filePath = path.join(transpiledDir, filename)
      const fileDir = path.dirname(filePath)
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true })
      }
      fs.writeFileSync(filePath, content as Uint8Array)
      debug(`Wrote transpiled file: ${filePath}`)
    }

    // Find the main module file
    const mainModulePath = path.join(
      transpiledDir,
      `${pluginId.replace(/[^a-zA-Z0-9]/g, '_')}.js`
    )
    if (!fs.existsSync(mainModulePath)) {
      const jsFiles = Object.keys(files).filter(
        (f) => f.endsWith('.js') && !f.endsWith('.d.ts')
      )
      if (jsFiles.length === 0) {
        throw new Error('No JavaScript module found in transpiled output')
      }
      debug(`Available JS files: ${jsFiles.join(', ')}`)
    }

    // Import the transpiled module
    debug(`Importing transpiled module from: ${mainModulePath}`)
    const componentModule = await import(`file://${mainModulePath}`)

    // Create imports for the component - provide Signal K API
    const signalkApi = createComponentSignalkApi(pluginId, app)

    // Instantiate the component with imports
    debug(`Instantiating component...`)
    let componentInstance: any

    if (typeof componentModule.instantiate === 'function') {
      componentInstance = await componentModule.instantiate((name: string) => {
        if (name.startsWith('signalk:plugin/signalk-api')) {
          return signalkApi
        }
        return {}
      })
    } else {
      componentInstance = componentModule
    }

    debug(`Component instance created`)

    // Extract plugin interface exports
    const pluginExports =
      componentInstance['signalk:plugin/plugin@1.0.0'] ||
      componentInstance.plugin ||
      componentInstance

    // Map Component Model exports to our standard interface
    const exports = {
      id: () => {
        const result =
          pluginExports.pluginId?.() || pluginExports['plugin-id']?.()
        return result || pluginId
      },
      name: () => {
        const result =
          pluginExports.pluginName?.() || pluginExports['plugin-name']?.()
        return result || pluginId
      },
      schema: () => {
        const result =
          pluginExports.pluginSchema?.() || pluginExports['plugin-schema']?.()
        return result || '{}'
      },
      start: async (config: string) => {
        const fn = pluginExports.pluginStart || pluginExports['plugin-start']
        if (fn) {
          const result = await fn(config)
          return typeof result === 'number' ? result : 0
        }
        return 0
      },
      stop: () => {
        const fn = pluginExports.pluginStop || pluginExports['plugin-stop']
        if (fn) {
          const result = fn()
          return typeof result === 'number' ? result : 0
        }
        return 0
      }
    }

    // Create a minimal WASI instance for compatibility
    const wasi = new WASI({
      version: 'preview1',
      env: { PLUGIN_ID: pluginId },
      args: [],
      preopens: { '/': vfsRoot }
    })

    // Create plugin instance
    const pluginInstance: WasmPluginInstance = {
      pluginId,
      wasmPath,
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

    debug(`Successfully loaded Component Model plugin: ${pluginId}`)
    return pluginInstance
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    debug(`Failed to load Component Model plugin ${pluginId}: ${errorMsg}`)
    if (error instanceof Error && error.stack) {
      debug(`Stack trace: ${error.stack}`)
    }
    throw new Error(
      `Failed to load Component Model plugin ${pluginId}: ${errorMsg}`
    )
  }
}
