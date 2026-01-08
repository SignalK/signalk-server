/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WASM ServerAPI FFI Bridge
 *
 * Provides the FFI (Foreign Function Interface) bridge between WASM plugins
 * and the Signal K ServerAPI. Enforces capability restrictions and handles
 * serialization across the WASM boundary.
 */

/// <reference lib="webworker" />

import Debug from 'debug'
import { SKVersion } from '@signalk/server-api'
import { getWasmPlugin } from './loader'
import {
  getPluginStoragePaths,
  readPluginConfig,
  writePluginConfig
} from './wasm-storage'

const debug = Debug('signalk:wasm:serverapi')

export interface ServerAPIBridge {
  app: any
  configPath: string
}

/**
 * Create ServerAPI FFI functions for a WASM plugin
 *
 * These functions will be imported by the WASM module and provide
 * access to Signal K server capabilities based on declared permissions.
 */
export function createServerAPIBridge(
  app: any,
  pluginId: string,
  configPath: string
): any {
  const plugin = getWasmPlugin(pluginId)
  if (!plugin) {
    throw new Error(`Plugin ${pluginId} not found`)
  }

  const capabilities = plugin.metadata.capabilities

  return {
    // Delta Handler API
    'delta-handler': {
      /**
       * Handle delta message from plugin
       *
       * @param pluginIdParam - Plugin identifier
       * @param deltaJson - Delta message as JSON string
       * @param version - Signal K version: 1 = v1 (default), 2 = v2
       *
       * Plugins should use v1 for regular navigation data.
       * Use v2 for Course API paths and other v2-specific data.
       */
      handleMessage: (
        pluginIdParam: string,
        deltaJson: string,
        version: number = 1
      ) => {
        if (!capabilities.dataWrite) {
          throw new Error(`Plugin ${pluginId} lacks dataWrite capability`)
        }

        try {
          const delta = JSON.parse(deltaJson)
          const skVersion = version === 2 ? SKVersion.v2 : SKVersion.v1
          debug(`Plugin ${pluginId} emitting delta (${skVersion}):`, delta)

          // Forward to server's handleMessage with version
          if (app.handleMessage) {
            app.handleMessage(pluginId, delta, skVersion)
          } else {
            debug('Warning: app.handleMessage not available')
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error)
          debug(`Error handling delta from ${pluginId}: ${errorMsg}`)
          throw error
        }
      }
    },

    // Plugin Config API
    'plugin-config': {
      /**
       * Read plugin configuration
       */
      readPluginOptions: (): string => {
        const storagePaths = getPluginStoragePaths(
          configPath,
          pluginId,
          plugin.packageName
        )
        const config = readPluginConfig(storagePaths.configFile)
        return JSON.stringify(config.configuration || {})
      },

      /**
       * Save plugin configuration
       */
      savePluginOptions: (configJson: string): number => {
        try {
          const configuration = JSON.parse(configJson)
          const storagePaths = getPluginStoragePaths(
            configPath,
            pluginId,
            plugin.packageName
          )
          const config = {
            enabled: plugin.enabled,
            configuration
          }
          writePluginConfig(storagePaths.configFile, config)
          plugin.configuration = configuration
          debug(`Plugin ${pluginId} saved configuration`)
          return 0 // Success
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error)
          debug(`Error saving config for ${pluginId}: ${errorMsg}`)
          return 1 // Error
        }
      },

      /**
       * Get data directory path (VFS root from plugin perspective)
       */
      getDataDirPath: (): string => {
        // Plugin sees "/" as its VFS root
        return '/'
      }
    },

    // Plugin Status API
    'plugin-status': {
      /**
       * Set plugin status message
       */
      setPluginStatus: (message: string) => {
        plugin.statusMessage = message
        debug(`Plugin ${pluginId} status: ${message}`)

        // Update in app status if available
        if (app.setPluginStatus) {
          app.setPluginStatus(pluginId, message)
        }
      },

      /**
       * Set plugin error message
       */
      setPluginError: (message: string) => {
        plugin.errorMessage = message
        plugin.status = 'error'
        debug(`Plugin ${pluginId} error: ${message}`)

        // Update in app status if available
        if (app.setPluginError) {
          app.setPluginError(pluginId, message)
        }
      },

      /**
       * Debug logging
       */
      debug: (message: string) => {
        debug(`[${pluginId}] ${message}`)
      },

      /**
       * Error logging
       */
      error: (message: string) => {
        debug(`[${pluginId}] ERROR: ${message}`)
      }
    },

    // Full Model API (Signal K full data model access)
    'full-model': {
      /**
       * Get data from vessel.self path
       */
      getSelfPath: (path: string): string | null => {
        if (!capabilities.dataRead) {
          throw new Error(`Plugin ${pluginId} lacks dataRead capability`)
        }

        try {
          const value = app.getSelfPath ? app.getSelfPath(path) : undefined
          return value !== undefined ? JSON.stringify(value) : null
        } catch (error) {
          debug(`Error getting self path ${path} for ${pluginId}:`, error)
          return null
        }
      },

      /**
       * Get data from any context path
       */
      getPath: (path: string): string | null => {
        if (!capabilities.dataRead) {
          throw new Error(`Plugin ${pluginId} lacks dataRead capability`)
        }

        try {
          const value = app.getPath ? app.getPath(path) : undefined
          return value !== undefined ? JSON.stringify(value) : null
        } catch (error) {
          debug(`Error getting path ${path} for ${pluginId}:`, error)
          return null
        }
      }
    }
  }
}

