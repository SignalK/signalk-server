/**
 * WASM Plugin Type Definitions
 *
 * Shared types and interfaces for WASM plugin system
 */

import type { IRouter } from 'express'
import {
  WasmPluginInstance,
  WasmCapabilities,
  WasmFormat
} from '../wasm-runtime'

/**
 * JSON Schema type (subset for plugin configuration)
 */
export interface JSONSchema {
  type?: string
  title?: string
  description?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  default?: unknown
  [key: string]: unknown
}

/**
 * Plugin configuration object
 */
export type PluginConfiguration = Record<string, unknown>

/**
 * Plugin metadata extracted from package.json and manifest
 */
export interface WasmPluginMetadata {
  id: string
  name: string
  packageName: string
  version: string
  wasmManifest: string
  capabilities: WasmCapabilities
  packageLocation: string
}

/**
 * Runtime plugin instance with state and configuration
 */
export interface WasmPlugin {
  id: string
  name: string
  type: 'wasm'
  packageName: string
  version: string
  enabled: boolean
  enableDebug: boolean
  keywords: string[]
  packageLocation: string
  configPath: string // Signal K config path for VFS/storage
  metadata: WasmPluginMetadata
  instance?: WasmPluginInstance
  router?: IRouter // Express router for plugin routes
  status: 'stopped' | 'starting' | 'running' | 'error' | 'crashed'
  statusMessage?: string
  errorMessage?: string
  schema?: JSONSchema
  configuration?: PluginConfiguration
  crashCount: number
  lastCrash?: Date
  restartBackoff: number // milliseconds
  description?: string
  state?: string
  format?: WasmFormat // Binary format: wasi-p1 or component-model
}
