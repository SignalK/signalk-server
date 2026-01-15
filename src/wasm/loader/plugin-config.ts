/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WASM Plugin Configuration Management
 *
 * Handles plugin configuration updates and enabled state changes.
 * Persists configuration to disk and manages plugin state transitions.
 */

import Debug from 'debug'
import { wasmPlugins } from './plugin-registry'
import { startWasmPlugin, stopWasmPlugin } from './plugin-lifecycle'
import { getPluginStoragePaths, writePluginConfig } from '../wasm-storage'

const debug = Debug('signalk:wasm:loader')

/**
 * Update WASM plugin configuration
 */
export async function updateWasmPluginConfig(
  app: any,
  pluginId: string,
  configuration: any,
  configPath: string
): Promise<void> {
  const plugin = wasmPlugins.get(pluginId)
  if (!plugin) {
    throw new Error(`WASM plugin ${pluginId} not found`)
  }

  debug(`updateWasmPluginConfig: Starting for ${pluginId}`)
  debug(
    `updateWasmPluginConfig: New configuration: ${JSON.stringify(configuration)}`
  )

  plugin.configuration = configuration
  debug(`updateWasmPluginConfig: Updated in-memory configuration`)

  // Save to disk
  const storagePaths = getPluginStoragePaths(
    configPath,
    plugin.id,
    plugin.packageName
  )
  debug(`updateWasmPluginConfig: Config file path: ${storagePaths.configFile}`)

  const config = {
    configuration: configuration ?? {}, // Ensure configuration is always an object, never undefined
    enabled: plugin.enabled,
    enableDebug: plugin.enableDebug
  }
  debug(
    `updateWasmPluginConfig: Writing config to disk: ${JSON.stringify(config)}`
  )
  writePluginConfig(storagePaths.configFile, config)
  debug(`updateWasmPluginConfig: Config written to disk`)

  // Restart plugin if running AND still enabled
  // Don't restart if the plugin is being disabled
  if (plugin.status === 'running' && plugin.enabled) {
    debug(
      `updateWasmPluginConfig: Plugin is running and enabled, restarting...`
    )
    await stopWasmPlugin(pluginId)
    debug(`updateWasmPluginConfig: Plugin stopped`)
    await startWasmPlugin(app, pluginId)
    debug(`updateWasmPluginConfig: Plugin started`)
    plugin.statusMessage = 'Configuration updated'
  } else {
    debug(
      `updateWasmPluginConfig: Plugin not running (status: ${plugin.status}) or not enabled (enabled: ${plugin.enabled}), skipping restart`
    )
  }

  debug(`updateWasmPluginConfig: Configuration updated for ${pluginId}`)
}

/**
 * Enable/disable a WASM plugin
 */
export async function setWasmPluginEnabled(
  app: any,
  pluginId: string,
  enabled: boolean,
  configPath: string
): Promise<void> {
  const plugin = wasmPlugins.get(pluginId)
  if (!plugin) {
    throw new Error(`WASM plugin ${pluginId} not found`)
  }

  debug(`setWasmPluginEnabled: Starting for ${pluginId}, enabled=${enabled}`)
  debug(
    `setWasmPluginEnabled: Current state - enabled: ${plugin.enabled}, status: ${plugin.status}`
  )

  plugin.enabled = enabled
  debug(`setWasmPluginEnabled: Updated in-memory enabled flag to ${enabled}`)

  // Save to disk
  const storagePaths = getPluginStoragePaths(
    configPath,
    plugin.id,
    plugin.packageName
  )
  debug(`setWasmPluginEnabled: Config file path: ${storagePaths.configFile}`)

  const config = {
    configuration: plugin.configuration ?? {}, // Ensure configuration is always an object, never undefined
    enabled,
    enableDebug: plugin.enableDebug
  }
  debug(
    `setWasmPluginEnabled: Writing config to disk: ${JSON.stringify(config)}`
  )
  writePluginConfig(storagePaths.configFile, config)
  debug(`setWasmPluginEnabled: Config written to disk`)

  // Start or stop accordingly
  if (enabled && plugin.status !== 'running') {
    debug(
      `setWasmPluginEnabled: Plugin should be enabled and is not running, starting...`
    )
    await startWasmPlugin(app, pluginId)
    debug(`setWasmPluginEnabled: Plugin started, new status: ${plugin.status}`)
  } else if (!enabled && plugin.status === 'running') {
    debug(
      `setWasmPluginEnabled: Plugin should be disabled and is running, stopping...`
    )
    await stopWasmPlugin(pluginId)
    debug(`setWasmPluginEnabled: Plugin stopped, new status: ${plugin.status}`)
  } else {
    debug(
      `setWasmPluginEnabled: No action needed - enabled=${enabled}, status=${plugin.status}`
    )
  }

  debug(
    `setWasmPluginEnabled: Completed - Plugin ${pluginId} ${enabled ? 'enabled' : 'disabled'}`
  )
}
