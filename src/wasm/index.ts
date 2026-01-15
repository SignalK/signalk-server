/**
 * Signal K WASM Plugin System
 *
 * Main entry point for WASM/WASIX plugin infrastructure.
 * Exports all public APIs for WASM plugin management.
 */

import { WasmRuntime, initializeWasmRuntime } from './wasm-runtime'
import {
  WasmSubscriptionManager,
  initializeSubscriptionManager
} from './wasm-subscriptions'

/**
 * Initialize the WASM subsystem
 * Returns both runtime and subscription manager for assignment to app
 */
export function initializeWasm(): {
  wasmRuntime: WasmRuntime
  wasmSubscriptionManager: WasmSubscriptionManager
} {
  return {
    wasmRuntime: initializeWasmRuntime(),
    wasmSubscriptionManager: initializeSubscriptionManager()
  }
}

// Runtime
export {
  WasmRuntime,
  WasmPluginInstance,
  WasmCapabilities,
  getWasmRuntime,
  initializeWasmRuntime
} from './wasm-runtime'

// Storage
export {
  PluginStoragePaths,
  getPluginStoragePaths,
  initializePluginVfs,
  readPluginConfig,
  writePluginConfig,
  migrateFromNodeJs,
  cleanupVfsTmp,
  getVfsDiskUsage,
  deletePluginVfs
} from './wasm-storage'

// Loader
export {
  WasmPluginMetadata,
  WasmPlugin,
  registerWasmPlugin,
  startWasmPlugin,
  stopWasmPlugin,
  unloadWasmPlugin,
  reloadWasmPlugin,
  handleWasmPluginCrash,
  updateWasmPluginConfig,
  setWasmPluginEnabled,
  getAllWasmPlugins,
  getWasmPlugin,
  shutdownAllWasmPlugins
} from './loader'

// ServerAPI Bridge
export {
  ServerAPIBridge,
  createServerAPIBridge,
  createWasmImports,
  callWasmExport
} from './wasm-serverapi'

// Subscriptions
export {
  DeltaSubscription,
  Delta,
  getSubscriptionManager,
  initializeSubscriptionManager
} from './wasm-subscriptions'
