# Signal K WASM Plugin Infrastructure

This directory contains the infrastructure for running WebAssembly (WASM/WASIX) plugins in Signal K Server 3.0.

> For detailed implementation history and development timeline, see [IMPLEMENTATION_HISTORY.md](IMPLEMENTATION_HISTORY.md).

## Architecture

The WASM plugin system runs alongside the existing Node.js plugin system in a hybrid mode:
- **Node.js plugins**: Continue running with full access (unsandboxed)
- **WASM plugins**: Run in Wasmer sandbox with VFS isolation and capability restrictions

## Files

> Source files are located in `src/wasm/`. This README is in `wasm/` with other documentation.

### Core Infrastructure (src/wasm/)

- **`wasm-runtime.ts`** - WASM runtime management using Wasmer
  - Module loading and compilation
  - Instance lifecycle (load, unload, reload)
  - Singleton runtime instance
  - Support for both Rust and AssemblyScript plugins

- **`wasm-storage.ts`** - Virtual filesystem (VFS) management
  - Per-plugin isolated storage
  - Server-managed vs plugin-managed config
  - Node.js to WASM data migration
  - Disk usage tracking

- **`wasm-serverapi.ts`** - FFI bridge to ServerAPI
  - Capability enforcement
  - Delta message handling
  - Configuration management
  - Status and logging
  - Network API integration (Node.js 18+ fetch)

- **`wasm-subscriptions.ts`** - Delta subscription management
  - Pattern matching
  - Buffering during reload
  - Subscription state tracking

- **`loader/plugin-lifecycle.ts`** - Delta subscription for WASM plugins
  - Automatic subscription when plugin exports `delta_handler`
  - Routes all Signal K deltas to subscribed plugins
  - Cleanup on plugin stop

### Plugin Loader (src/wasm/loader/)

The plugin loader has been refactored into logical modules under `loader/`:

- **`loader/types.ts`** - Shared type definitions
  - `WasmPlugin` interface - Runtime plugin state
  - `WasmPluginMetadata` interface - Plugin manifest data

- **`loader/plugin-registry.ts`** - Plugin registration and management
  - `registerWasmPlugin()` - Main registration function
  - `getAllWasmPlugins()` - Get all registered plugins
  - `getWasmPlugin()` - Get plugin by ID
  - Global plugin registry (Map)
  - Crash recovery timer management

- **`loader/plugin-lifecycle.ts`** - Lifecycle operations
  - `startWasmPlugin()` - Start a plugin
  - `stopWasmPlugin()` - Stop a plugin
  - `unloadWasmPlugin()` - Unload and free memory
  - `reloadWasmPlugin()` - Hot-reload without server restart
  - `handleWasmPluginCrash()` - Automatic crash recovery with exponential backoff
  - `shutdownAllWasmPlugins()` - Graceful shutdown

- **`loader/plugin-config.ts`** - Configuration management
  - `updateWasmPluginConfig()` - Update and persist configuration
  - `setWasmPluginEnabled()` - Enable/disable plugins at runtime

- **`loader/plugin-routes.ts`** - HTTP route handling
  - `setupWasmPluginRoutes()` - Basic REST API (GET/POST /config)
  - `setupPluginSpecificRoutes()` - Custom plugin endpoints
  - `handleLogViewerRequest()` - Node.js log streaming for large data
  - Express route registration and removal

- **`loader/index.ts`** - Public API entry point
  - Re-exports all public functions
  - Single import point for consumers

## WIT Interface

The WASM plugin API is defined in WebAssembly Interface Types (WIT) at:
`packages/server-api/wit/signalk.wit`

This provides a type-safe, language-agnostic API definition that generates:
- Rust bindings via `wit-bindgen`
- JavaScript host bindings via `@bytecodealliance/jco`

## Dependencies

Added to `package.json`:
- `@wasmer/wasi` - WASM runtime with WASI support
- `@bytecodealliance/jco` - WIT bindings generator

## VFS Structure

Each WASM plugin gets an isolated virtual filesystem:

```
$CONFIG_DIR/plugin-config-data/{plugin-id}/
├── {plugin-id}.json        # Server-managed config (outside VFS)
├── vfs/                    # VFS root (plugin sees as "/")
│   ├── data/               # Persistent storage
│   ├── config/             # Plugin-managed config
│   └── tmp/                # Temporary files
```

## Capabilities

WASM plugins declare required capabilities in `package.json`:

```json
{
  "wasmCapabilities": {
    "dataRead": true,
    "dataWrite": true,
    "storage": "vfs-only",
    "network": false,
    "serialPorts": false
  }
}
```

## Usage

### Initialize Runtime

