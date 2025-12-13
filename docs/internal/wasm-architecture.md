# WASM Plugin Architecture

Internal documentation for Signal K Server WASM plugin infrastructure.

## Overview

The WASM plugin system runs alongside the existing Node.js plugin system in a hybrid mode:

- **Node.js plugins**: Full access (unsandboxed)
- **WASM plugins**: Wasmer sandbox with VFS isolation and capability restrictions

## Source Files

### Core Infrastructure (`src/wasm/`)

| File                    | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `wasm-runtime.ts`       | WASM runtime management (Wasmer), module loading, instance lifecycle |
| `wasm-storage.ts`       | Virtual filesystem (VFS) management, per-plugin isolation            |
| `wasm-serverapi.ts`     | FFI bridge to ServerAPI, capability enforcement, delta handling      |
| `wasm-subscriptions.ts` | Delta subscription management, pattern matching, buffering           |

### Plugin Loader (`src/wasm/loader/`)

| File                  | Purpose                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `types.ts`            | `WasmPlugin` and `WasmPluginMetadata` interfaces                  |
| `plugin-registry.ts`  | Plugin registration, global registry (Map), crash recovery timers |
| `plugin-lifecycle.ts` | start/stop/unload/reload, crash recovery with exponential backoff |
| `plugin-config.ts`    | Configuration persistence, enable/disable at runtime              |
| `plugin-routes.ts`    | HTTP routes (GET/POST /config), custom plugin endpoints           |
| `index.ts`            | Public API entry point, re-exports all functions                  |

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

## Plugin Identification

WASM plugins are identified by the `wasmManifest` field in `package.json`:

```json
{
  "name": "@scope/my-wasm-plugin",
  "wasmManifest": "plugin.wasm",
  "wasmCapabilities": {
    "dataRead": true,
    "dataWrite": true,
    "storage": "vfs-only",
    "network": false
  }
}
```

Plugin ID is derived from package name: `@scope/my-plugin` → `_scope_my-plugin`

## Circular Dependency Resolution

The loader modules use a forward reference pattern:

```typescript
// In plugin-registry.ts
let startWasmPluginRef: typeof import('./plugin-lifecycle').startWasmPlugin

export function initializeLifecycleFunctions(
  startFn: typeof startWasmPluginRef
) {
  startWasmPluginRef = startFn
}

// In loader/index.ts - wire up at import time
import { initializeLifecycleFunctions } from './plugin-registry'
import { startWasmPlugin } from './plugin-lifecycle'
initializeLifecycleFunctions(startWasmPlugin)
```

## Dependencies

- `@wasmer/wasi` - WASM runtime with WASI support
- `@bytecodealliance/jco` - WIT bindings generator
- `@assemblyscript/loader` - AssemblyScript runtime support
- `as-fetch` - HTTP fetch for AssemblyScript (via Asyncify)

## Known Limitations

- C#/.NET not supported (V8/jco incompatibility with componentize-dotnet)
- Serial ports not yet implemented
- Autopilot API not yet integrated

## Related Documentation

- [wasm-asyncify.md](wasm-asyncify.md) - Asyncify implementation for async HTTP
- [hotplug.md](hotplug.md) - Plugin enable/disable without restart
- `docs/develop/plugins/wasm/` - Public developer documentation
