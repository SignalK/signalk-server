/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Standard WASM Loader
 *
 * Loads WASI P1 plugins (AssemblyScript and Rust library plugins)
 */

import * as fs from 'fs'
import Debug from 'debug'
import loader from '@assemblyscript/loader'
import { WasmPluginInstance, WasmCapabilities } from '../types'
import { createEnvImports } from '../bindings/env-imports'
import { updateResourceProviderInstance } from '../bindings/resource-provider'
import { updateWeatherProviderInstance } from '../bindings/weather-provider'
import { updateRadarProviderInstance } from '../bindings/radar-provider'
import { getNodeFetch } from '../utils/fetch-wrapper'

const debug = Debug('signalk:wasm:loader:standard')

// Use Node.js built-in WASI (Node 20+ required)

const { WASI } = require('node:wasi')

/**
 * Load a standard WASI P1 plugin (AssemblyScript or Rust library)
 */
export async function loadStandardPlugin(
  pluginId: string,
  wasmPath: string,
  wasmBuffer: Buffer,
  vfsRoot: string,
  capabilities: WasmCapabilities,
  app?: any
): Promise<WasmPluginInstance> {
  debug(`Loading standard WASM plugin: ${pluginId} from ${wasmPath}`)

  // Create WASI instance with VFS isolation
  debug(`Creating WASI instance for ${pluginId}`)
  const wasi = new WASI({
    version: 'preview1',
    env: { PLUGIN_ID: pluginId },
    args: [],
    preopens: { '/': vfsRoot }
  })
  debug(`WASI instance created`)

  // Compile WASM module
  debug(`Compiling WASM module for inspection...`)
  let module: WebAssembly.Module
  try {
    module = await WebAssembly.compile(wasmBuffer as BufferSource)
    debug(`WASM module compiled successfully`)
  } catch (compileError) {
    debug(`WASM compilation failed: ${compileError}`)
    throw compileError
  }

  // Inspect module to determine plugin type
  const imports = WebAssembly.Module.imports(module)
  const moduleExports = WebAssembly.Module.exports(module)
  debug(`Module has ${imports.length} imports, ${moduleExports.length} exports`)
  debug(
    `Module imports: ${JSON.stringify(imports.map((i) => `${i.module}.${i.name}`).slice(0, 20))}`
  )

  // Detect plugin type
  // Note: plugin_id is optional since ID can be derived from package.json name
  const hasPluginId = moduleExports.some((e) => e.name === 'plugin_id')
  const hasPluginName = moduleExports.some((e) => e.name === 'plugin_name')
  const hasPluginStart = moduleExports.some((e) => e.name === 'plugin_start')
  const hasAllocate = moduleExports.some((e) => e.name === 'allocate')
  const hasStart = moduleExports.some((e) => e.name === '_start')

  const isRustLibraryPlugin = hasPluginId && hasAllocate
  const isRustPlugin = hasStart
  // AssemblyScript plugins must have plugin_name and plugin_start (plugin_id is optional)
  const isAssemblyScriptPlugin =
    (hasPluginId || (hasPluginName && hasPluginStart)) &&
    !hasAllocate &&
    !hasStart

  debug(
    `Plugin type detection: AS=${isAssemblyScriptPlugin}, RustLib=${isRustLibraryPlugin}, RustCmd=${isRustPlugin}`
  )

  // Get WASI imports
  const wasiImports = (
    wasi.getImportObject ? wasi.getImportObject() : wasi.getImports(module)
  ) as any
  debug(`Got WASI imports`)

  // Refs that will be populated after instantiation
  const memoryRef: { current: WebAssembly.Memory | null } = { current: null }
  const rawExportsRef: { current: any } = { current: null }
  const asLoaderRef: { current: any } = { current: null }

  // Create environment imports
  const envImports = createEnvImports({
    pluginId,
    capabilities,
    app,
    memoryRef,
    rawExports: rawExportsRef,
    asLoaderInstance: asLoaderRef
  })

  // Initialize as-fetch handler for network capability
  let fetchHandler: any = null
  let fetchImports = {}

  if (capabilities.network) {
    debug(`Setting up as-fetch handler for network capability`)
    const nodeFetch = getNodeFetch()

    // Create a wrapper that reads strings from WASM memory
    const fetchWrapper = async (
      urlPtr: number | string | URL | RequestInfo,
      init?: RequestInit
    ) => {
      let url: string

      if (typeof urlPtr === 'number') {
        if (!memoryRef.current) {
          throw new Error('WASM memory not available for string conversion')
        }

        // Read AssemblyScript string from memory (UTF-16LE)
        const SIZE_OFFSET = -4
        const memView = new Uint32Array(memoryRef.current.buffer)
        const strLengthInBytes = memView[(urlPtr + SIZE_OFFSET) >>> 2]
        const strLengthInChars = strLengthInBytes >>> 1
        const strView = new Uint16Array(
          memoryRef.current.buffer,
          urlPtr,
          strLengthInChars
        )
        url = String.fromCharCode(...Array.from(strView))
        debug(`Converted WASM string pointer ${urlPtr} to URL: ${url}`)
      } else {
        url = String(urlPtr)
      }

      return nodeFetch(url, init)
    }

    // Dynamic import for ESM-only as-fetch package
    const { FetchHandler } = await import('as-fetch/bindings.raw.esm.js')
    fetchHandler = new FetchHandler(fetchWrapper)
    fetchImports = fetchHandler.imports
  }

  // Instantiate the module
  let instance: WebAssembly.Instance
  let asLoaderInstance: any = null
  let rawExports: any

  if (isAssemblyScriptPlugin) {
    debug(`Using AssemblyScript loader for ${pluginId}`)

    asLoaderInstance = await loader.instantiate(module, {
      wasi_snapshot_preview1: wasiImports.wasi_snapshot_preview1 || wasiImports,
      env: envImports,
      ...fetchImports
    })

    instance = asLoaderInstance.instance
    rawExports = asLoaderInstance.exports
    asLoaderRef.current = asLoaderInstance
    debug(`AssemblyScript instance created with loader`)
  } else {
    // Standard WebAssembly instantiation for Rust plugins
    instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: wasiImports.wasi_snapshot_preview1 || wasiImports,
      env: envImports,
      ...fetchImports
    } as any)
    rawExports = instance.exports as any
    debug(`Standard WASM instance created`)
  }

  // Set refs for use in callbacks
  rawExportsRef.current = rawExports
  if (rawExports.memory) {
    memoryRef.current = rawExports.memory as WebAssembly.Memory
  }

  // Store reference for Asyncify resume
  let asyncifyResumeFunction: (() => any) | null = null

  // NOTE: Do NOT initialize as-fetch handler here!
  // as-fetch uses global state that gets corrupted if multiple plugins are loaded in parallel.
  // The handler is initialized right before plugin_start() is called, protected by a mutex.

  // Initialize based on plugin type
  if (isRustPlugin) {
    debug(`Initializing Rust command plugin: ${pluginId}`)
    wasi.start(instance)
  } else if (isRustLibraryPlugin) {
    debug(`Initialized Rust library plugin: ${pluginId}`)
    // Initialize WASI runtime without calling _start (for library plugins)
    // This sets up fd_write and other syscalls properly
    if (typeof wasi.initialize === 'function') {
      debug(`Calling wasi.initialize() for Rust library plugin`)
      wasi.initialize(instance)
    }
    // Also call _initialize if present (Rust static constructors)
    if (rawExports._initialize) {
      debug(`Calling _initialize for Rust library plugin`)
      rawExports._initialize()
    }
  } else if (isAssemblyScriptPlugin) {
    debug(`Initialized AssemblyScript plugin: ${pluginId}`)
  } else {
    throw new Error(`Unknown WASM plugin format for ${pluginId}`)
  }

  // Create normalized export interface
  const exports = createPluginExports(
    isAssemblyScriptPlugin,
    isRustLibraryPlugin,
    asLoaderInstance,
    rawExports,
    () => asyncifyResumeFunction,
    (fn) => {
      asyncifyResumeFunction = fn
    },
    fetchHandler,
    capabilities
  )

  // Create setter for asyncify resume that can be used by external callers
  const setAsyncifyResume = (fn: (() => any) | null) => {
    asyncifyResumeFunction = fn
  }

  const pluginInstance: WasmPluginInstance = {
    pluginId,
    wasmPath,
    vfsRoot,
    capabilities,
    format: 'wasi-p1',
    wasi,
    module,
    instance,
    exports,
    asLoader: asLoaderInstance,
    setAsyncifyResume
  }

  // Update provider references
  updateResourceProviderInstance(pluginId, pluginInstance)
  updateWeatherProviderInstance(pluginId, pluginInstance)
  updateRadarProviderInstance(pluginId, pluginInstance)

  debug(`Successfully loaded WASM plugin: ${pluginId}`)
  return pluginInstance
}

