# Asyncify Implementation for SignalK WASM Plugins

## Overview

This document describes the implementation of Asyncify support in the SignalK server WASM runtime, enabling WASM plugins to perform asynchronous operations like HTTP requests using `as-fetch`.

## What is Asyncify?

Asyncify is a Binaryen compile-time transform that enables pausing and resuming WebAssembly execution. This allows synchronous-style code in AssemblyScript to perform async operations like HTTP requests.

### Asyncify State Machine

Asyncify uses a state machine with three states:

- **State 0 (Normal)**: Normal execution
- **State 1 (Unwound/Paused)**: WASM execution is paused, waiting for async operation
- **State 2 (Rewound/Resuming)**: Async operation completed, resuming WASM execution

## Architecture

### Components

1. **FetchHandler** (`as-fetch/bindings.raw.esm.js`)
   - Manages Asyncify state transitions
   - Handles HTTP requests via browser/Node.js fetch API
   - Calls main function callback when async operations complete

2. **WASM Runtime** (`src/wasm/wasm-runtime.ts`)
   - Initializes FetchHandler with resume callback
   - Detects Asyncify state after plugin_start()
   - Waits for async operations to complete before returning

3. **Plugin Lifecycle** (`src/wasm/loader/plugin-lifecycle.ts`)
   - Awaits async plugin_start() function
   - Handles both sync and async plugin initialization

## Implementation Details

### 1. FetchHandler Initialization

In `src/wasm/wasm-runtime.ts` (lines 451-465):

```typescript
// Store reference to the function that needs to be resumed
let asyncifyResumeFunction: (() => any) | null = null

// Initialize as-fetch handler if network capability is enabled
if (fetchHandler && capabilities.network) {
  debug(`Initializing as-fetch handler with exports`)
  // The second parameter is the "main function" that gets called after async operations complete
  // This function needs to re-call the WASM function to continue execution in rewind state
  fetchHandler.init(rawExports, () => {
    debug(`FetchHandler calling main function to resume execution`)
    if (asyncifyResumeFunction) {
      asyncifyResumeFunction()
    }
  })
}
```

**Key Points:**

- FetchHandler needs a "main function" callback to resume WASM execution
- This callback is set up BEFORE calling plugin_start to avoid race conditions
- The callback re-calls the WASM function to continue from the rewind state

### 2. Async Plugin Start with Race Condition Prevention

In `src/wasm/wasm-runtime.ts` (lines 504-566):

```typescript
startFunc = async (config: string) => {
  debug(`Calling plugin_start with config: ${config.substring(0, 100)}...`)
  const encoder = new TextEncoder()
  const configBytes = encoder.encode(config)
  const configLen = configBytes.length

  const configPtr = asLoaderInstance.exports.__new(configLen, 0)
  const memory = asLoaderInstance.exports.memory.buffer
  const memoryView = new Uint8Array(memory)
  memoryView.set(configBytes, configPtr)

  // Set up the resume function BEFORE calling plugin_start to avoid race condition
  let resumePromiseResolve: (() => void) | null = null
  const resumePromise = new Promise<void>((resolve) => {
    resumePromiseResolve = resolve
  })

  asyncifyResumeFunction = () => {
    debug(`Re-calling plugin_start to resume from rewind state`)
    const resumeResult = asLoaderInstance.exports.plugin_start(
      configPtr,
      configLen
    )
    if (resumePromiseResolve) {
      resumePromiseResolve()
    }
    return resumeResult
  }

  // Call plugin_start - this may trigger Asyncify
  let result = asLoaderInstance.exports.plugin_start(configPtr, configLen)

  // Check if Asyncify is available and the function is in unwound state
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
      asyncifyResumeFunction = null
    }
  }

  if (typeof asLoaderInstance.exports.__free === 'function') {
    asLoaderInstance.exports.__free(configPtr)
  }

  return result
}
```

**Key Points:**

- **Race Condition Prevention**: Promise and callback are set up BEFORE calling plugin_start
- If set up AFTER, fast HTTP responses could complete before callback is registered
- Checks Asyncify state after initial call to detect if async operation started
- Waits for Promise to resolve before returning from start()

### 3. Type Updates

Updated function signatures to support async returns:

```typescript
// Interface definition (line 124)
start: (config: string) => number | Promise<number>

// Plugin lifecycle (line 106)
const result = await plugin.instance.exports.start(configJson)
```

## Configuration File Path Fix

### Problem

On server restart, plugins were not loading correctly due to config file path mismatch:

- Temporary ID from package name: `weather-plugin-example` (from `@signalk/weather-plugin-example`)
- Actual plugin ID from WASM: `weather-example`
- Config file saved by UI: `weather-example.json`
- Startup looked for: `weather-plugin-example.json` ❌

### Solution

In `src/wasm/loader/plugin-registry.ts` (lines 85-110):

```typescript
// Load WASM module temporarily just to get the plugin ID
// We need the real plugin ID to find the correct config file
const tempVfsRoot = path.join(
  configPath,
  'plugin-config-data',
  '.temp-' + packageName.replace(/\//g, '-')
)
if (!fs.existsSync(tempVfsRoot)) {
  fs.mkdirSync(tempVfsRoot, { recursive: true })
}

const runtime = getWasmRuntime()
const tempInstance = await runtime.loadPlugin(
  packageName,
  wasmPath,
  tempVfsRoot,
  capabilities,
  app
)

// Extract plugin ID from WASM exports
const pluginId = tempInstance.exports.id()
const pluginName = tempInstance.exports.name()
const schemaJson = tempInstance.exports.schema()
const schema = schemaJson ? JSON.parse(schemaJson) : {}

// Now check config using the REAL plugin ID
const storagePaths = getPluginStoragePaths(configPath, pluginId, packageName)
const savedConfig = readPluginConfig(storagePaths.configFile)
```

