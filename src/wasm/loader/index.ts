/**
 * WASM Plugin Loader - Main Entry Point
 *
 * Central export module for the WASM plugin loader subsystem.
 * This is the single entry point that re-exports all public APIs from the loader modules.
 */

// Import lifecycle functions first
import {
  startWasmPlugin,
  stopWasmPlugin,
  unloadWasmPlugin,
  reloadWasmPlugin,
  handleWasmPluginCrash,
  shutdownAllWasmPlugins
} from './plugin-lifecycle'

import { updateWasmPluginConfig, setWasmPluginEnabled } from './plugin-config'

// Initialize circular dependency resolution
import { initializeLifecycleFunctions } from './plugin-registry'
initializeLifecycleFunctions(
  startWasmPlugin,
  updateWasmPluginConfig,
  stopWasmPlugin
)

// Export types
export * from './types'

// Export registry functions and maps
export {
  wasmPlugins,
  restartTimers,
  setPluginStatus,
  registerWasmPlugin,
  getAllWasmPlugins,
  getWasmPlugin
} from './plugin-registry'

// Export lifecycle functions
export {
  startWasmPlugin,
  stopWasmPlugin,
  unloadWasmPlugin,
  reloadWasmPlugin,
  handleWasmPluginCrash,
  shutdownAllWasmPlugins
}

// Export configuration functions
export { updateWasmPluginConfig, setWasmPluginEnabled }

// Export route setup functions
export {
  backwardsCompat,
  handleLogViewerRequest,
  setupPluginSpecificRoutes,
  setupWasmPluginRoutes
} from './plugin-routes'