/**
 * Create normalized plugin exports based on plugin type
 */
function createPluginExports(
  isAssemblyScriptPlugin: boolean,
  isRustLibraryPlugin: boolean,
  asLoaderInstance: any,
  rawExports: any,
  getAsyncifyResume: () => (() => any) | null,
  setAsyncifyResume: (fn: (() => any) | null) => void,
  fetchHandler: any,
  capabilities: WasmCapabilities
) {
  let idFunc: () => string
  let nameFunc: () => string
  let schemaFunc: () => string
  let startFunc: (config: string) => number | Promise<number>
  let stopFunc: () => number

  if (isAssemblyScriptPlugin && asLoaderInstance) {
    idFunc = () => {
      const ptr = asLoaderInstance.exports.plugin_id()
      return asLoaderInstance.exports.__getString(ptr)
    }
    nameFunc = () => {
      const ptr = asLoaderInstance.exports.plugin_name()
      return asLoaderInstance.exports.__getString(ptr)
    }
    schemaFunc = () => {
      const ptr = asLoaderInstance.exports.plugin_schema()
      return asLoaderInstance.exports.__getString(ptr)
    }

    startFunc = async (config: string) => {
      debug(`Calling plugin_start with config: ${config.substring(0, 100)}...`)

      // Re-initialize as-fetch handler to refresh ASYNCIFY_MEM view
      // This is needed because memory may have grown since init(), detaching the old buffer view
      if (fetchHandler && capabilities.network) {
        debug(`Re-initializing as-fetch handler before plugin_start`)
        fetchHandler.init(rawExports, () => {
          debug(`FetchHandler calling main function to resume execution`)
          const resumeFn = getAsyncifyResume()
          if (resumeFn) {
            resumeFn()
          }
        })
      }

      const encoder = new TextEncoder()
      const configBytes = encoder.encode(config)
      const configLen = configBytes.length

      const configPtr = asLoaderInstance.exports.__new(configLen, 0)

      const memory = asLoaderInstance.exports.memory.buffer
      const memoryView = new Uint8Array(memory)
      memoryView.set(configBytes, configPtr)

      let resumePromiseResolve: (() => void) | null = null
      const resumePromise = new Promise<void>((resolve) => {
        resumePromiseResolve = resolve
      })

      setAsyncifyResume(() => {
        debug(`Re-calling plugin_start to resume from rewind state`)

        // Check Asyncify state - as-fetch calls asyncify_start_rewind() before calling us
        // State 0 = normal (rewind already completed), skip to avoid double-rewind
        // State 1 = unwound (shouldn't happen, as-fetch would have started rewind)
        // State 2 = rewinding (expected, proceed with resume)
        if (typeof asLoaderInstance.exports.asyncify_get_state === 'function') {
          const currentState = asLoaderInstance.exports.asyncify_get_state()
          if (currentState === 0) {
            debug(
              `Plugin in normal state (state=0), rewind already completed, skipping`
            )
            return
          }
          debug(`Asyncify state before resume: ${currentState}`)
        }

        try {
          // Re-read memory buffer in case it was detached during async operation
          const currentMemory = asLoaderInstance.exports.memory.buffer
          debug(
            `Memory buffer size: ${currentMemory.byteLength}, configPtr: ${configPtr}, configLen: ${configLen}`
          )

          const resumeResult = asLoaderInstance.exports.plugin_start(
            configPtr,
            configLen
          )
          if (resumePromiseResolve) {
            resumePromiseResolve()
          }
          return resumeResult
        } catch (err: any) {
          debug(`Error during Asyncify rewind: ${err.message}`)
          if (resumePromiseResolve) {
            resumePromiseResolve()
          }
          throw err
        }
      })

      const result = asLoaderInstance.exports.plugin_start(configPtr, configLen)

      if (typeof asLoaderInstance.exports.asyncify_get_state === 'function') {
        const state = asLoaderInstance.exports.asyncify_get_state()
        debug(`Asyncify state after plugin_start: ${state}`)

        if (state === 1) {
          debug(
            `Plugin is in unwound state - waiting for async operation to complete`
          )
          await resumePromise
          debug(`Async operation completed, plugin execution resumed`)
        } else {
          setAsyncifyResume(null)
        }
      }

      if (typeof asLoaderInstance.exports.__free === 'function') {
        asLoaderInstance.exports.__free(configPtr)
      }

      return result
    }
    stopFunc = () => asLoaderInstance.exports.plugin_stop()
  } else if (isRustLibraryPlugin) {
    debug(`Setting up Rust library plugin exports with buffer-based strings`)

    const callRustStringFunc = (funcName: string): string => {
      const func = rawExports[funcName]
      if (typeof func !== 'function') {
        debug(`Warning: ${funcName} not found in exports`)
        return ''
      }

      const maxLen = 8192
      const allocate = rawExports.allocate
      if (typeof allocate !== 'function') {
        throw new Error('Rust plugin missing allocate export')
      }

      const outPtr = allocate(maxLen)
      if (!outPtr) {
        throw new Error(`Failed to allocate ${maxLen} bytes for ${funcName}`)
      }

      try {
        const writtenLen = func(outPtr, maxLen)
        if (writtenLen <= 0) {
          debug(`${funcName} returned ${writtenLen}`)
          return ''
        }

        const memory = rawExports.memory as WebAssembly.Memory
        const bytes = new Uint8Array(memory.buffer, outPtr, writtenLen)
        const decoder = new TextDecoder('utf-8')
        const result = decoder.decode(bytes)
        debug(`${funcName} returned: ${result.substring(0, 100)}...`)
        return result
      } finally {
        const deallocate = rawExports.deallocate
        if (typeof deallocate === 'function') {
          deallocate(outPtr, maxLen)
        }
      }
    }

    idFunc = () => callRustStringFunc('plugin_id')
    nameFunc = () => callRustStringFunc('plugin_name')
    schemaFunc = () => callRustStringFunc('plugin_schema')

    startFunc = (config: string) => {
      debug(
        `Calling Rust plugin_start with config: ${config.substring(0, 100)}...`
      )

      const encoder = new TextEncoder()
      const configBytes = encoder.encode(config)
      const configLen = configBytes.length

      const allocate = rawExports.allocate
      const configPtr = allocate(configLen)

      const memory = rawExports.memory as WebAssembly.Memory
      const memoryView = new Uint8Array(memory.buffer)
      memoryView.set(configBytes, configPtr)

      try {
        const result = rawExports.plugin_start(configPtr, configLen)
        debug(`plugin_start returned: ${result}`)
        return result
      } finally {
        const deallocate = rawExports.deallocate
        if (typeof deallocate === 'function') {
          deallocate(configPtr, configLen)
        }
      }
    }

    stopFunc = () => {
      const result = rawExports.plugin_stop()
      debug(`plugin_stop returned: ${result}`)
      return result
    }
  } else {
    // Rust command plugins or unknown
    idFunc = rawExports.id
    nameFunc = rawExports.name
    schemaFunc = rawExports.schema
    startFunc = rawExports.start
    stopFunc = rawExports.stop
  }

  // Wrap http_endpoints if it exists
  const httpEndpointsFunc = rawExports.http_endpoints
    ? isAssemblyScriptPlugin && asLoaderInstance
      ? () => {
          const ptr = asLoaderInstance.exports.http_endpoints()
          return asLoaderInstance.exports.__getString(ptr)
        }
      : rawExports.http_endpoints
    : undefined

  // Wrap poll if it exists (for plugins that need periodic execution)
  const pollFunc = rawExports.poll
    ? isAssemblyScriptPlugin && asLoaderInstance
      ? () => asLoaderInstance.exports.poll()
      : rawExports.poll
    : undefined

  // Wrap delta_handler if it exists (for plugins that subscribe to deltas)
  let deltaHandlerFunc: ((deltaJson: string) => void) | undefined = undefined
  if (rawExports.delta_handler) {
    if (isAssemblyScriptPlugin && asLoaderInstance) {
      deltaHandlerFunc = (deltaJson: string) => {
        // Pass delta JSON string to the WASM delta_handler
        const ptr = asLoaderInstance.exports.__newString(deltaJson)
        asLoaderInstance.exports.delta_handler(ptr)
      }
    } else if (isRustLibraryPlugin) {
      // Rust library plugin: buffer-based string passing
      deltaHandlerFunc = (deltaJson: string) => {
        const encoder = new TextEncoder()
        const deltaBytes = encoder.encode(deltaJson)
        const deltaLen = deltaBytes.length

        const allocate = rawExports.allocate
        if (typeof allocate !== 'function') {
          debug('Rust plugin missing allocate export for delta_handler')
          return
        }

        const deltaPtr = allocate(deltaLen)
        const memory = rawExports.memory as WebAssembly.Memory
        const memoryView = new Uint8Array(memory.buffer)
        memoryView.set(deltaBytes, deltaPtr)

        try {
          rawExports.delta_handler(deltaPtr, deltaLen)
        } finally {
          const deallocate = rawExports.deallocate
          if (typeof deallocate === 'function') {
            deallocate(deltaPtr, deltaLen)
          }
        }
      }
    } else {
      deltaHandlerFunc = rawExports.delta_handler
    }
  }

  return {
    id: idFunc,
    name: nameFunc,
    schema: schemaFunc,
    start: startFunc,
    stop: stopFunc,
    memory: rawExports.memory,
    ...(httpEndpointsFunc && { http_endpoints: httpEndpointsFunc }),
    ...(pollFunc && { poll: pollFunc }),
    ...(deltaHandlerFunc && { delta_handler: deltaHandlerFunc })
  }
}