**Key Points:**

- Always load WASM first to get real plugin ID
- Use real plugin ID to locate config file
- Reuse loaded instance for enabled plugins (no double-loading)

## Plugin Configuration Requirements

### 1. AssemblyScript Configuration (`asconfig.json`)

```json
{
  "targets": {
    "release": {
      "outFile": "build/plugin.wasm",
      "sourceMap": false,
      "optimize": true,
      "shrinkLevel": 2,
      "converge": true,
      "noAssert": true,
      "runtime": "stub",
      "use": "abort="
    }
  },
  "options": {
    "bindings": "esm",
    "exportRuntime": true,
    "transform": ["as-fetch/transform"] // ← CRITICAL: Enables Asyncify
  }
}
```

**Critical Settings:**

- `"transform": ["as-fetch/transform"]` - Enables Asyncify transform
- `"bindings": "esm"` - Generates ESM bindings for FetchHandler
- `"exportRuntime": true` - Exports Asyncify state functions

### 2. Package Configuration (`package.json`)

```json
{
  "name": "@signalk/weather-plugin-example",
  "version": "0.1.8",
  "wasmManifest": "build/plugin.wasm",
  "wasmCapabilities": {
    "network": true, // ← Required for as-fetch
    "storage": "vfs-only",
    "dataRead": true,
    "dataWrite": true,
    "serialPorts": false
  },
  "dependencies": {
    "as-fetch": "^2.1.4",
    "signalk-assemblyscript-plugin-sdk": "^0.1.0"
  }
}
```

**Critical Settings:**

- `"network": true` - Grants network capability
- `"as-fetch": "^2.1.4"` - HTTP client library dependency

## Using as-fetch in Plugins

### Example: HTTP GET Request

```typescript
import { fetchSync } from 'as-fetch/sync'
import { Response } from 'as-fetch/assembly'

export function plugin_start(config: Config): i32 {
  // Fetch data using synchronous-style async API
  const response = fetchSync('https://api.example.com/data')

  if (response) {
    const data = response.text()
    // Process data...
  }

  return 0
}
```

**Key Points:**

- Import from `'as-fetch/sync'` for synchronous-style API
- `fetchSync()` internally uses Asyncify to pause/resume execution
- Runtime handles all state transitions automatically

### Example: Weather Plugin

See `examples/wasm-plugins/example-weather-plugin/assembly/index.ts` for a complete example:

```typescript
private fetchWeatherData(): void {
  const url =
    `https://api.openweathermap.org/data/2.5/weather?lat=${this.lat}&lon=${this.lon}&appid=${this.apiKey}&units=metric`

  debug('Fetching weather data from: ' + url)

  const response = fetchSync(url)

  if (!response) {
    setError('Failed to fetch weather data from OpenWeatherMap')
    return
  }

  if (response.status !== 200) {
    setError(`OpenWeatherMap API error: ${response.status.toString()}`)
    return
  }

  const jsonText = response.text()
  const weatherData = JSON.parse<OpenWeatherMapResponse>(jsonText)

  // Create and emit deltas
  const delta = createEmptyDelta(this.pluginId)

  const tempUpdate = new Update()
  tempUpdate.path = 'environment.outside.temperature'
  tempUpdate.value = JSON.stringify(weatherData.main.temp + 273.15)
  delta.updates[0].values.push(tempUpdate)

  emit(delta)
}
```

## Debugging

### Enable Debug Logging

Set `DEBUG=signalk:wasm:*` environment variable:

```bash
DEBUG=signalk:wasm:* npm start
```

### Key Log Messages

```
signalk:wasm:runtime Initializing as-fetch handler with exports
signalk:wasm:runtime Calling plugin_start with config: {...
signalk:wasm:runtime Asyncify state after plugin_start: 1
signalk:wasm:runtime Plugin is in unwound state - waiting for async operation to complete
signalk:wasm:runtime FetchHandler calling main function to resume execution
signalk:wasm:runtime Re-calling plugin_start to resume from rewind state
signalk:wasm:runtime Async operation completed, plugin execution resumed
```

### Common Issues

**Issue**: Plugin doesn't fetch data on server restart

- **Cause**: Config file not found due to plugin ID mismatch
- **Solution**: Fixed in plugin-registry.ts - loads WASM first to get real ID

**Issue**: FetchHandler callback undefined

- **Cause**: Race condition - callback set after async operation completes
- **Solution**: Set up Promise and callback BEFORE calling plugin_start

**Issue**: Asyncify transform not working

- **Cause**: Missing `"transform": ["as-fetch/transform"]` in asconfig.json
- **Solution**: Add transform to options in asconfig.json

## Testing

### Test on Enable/Disable

1. Open Plugin Config UI
2. Disable plugin → Enable plugin
3. Check logs for successful fetch
4. Verify data appears in Signal K paths

### Test on Server Restart

1. Enable plugin in Plugin Config UI
2. Restart SignalK server
3. Check logs for:
   - Config file loaded correctly
   - Plugin started automatically
   - HTTP request made successfully
   - Data emitted to paths

## References

- Binaryen Asyncify: https://github.com/WebAssembly/binaryen/blob/main/src/passes/Asyncify.cpp
- as-fetch Library: https://github.com/rockmor/as-fetch
- AssemblyScript Documentation: https://www.assemblyscript.org/

## Version History

- **v0.1.8** - Fixed config file path mismatch and race condition
- **v0.1.7** - Added race condition prevention in callback setup
- **v0.1.6** - Initial Asyncify support implementation