```typescript
import { initializeWasmRuntime } from './wasm/wasm-runtime'

const runtime = initializeWasmRuntime()
```

### Load Plugin

```typescript
const instance = await runtime.loadPlugin(
  'my-wasm-plugin',
  '/path/to/plugin.wasm',
  '/path/to/vfs/root',
  capabilities
)
```

### Hot Reload

```typescript
await runtime.reloadPlugin('my-wasm-plugin')
```

## Status

**Phase 1 (Core Infrastructure) - ✅ COMPLETE**
- ✅ Dependencies added (@wasmer/wasi, @assemblyscript/loader, as-fetch)
- ✅ Runtime initialization implemented (wasm-runtime.ts)
- ✅ VFS storage layer implemented (wasm-storage.ts)
- ✅ Plugin loader with hot-reload (loader/)
- ✅ ServerAPI FFI bridge (wasm-serverapi.ts)
- ✅ Delta subscription manager (wasm-subscriptions.ts)
- ✅ Integration with existing plugin system (src/interfaces/plugins.ts)
- ✅ Server initialization (src/index.ts)
- ✅ Network API support (fetch integration via as-fetch/Asyncify)
- ✅ AssemblyScript SDK published (`signalk-assemblyscript-plugin-sdk`)
- ✅ Example plugins (hello-assemblyscript, weather-plugin, signalk-logviewer)

**Phase 2 (Extended Features) - ✅ COMPLETE**
- ✅ Refactored loader into modular architecture (6 focused modules)
- ✅ Fixed Plugin Config UI for disabled plugins
- ✅ Implemented full runtime enable/disable with unload/reload
- ✅ Added special handling for large data streams (logviewer)
- ✅ Custom HTTP endpoints for WASM plugins
- ✅ PUT handler registration
- ✅ Raw UDP sockets for hardware communication (rawSockets capability)
- ✅ Poll export for periodic plugin execution

**Phase 3 (Provider APIs) - ✅ COMPLETE**
- ✅ Resource Providers - WASM plugins can serve Signal K resources
- ✅ Weather Providers - Integration with Weather API
- ✅ Delta Subscriptions - WASM plugins receive real-time deltas via `delta_handler`
- ✅ MBTiles chart serving (better-sqlite3)

**Phase 4 (Language Support) - ✅ PARTIAL**
- ✅ AssemblyScript - Full support with SDK
- ✅ Rust - Library plugins working (anchor-watch-rust example)
- ⏳ Go/TinyGo - Documented, not extensively tested
- ❌ C#/.NET - Not compatible (componentize-dotnet requires Wasmtime, not V8)

**Phase 5 (Testing & Documentation) - ✅ COMPLETE**
- ✅ Regression test suite (test/wasm-plugin-regression.ts)
- ✅ Comprehensive developer guide (wasm/WASM_PLUGIN_DEV_GUIDE.md)
- ✅ Changelog with all changes since fork (wasm/CHANGELOG.md)
- ✅ Example plugins for each major feature

## Architecture Benefits

The modular loader architecture provides:

1. **Better Maintainability**: Each module has a single, clear responsibility
2. **Easier Navigation**: Find functionality quickly by module purpose
3. **Race Condition Prevention**: Related async operations kept together
4. **Clean Dependencies**: Minimal circular dependencies via forward references
5. **Testability**: Smaller modules are easier to unit test

### Circular Dependency Resolution

The loader modules use a forward reference pattern to avoid circular dependencies:

```typescript
// In plugin-registry.ts
let startWasmPluginRef: typeof import('./plugin-lifecycle').startWasmPlugin
let stopWasmPluginRef: typeof import('./plugin-lifecycle').stopWasmPlugin

export function initializeLifecycleFunctions(
  startFn: typeof startWasmPluginRef,
  stopFn: typeof stopWasmPluginRef
) {
  startWasmPluginRef = startFn
  stopWasmPluginRef = stopFn
}

// In loader/index.ts
import { initializeLifecycleFunctions } from './plugin-registry'
import { startWasmPlugin, stopWasmPlugin } from './plugin-lifecycle'

initializeLifecycleFunctions(startWasmPlugin, stopWasmPlugin)
```

This pattern allows `plugin-registry` to call lifecycle functions without directly importing them, breaking the circular dependency while maintaining type safety.

## Future Enhancements

**Post-Merge Improvements:**
- Plugin dependency resolution
- Plugin versioning and compatibility checks
- Performance profiling and optimization
- Security audit of capability enforcement
- Complete Rust SDK with WIT bindings
- Serial port access for NMEA devices
- Autopilot API integration

**Known Limitations:**
- C#/.NET not supported (V8/jco incompatibility with componentize-dotnet)
- Serial ports not yet implemented
- Autopilot API not yet integrated