/**
 * Create WASM import object with ServerAPI functions
 *
 * This generates the WebAssembly imports that will be available to the plugin.
 * In Phase 1, we use a simplified approach. Full WIT bindings will be added later.
 */
export function createWasmImports(
  app: any,
  pluginId: string,
  configPath: string
): WebAssembly.Imports {
  const bridge = createServerAPIBridge(app, pluginId, configPath)

  // Create flat import object for WASM
  // Note: This is a simplified version for Phase 1
  // Full WIT integration will provide proper type-safe bindings
  return {
    env: {
      // Delta handling
      sk_handle_message: (
        deltaPtr: number,
        deltaLen: number,
        memory: WebAssembly.Memory
      ) => {
        const deltaJson = readStringFromMemory(memory, deltaPtr, deltaLen)
        bridge['delta-handler'].handleMessage(pluginId, deltaJson)
      },

      // Configuration
      sk_read_config: (
        bufPtr: number,
        bufLen: number,
        memory: WebAssembly.Memory
      ): number => {
        const configJson = bridge['plugin-config'].readPluginOptions()
        return writeStringToMemory(memory, bufPtr, bufLen, configJson)
      },

      sk_save_config: (
        configPtr: number,
        configLen: number,
        memory: WebAssembly.Memory
      ): number => {
        const configJson = readStringFromMemory(memory, configPtr, configLen)
        return bridge['plugin-config'].savePluginOptions(configJson)
      },

      // Status
      sk_set_status: (
        msgPtr: number,
        msgLen: number,
        memory: WebAssembly.Memory
      ) => {
        const message = readStringFromMemory(memory, msgPtr, msgLen)
        bridge['plugin-status'].setPluginStatus(message)
      },

      sk_set_error: (
        msgPtr: number,
        msgLen: number,
        memory: WebAssembly.Memory
      ) => {
        const message = readStringFromMemory(memory, msgPtr, msgLen)
        bridge['plugin-status'].setPluginError(message)
      },

      sk_debug: (
        msgPtr: number,
        msgLen: number,
        memory: WebAssembly.Memory
      ) => {
        const message = readStringFromMemory(memory, msgPtr, msgLen)
        bridge['plugin-status'].debug(message)
      },

      // Data model
      sk_get_self_path: (
        pathPtr: number,
        pathLen: number,
        bufPtr: number,
        bufLen: number,
        memory: WebAssembly.Memory
      ): number => {
        const path = readStringFromMemory(memory, pathPtr, pathLen)
        const value = bridge['full-model'].getSelfPath(path)
        if (value === null) {
          return 0 // Not found
        }
        return writeStringToMemory(memory, bufPtr, bufLen, value)
      },

      sk_get_path: (
        pathPtr: number,
        pathLen: number,
        bufPtr: number,
        bufLen: number,
        memory: WebAssembly.Memory
      ): number => {
        const path = readStringFromMemory(memory, pathPtr, pathLen)
        const value = bridge['full-model'].getPath(path)
        if (value === null) {
          return 0 // Not found
        }
        return writeStringToMemory(memory, bufPtr, bufLen, value)
      }
    }
  }
}

/**
 * Read a string from WASM memory
 */
function readStringFromMemory(
  memory: WebAssembly.Memory,
  ptr: number,
  len: number
): string {
  const buffer = new Uint8Array(memory.buffer, ptr, len)
  const decoder = new TextDecoder()
  return decoder.decode(buffer)
}

/**
 * Write a string to WASM memory
 * Returns the number of bytes written, or 0 if buffer too small
 */
function writeStringToMemory(
  memory: WebAssembly.Memory,
  ptr: number,
  maxLen: number,
  str: string
): number {
  const encoder = new TextEncoder()
  const encoded = encoder.encode(str)

  if (encoded.length > maxLen) {
    debug(`Buffer too small: need ${encoded.length}, have ${maxLen}`)
    return 0
  }

  const buffer = new Uint8Array(memory.buffer, ptr, maxLen)
  buffer.set(encoded)

  return encoded.length
}

/**
 * Call a WASM plugin export with error handling
 */
export function callWasmExport<T>(
  pluginId: string,
  exportName: string,
  ...args: any[]
): T {
  const plugin = getWasmPlugin(pluginId)
  if (!plugin || !plugin.instance) {
    throw new Error(`Plugin ${pluginId} not loaded`)
  }

  try {
    const exportFn = (plugin.instance.exports as any)[exportName]
    if (typeof exportFn !== 'function') {
      throw new Error(`Export ${exportName} not found or not a function`)
    }

    return exportFn(...args) as T
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    debug(`Error calling ${exportName} on ${pluginId}: ${errorMsg}`)
    throw error
  }
}
