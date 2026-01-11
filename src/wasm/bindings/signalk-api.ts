/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Signal K API for Component Model plugins
 *
 * Provides the Signal K API interface for jco-transpiled Component Model plugins
 */

import Debug from 'debug'

const debug = Debug('signalk:wasm:signalk-api')

/**
 * Create Signal K API imports for a Component Model plugin
 *
 * Component Model plugins (e.g., from .NET or Rust wit-bindgen) use
 * a different import mechanism than WASI P1 plugins. This provides
 * the same Signal K functionality in a format they can use.
 */
export function createComponentSignalkApi(pluginId: string, app?: any) {
  return {
    // camelCase versions (for wit-bindgen style)
    skDebug: (message: string) => {
      debug(`[${pluginId}] ${message}`)
    },
    skSetStatus: (message: string) => {
      debug(`[${pluginId}] Status: ${message}`)
      if (app && app.setPluginStatus) {
        app.setPluginStatus(pluginId, message)
      }
    },
    skSetError: (message: string) => {
      debug(`[${pluginId}] Error: ${message}`)
      if (app && app.setPluginError) {
        app.setPluginError(pluginId, message)
      }
    },
    skHandleMessage: (deltaJson: string) => {
      debug(`[${pluginId}] Emitting delta: ${deltaJson.substring(0, 200)}...`)
      if (app && app.handleMessage) {
        try {
          const delta = JSON.parse(deltaJson)
          app.handleMessage(pluginId, delta)
        } catch (error) {
          debug(`Failed to parse delta JSON: ${error}`)
        }
      }
    },

    // kebab-case versions (for WIT interface style)
    'sk-debug': (message: string) => {
      debug(`[${pluginId}] ${message}`)
    },
    'sk-set-status': (message: string) => {
      debug(`[${pluginId}] Status: ${message}`)
      if (app && app.setPluginStatus) {
        app.setPluginStatus(pluginId, message)
      }
    },
    'sk-set-error': (message: string) => {
      debug(`[${pluginId}] Error: ${message}`)
      if (app && app.setPluginError) {
        app.setPluginError(pluginId, message)
      }
    },
    'sk-handle-message': (deltaJson: string) => {
      debug(`[${pluginId}] Emitting delta: ${deltaJson.substring(0, 200)}...`)
      if (app && app.handleMessage) {
        try {
          const delta = JSON.parse(deltaJson)
          app.handleMessage(pluginId, delta)
        } catch (error) {
          debug(`Failed to parse delta JSON: ${error}`)
        }
      }
    }
  }
}
