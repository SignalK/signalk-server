# WASM Runtime Changelog

All notable changes to the SignalK WASM runtime since forking from v2.18.0.

## [2.19.0+beta1wasm10] - 2025-12-05

### Added - Delta Subscription for WASM Plugins

WASM plugins can now receive Signal K deltas in real-time by exporting a `delta_handler()` function.

**Features:**
- Automatic subscription when plugin exports `delta_handler`
- All Signal K deltas delivered as JSON strings
- Automatic cleanup on plugin stop
- Support for both AssemblyScript and Rust plugins

**Usage (AssemblyScript):**
```typescript
export function delta_handler(deltaJson: string): void {
  // React to navigation.position updates
  if (deltaJson.indexOf('"path":"navigation.position"') >= 0) {
    const lat = parseFloat64FromJson(deltaJson, 'latitude')
    const lon = parseFloat64FromJson(deltaJson, 'longitude')
    // Process position...
  }

  // React to course destination changes
  if (deltaJson.indexOf('"path":"navigation.course.nextPoint"') >= 0) {
    // Handle destination or detect null for route clearing
  }
}
```

**Files Modified:**
- `src/wasm/types.ts` - Added `delta_handler` to `WasmPluginExports` interface
- `src/wasm/loaders/standard-loader.ts` - Added delta_handler wrapper for AS and Rust plugins
- `src/wasm/loader/plugin-lifecycle.ts` - Added delta subscription on plugin start, cleanup on stop

**Documentation:**
- `wasm/WASM_PLUGIN_DEV_GUIDE.md` - New "Receiving Signal K Deltas" section with examples

### Added - Course Provider WASM Plugin Example

New showcase plugin demonstrating delta subscriptions, geodesy calculations, HTTP endpoints, and delta emission.

**Features:**
- Subscribes to `navigation.position`, `navigation.course.nextPoint`, `navigation.course.previousPoint`
- Great Circle and Rhumb Line calculations (ported geodesy library)
- Emits calculated course values to `navigation.course.calcValues.*`
- HTTP endpoint: `GET /plugins/course-provider-wasm/api/calcValues`
- Detects destination clearing (null values) and stops calculations

**Repository:** https://github.com/SignalK/course-provider-plugin

### Changed - Documentation Reorganization

- Moved `src/wasm/README.md` to `wasm/README.md` (consolidates all WASM docs)
- Renamed `IMPLEMENTATION_STATUS.md` to `IMPLEMENTATION_HISTORY.md` (clarifies historical record)
- Updated status to "Ready for merge"

---

## [2.19.0+beta1wasm9] - 2025-12-05

### Added - Routes & Waypoints Resource Provider Example

New example plugin demonstrating standard Signal K resource types (routes and waypoints) with proper GeoJSON schema compliance.

**Features:**
- Registers as resource provider for BOTH `routes` AND `waypoints` types
- Full CRUD operations (list, get, create/update, delete)
- GeoJSON-compliant data structures (Point for waypoints, LineString for routes)
- Pre-populated Helsinki-area sample navigation data
- Demonstrates multiple resource type registration from single plugin

**Sample Data Included:**
- 3 waypoints: Helsinki Marina, Suomenlinna Anchorage, Fuel Dock
- 1 route: "Marina to Suomenlinna" with 3 waypoints and coordinatesMeta

**Files Created:**
- `examples/wasm-plugins/routes-waypoints-plugin/` - Complete example plugin

**API Endpoints:**
```bash
GET    /signalk/v2/api/resources/waypoints
GET    /signalk/v2/api/resources/waypoints/{id}
POST   /signalk/v2/api/resources/waypoints
DELETE /signalk/v2/api/resources/waypoints/{id}

GET    /signalk/v2/api/resources/routes
GET    /signalk/v2/api/resources/routes/{id}
POST   /signalk/v2/api/resources/routes
DELETE /signalk/v2/api/resources/routes/{id}
```

### Fixed - Resource Provider Handler Missing resourceType

Fixed bug where WASM resource handlers weren't receiving the `resourceType` parameter, causing "Unknown resource type" errors on GET by ID operations.

**Root Cause:** The binding closures captured `resourceType` but didn't include it in the JSON request sent to WASM handlers.

**Solution:** All four handler methods (listResources, getResource, setResource, deleteResource) now include `resourceType` in the request JSON.

**File Modified:**
- `src/wasm/bindings/resource-provider.ts` - Added resourceType to all handler requests

---

## [2.19.0+beta1wasm8] - 2025-12-05

### Added - Weather Provider API for WASM Plugins

WASM plugins can now register as **weather providers** to integrate with Signal K's specialized Weather API.

**Features:**
- `weatherProvider` capability in plugin manifest
- `sk_register_weather_provider` FFI function for registration
- Handler exports: `weather_get_observations`, `weather_get_forecasts`, `weather_get_warnings`
- Full Asyncify support for handlers that use `fetchSync()`
- Integration with `/signalk/v2/api/weather/*` endpoints

**Weather Provider vs Resource Provider:**

| Feature | Weather Provider | Resource Provider |
|---------|-----------------|-------------------|
| API Path | `/signalk/v2/api/weather/*` | `/signalk/v2/api/resources/{type}` |
| Methods | getObservations, getForecasts, getWarnings | list, get, set, delete |
| Use Case | Standardized weather data | Generic data storage |
| Capability | `weatherProvider: true` | `resourceProvider: true` |

**API Endpoints:**
```bash
GET /signalk/v2/api/weather/_providers
GET /signalk/v2/api/weather/observations?lat=...&lon=...
GET /signalk/v2/api/weather/forecasts/daily?lat=...&lon=...
GET /signalk/v2/api/weather/forecasts/point?lat=...&lon=...
GET /signalk/v2/api/weather/warnings?lat=...&lon=...
```

**Files Created:**
- `src/wasm/bindings/weather-provider.ts` - Weather provider FFI bindings
- `examples/wasm-plugins/weather-provider-plugin/` - Complete OpenWeatherMap example

**Files Modified:**
- `src/wasm/types.ts` - Added `weatherProvider` capability and `setAsyncifyResume` to WasmPluginInstance
- `src/wasm/bindings/env-imports.ts` - Added `sk_register_weather_provider` binding
- `src/wasm/bindings/index.ts` - Exported weather-provider module
- `src/wasm/loader/plugin-registry.ts` - Added `weatherProvider` capability parsing
- `src/wasm/loaders/standard-loader.ts` - Exposed `setAsyncifyResume` for external callers
- `wasm/WASM_PLUGIN_DEV_GUIDE.md` - Full documentation for Weather Providers

### Fixed - Asyncify Support for Weather Handler Exports

Weather handler functions that call `fetchSync()` now work correctly with Asyncify.

**Root Cause:** Handler exports were called synchronously but `fetchSync()` triggers Asyncify unwind. The handlers weren't wrapped for async operations.

**Solution:**
- Made `callWasmWeatherHandler()` async with proper Asyncify handling
- Added `setAsyncifyResume` to `WasmPluginInstance` type
- Standard loader now exposes the resume function for external callers
- Handler checks `asyncify_get_state()` and awaits completion if state is 1 (unwound)

**Key Code Pattern:**
```typescript
// Set up resume callback before calling handler
pluginInstance.setAsyncifyResume(() => {
  const resumeResultPtr = asLoader.exports[handlerName](requestPtr)
  const result = asLoader.exports.__getString(resumeResultPtr)
  resumePromiseResolve(result)
})

// Call handler
handlerResultPtr = asLoader.exports[handlerName](requestPtr)

// Check Asyncify state
if (asLoader.exports.asyncify_get_state() === 1) {
  // Wait for async operation
  const result = await resumePromise
}
```

### Example - OpenWeatherMap Weather Provider

New example plugin demonstrating Weather Provider capability:

- Fetches real weather data from OpenWeatherMap API
- Implements all three Weather Provider methods
- Uses Asyncify for async HTTP requests
- Emits weather data as Signal K deltas
- Configurable API key and default coordinates

**Usage:**
```typescript
// package.json
"wasmCapabilities": {
  "network": true,
  "dataWrite": true,
  "weatherProvider": true
}

// Register as weather provider
@external("env", "sk_register_weather_provider")
declare function sk_register_weather_provider(namePtr: usize, nameLen: usize): i32

// Export handlers
export function weather_get_observations(requestJson: string): string
export function weather_get_forecasts(requestJson: string): string
export function weather_get_warnings(requestJson: string): string
```

---

## [2.19.0+beta.1+wasm7] - 2025-12-05

### Added - Zero Node.js Plugin Regressions Test Suite

Comprehensive automated test suite proving WASM and Node.js plugins coexist without issues.

**16 Tests Passing:**
- Node.js plugin loads and starts
- Node.js plugin appears in pluginsMap
- Node.js plugin can emit deltas
- Node.js plugin HTTP endpoint accessible
- WASM plugin loads
- WASM plugin starts
- WASM plugin appears in pluginsMap
- WASM plugin status via /skServer/plugins API
- Both plugin types appear in plugins list
- Both plugins are started
- Plugin map contains both types
- Node.js plugin delta does not interfere with WASM plugin
- /skServer/plugins returns both plugin types
- WASM plugin can be stopped
- Node.js plugin can be stopped independently
- Server stops cleanly with both plugin types

**Files Created:**
- `test/wasm-plugin-regression.ts` - Main test file (~430 lines)
- `test/wasm-regression-config/` - Test configuration directory
- `test/wasm-regression-config/node_modules/testplugin/` - Node.js test plugin
- `test/wasm-regression-config/node_modules/@signalk/anchor-watch-rust/` - WASM test plugin

### Fixed - WASM Plugin `started` Property Compatibility

Added Node.js plugin API compatibility to WASM plugins via `Object.defineProperty` getter.

**Root Cause:** Tests and other code expected `plugin.started` property, but WASM plugins only had `plugin.status`.

**Solution:** Added `addNodejsPluginCompat()` function that defines a `started` getter returning `this.status === 'running'`.

**Files Modified:**
- `src/wasm/loader/plugin-registry.ts`
  - Added `addNodejsPluginCompat()` function (lines 66-80)
  - Called for both enabled and disabled plugin registration paths

### Fixed - Server Shutdown WASM Plugin Cleanup

Server `stop()` method now properly shuts down WASM plugins.

**Root Cause:** `server.stop()` didn't call `shutdownAllWasmPlugins()`, leaving WASM plugins running.

**Solution:** Added `shutdownAllWasmPlugins()` call to `Server.stop()` method.

**Files Modified:**
- `src/index.ts`
  - Added import: `import { shutdownAllWasmPlugins } from './wasm'`
  - Added `await shutdownAllWasmPlugins()` in `stop()` method (lines 560-565)

### Fixed - Module Instance Duplication in Tests

Test imports now use compiled `dist/` modules to share singleton state with Server.

**Root Cause:** Test file importing from `../src/wasm` created separate module instance from Server importing from `./wasm` (compiled to `dist/wasm`). Two separate `wasmPlugins` Map singletons existed.

**Solution:** Changed test import to `import { shutdownAllWasmPlugins } from '../dist/wasm'`.

**Files Modified:**
- `test/wasm-plugin-regression.ts` - Changed import path (line 9)

### Added - Async Plugin Loading Helper

Added `waitForPlugin()` helper with polling for async WASM plugin loading.

**Root Cause:** WASM plugins load asynchronously after `server.start()` returns, causing race conditions in tests.

**Solution:** Added polling helper that waits up to 10 seconds for plugin to appear in `app.plugins`.

**Files Modified:**
- `test/wasm-plugin-regression.ts` - Added `waitForPlugin()` function (lines 88-102)
- Called in `startWasmTestServer()` after `server.start()` (line 118)

### Added - Debug Logging for Plugin Shutdown

Enhanced `shutdownAllWasmPlugins()` with detailed debug logging.

**Files Modified:**
- `src/wasm/loader/plugin-lifecycle.ts` - Added debug statements showing plugin count, status, and shutdown progress (lines 434-465)

---

## [2.18.0+wasm6] - 2025-12-04

### Added - Raw Sockets Capability for UDP Network Access

WASM plugins can now access UDP sockets for communicating with marine hardware like radars, NMEA devices, and AIS receivers.

**Features:**
- `rawSockets` capability in plugin manifest
- Full UDP socket API: create, bind, send, receive, multicast
- Non-blocking receive with automatic buffering (up to 1000 datagrams)
- Broadcast and multicast support
- Automatic socket cleanup on plugin stop

**FFI Functions:**

| Function | Description |
|----------|-------------|
| `sk_udp_create(type)` | Create UDP socket (0=IPv4, 1=IPv6) |
| `sk_udp_bind(socket_id, port)` | Bind to port |
| `sk_udp_send(socket_id, addr, port, data)` | Send datagram |
| `sk_udp_recv(socket_id, buf, addr_out, port_out)` | Receive (non-blocking) |
| `sk_udp_set_broadcast(socket_id, enabled)` | Enable broadcast |
| `sk_udp_join_multicast(socket_id, group, iface)` | Join multicast group |
| `sk_udp_leave_multicast(socket_id, group, iface)` | Leave multicast group |
| `sk_udp_pending(socket_id)` | Get buffered datagram count |
| `sk_udp_close(socket_id)` | Close socket |

**Files Created:**
- `src/wasm/bindings/socket-manager.ts` - Node.js dgram wrapper with buffering

**Files Modified:**
- `src/wasm/types.ts` - Added `rawSockets?: boolean` to WasmCapabilities
- `src/wasm/bindings/env-imports.ts` - Added socket FFI bindings
- `src/wasm/loaders/standard-loader.ts` - Wired up socket imports
- `wasm/WASM_PLUGIN_DEV_GUIDE.md` - Documented Raw Sockets API with examples

### Added - Generic Poll Export for Periodic Plugin Execution

WASM plugins can now export a `poll()` function that is called every second while the plugin is running.

**Use Cases:**
- Polling hardware for new data
- Checking socket buffers for incoming packets
- Periodic status updates
- Timer-based operations

**Files Modified:**
- `src/wasm/types.ts` - Added `poll?: () => number` to WasmPluginExports
- `src/wasm/loader/plugin-lifecycle.ts` - Added poll timer management
- `src/wasm/loaders/standard-loader.ts` - Pass poll through to exports

**Usage:**
```rust
#[no_mangle]
pub extern "C" fn poll() -> i32 {
    // Called every 1 second
    // Return 0 for success, non-zero for errors
    0
}
```

### Fixed - Socket Options Deferred Until Bind Completes

Socket options like `setBroadcast`, `setMulticastTTL`, and `setMulticastLoopback` now work correctly when called before the socket is bound.

**Root Cause:** Node.js dgram requires socket to be bound before setting options, but WASM plugins typically set options immediately after socket creation.

**Solution:** Socket manager queues pending options and applies them automatically when bind completes.

**Files Modified:**
- `src/wasm/bindings/socket-manager.ts`
  - Added `PendingOption` interface
  - Added `pendingOptions` array to ManagedSocket
  - Options queued if socket not bound, applied after bind callback

### Real-World Example: Mayara Radar Plugin

The [Mayara](https://github.com/keesverruijt/mayara) project's fork  [mayara-signalk-wasm](https://github.com/dirkwa/mayara/tree/WASM/mayara-signalk-wasm) crate demonstrates the rawSockets capability with a working Furuno radar detector:

- UDP broadcast beacon to `172.31.255.255:10010`
- Periodic polling via `poll()` export
- Radar detection and SignalK delta emission
- Tested with Furuno DRS4D-NXT hardware

**Protocol Details Verified:**
- Furuno beacon: 16-byte packet
- Response header: `01 00 00 01 00 00 00 00 00 01 00` (11 bytes)
- Identity marker: byte 16 = `0x52` ('R')

---

## [2.18.0+wasm5] - 2025-12-04

### Fixed - Resource Delta Version Parameter

Fixed resource deltas not using version 2, which caused resources to be incorrectly cached in the full Signal K model.

**Root Cause:** The `sk_handle_message` FFI binding was calling `app.handleMessage(pluginId, delta)` without the third parameter (version). Per the resource provider documentation, resource deltas must use version 2 to prevent caching in the full model.

**Solution:** Auto-detect resource deltas (paths starting with `resources.`) and apply version 2 automatically.

**Files Modified:**
- `src/wasm/bindings/env-imports.ts` - Added resource path detection and v2 parameter

**Key Code Change:**
```typescript
// Check if this is a resource delta - if so, use version 2
if (isResourceDelta) {
  app.handleMessage(pluginId, delta, 2) // v2 for resources
} else {
  app.handleMessage(pluginId, delta)
}
```

### Changed - SQLite Dependency

Switched from `sqlite3` to `better-sqlite3` for MBTiles chart serving.

**Reason:** `sqlite3` uses outdated `node-pre-gyp` with deprecated dependencies (rimraf, npmlog, gauge, etc.). `better-sqlite3` has modern dependencies and prebuilts for all major platforms.

**Files Modified:**
- `package.json` - Changed optionalDependencies from `sqlite3` to `better-sqlite3`
- `src/wasm/bindings/mbtiles-handler.ts` - Rewrote to use synchronous better-sqlite3 API

---

## [2.18.0+wasm4] - 2025-12-03

### Added - WASM Resource Providers (Phase 3 Complete)

WASM plugins can now register as **resource providers** to serve data via the Signal K REST API.

**Features:**
- `registerResourceProvider(type)` - Register plugin as provider for a resource type
- Export `resource_list`, `resource_get`, `resource_set`, `resource_delete` handlers
- Full ResourcesApi integration - resources accessible at `/signalk/v2/api/resources/{type}`
- SDK support via `signalk-assemblyscript-plugin-sdk/assembly/resources`

**Example Usage:**
```typescript
import { registerResourceProvider, ResourceGetRequest } from 'signalk-assemblyscript-plugin-sdk/assembly/resources'

// In start():
registerResourceProvider('weather')

// Export handlers:
export function resource_list(queryJson: string): string {
  return '{"current":' + cachedData.toJSON() + '}'
}

export function resource_get(requestJson: string): string {
  const req = ResourceGetRequest.parse(requestJson)
  if (req.id === 'current') return data.toJSON()
  return '{"error":"Not found"}'
}
```

**API Access:**
```bash
curl http://localhost:3000/signalk/v2/api/resources/weather
# Returns: {"current":{"temperature":4.24,"humidity":86,...}}

curl http://localhost:3000/signalk/v2/api/resources/weather/current
# Returns: {"temperature":4.24,"humidity":86,...}
```

### Fixed - Resource Provider Instance Timing

Fixed "Resource provider instance not ready" error when calling resource handlers.

**Root Cause:** `registerResourceProvider()` is called during `plugin_start()`, which stores `pluginInstance: null`. The instance reference wasn't being updated after `plugin_start()` completes.

**Solution:** Added `updateResourceProviderInstance()` call in `startWasmPlugin()` AFTER `plugin.instance.exports.start()` completes.

**Files Modified:**
- `src/wasm/loader/plugin-lifecycle.ts` - Added `updateResourceProviderInstance()` after start
- `src/wasm/loader/plugin-registry.ts` - Added migration and update calls

### Fixed - AssemblyScript String Passing in Resource Handlers

Fixed incorrect string passing when calling AssemblyScript resource handlers.

**Root Cause:** `callWasmResourceHandler()` was passing JavaScript strings directly to AssemblyScript exports, but AssemblyScript expects pointers to strings in WASM memory.

**Solution:** Use `asLoader.exports.__newString(requestJson)` to allocate strings in WASM memory before calling handlers.

**Files Modified:**
- `src/wasm/bindings/resource-provider.ts` - Fixed string allocation with `__newString()`

### Changed - Runtime Modular Architecture

Split `wasm-runtime.ts` (~1650 lines) into logical modules for better maintainability:

```
src/wasm/
├── wasm-runtime.ts        # Main entry (~240 lines)
├── types.ts               # Shared type definitions
├── bindings/
│   ├── env-imports.ts     # Host bindings (sk_debug, sk_emit, etc.)
│   ├── resource-provider.ts # Resource provider support
│   └── signalk-api.ts     # Component Model API
├── loaders/
│   ├── standard-loader.ts # AssemblyScript/Rust WASI P1 plugins
│   ├── jco-loader.ts      # Pre-transpiled jco modules
│   └── component-loader.ts # Component Model transpilation
└── utils/
    ├── fetch-wrapper.ts   # Node fetch wrapper for as-fetch
    └── format-detection.ts # WASM format detection
```

### Updated - Weather Plugin v0.2.0

Extended weather plugin to demonstrate resource provider capability:
- Added `resourceProvider: true` capability
- Registers as `weather` resource provider
- Exports `resource_list` and `resource_get` handlers
- Caches weather data for resource queries
- SDK dependency updated to `^0.1.3`

**Files Modified:**
- `examples/wasm-plugins/weather-plugin/assembly/index.ts`
- `examples/wasm-plugins/weather-plugin/package.json` (v0.2.0)

---

## [2.18.0+wasm3] - 2025-12-03

### Added - Custom HTTP Endpoints for WASM Plugins

WASM plugins can now register custom HTTP endpoints to expose REST APIs.

**Features:**
- Export `http_endpoints()` to define GET/POST/PUT/DELETE routes
- Routes mounted at `/plugins/{plugin-id}/{path}`
- Full request context (method, path, query, params, body, headers)
- JSON response format with status codes and custom headers
- Support for both AssemblyScript and Rust plugins

**Files Modified:**
- `src/wasm/loader/plugin-routes.ts`
  - Added Rust buffer-based handler support for HTTP endpoints
  - Same pattern as PUT handlers: `(request_ptr, request_len, response_ptr, response_max_len) -> written_len`

### Fixed - Rust Plugin http_endpoints() Support

#### Root Cause
The `http_endpoints()` call in plugin-routes.ts assumed the function returns a string directly (AssemblyScript style), but Rust plugins use buffer-based FFI with signature `(out_ptr, out_max_len) -> written_len`.

#### Solution
Added dual-mode detection to handle both AssemblyScript and Rust plugin types:
1. Check for `http_endpoints` in both AssemblyScript loader and raw WASM exports
2. For Rust plugins: allocate buffer, call with buffer parameters, read UTF-8 string from WASM memory
3. Properly deallocate memory after reading

**Files Modified:**
- `src/wasm/loader/plugin-routes.ts` (lines 148-192)
  - Fixed detection to check both plugin types
  - Added Rust buffer-based FFI reading for `http_endpoints()`
  - Same memory pattern as other Rust FFI: allocate → call → read → deallocate

**Key Code Changes:**
```typescript
// Check for http_endpoints in either AssemblyScript loader or raw WASM exports
const hasAsEndpoints = plugin.instance.asLoader &&
  typeof plugin.instance.asLoader.exports.http_endpoints === 'function'
const hasRustEndpoints = plugin.instance.instance &&
  typeof (plugin.instance.instance.exports as any).http_endpoints === 'function'

// For Rust plugins: use buffer-based FFI
if (typeof rawExports.allocate === 'function' &&
    typeof rawExports.http_endpoints === 'function') {
  const maxLen = 8192
  const outPtr = rawExports.allocate(maxLen)
  const writtenLen = rawExports.http_endpoints(outPtr, maxLen)

  // Read UTF-8 string from WASM memory
  const memory = rawExports.memory as WebAssembly.Memory
  const bytes = new Uint8Array(memory.buffer, outPtr, writtenLen)
  endpointsJson = new TextDecoder('utf-8').decode(bytes)

  // Deallocate
  if (typeof rawExports.deallocate === 'function') {
    rawExports.deallocate(outPtr, maxLen)
  }
}
```

**Tested:**
- Rust anchor-watch-rust plugin HTTP endpoints verified working
- GET /plugins/anchor-watch-rust/api/status returns JSON status
- GET /plugins/anchor-watch-rust/api/position returns anchor position
- POST /plugins/anchor-watch-rust/api/drop accepts position updates

**Documentation:**
- Added "Custom HTTP Endpoints API" section to WASM_PLUGIN_DEV_GUIDE.md
- Includes AssemblyScript and Rust examples
- Request/response format documentation
- URL routing explanation

**Example Usage (Rust):**
```rust
#[no_mangle]
pub extern "C" fn http_endpoints(out_ptr: *mut u8, out_max_len: usize) -> i32 {
    let endpoints = r#"[{"method": "GET", "path": "/api/data", "handler": "handle_get_data"}]"#;
    write_string(endpoints, out_ptr, out_max_len)
}

#[no_mangle]
pub extern "C" fn handle_get_data(
    request_ptr: *const u8, request_len: usize,
    response_ptr: *mut u8, response_max_len: usize
) -> i32 {
    let response = r#"{"statusCode": 200, "body": "Hello from WASM!"}"#;
    write_string(response, response_ptr, response_max_len)
}
```

---

### Fixed - PUT Handler Registration for WASM Plugins

#### Root Cause
WASM plugins were calling `app.registerPutHandler()` which only exists on the wrapped `appCopy` object for regular Node.js plugins, not on the main `app` object.

#### Solution
Changed to use `app.registerActionHandler()` which is available on the main `app` object and is the correct API for registering PUT handlers from WASM plugins.

**Files Modified:**
- `src/wasm/wasm-runtime.ts` (lines 456-551)
  - Changed `app.registerPutHandler` to `app.registerActionHandler`
  - Fixed argument order: `(context, path, source, callback)`
  - Added `supportsPut` meta emission for discoverability
  - Added diagnostic logging for debugging

**Key Code Changes:**
```typescript
// Before (broken)
app.registerPutHandler(context, path, callback, pluginId)

// After (working)
app.registerActionHandler(context, path, pluginId, callback)
```

### Added - Rust WASM Plugin Example with PUT Handlers

Created complete Rust WASM plugin example demonstrating:
- Buffer-based FFI string passing with `allocate`/`deallocate` exports
- PUT handler registration and handling
- Delta message emission
- Plugin configuration via JSON schema

**Files Created:**
- `examples/wasm-plugins/anchor-watch-rust/` - Complete working example
- `examples/wasm-plugins/anchor-watch-rust/src/lib.rs` - Rust implementation
- `examples/wasm-plugins/anchor-watch-rust/Cargo.toml` - Build configuration
- `examples/wasm-plugins/anchor-watch-rust/package.json` - npm package
- `examples/wasm-plugins/anchor-watch-rust/README.md` - Comprehensive documentation

### Documentation Updates

#### WASM_PLUGIN_DEV_GUIDE.md
- Corrected Rust target from `wasm32-wasi` to `wasm32-wasip1`
- Added comprehensive Rust plugin development section
- Added Rust vs AssemblyScript comparison table
- Added Rust FFI interface reference
- Updated PUT handler examples with Rust code
- Added critical source parameter documentation for PUT requests
- Added debugging section with server log commands

#### Key Finding: PUT Source Parameter
When multiple plugins provide the same Signal K path, PUT requests **must** include a `source` parameter in the body matching the npm package name:

```bash
curl -X PUT .../navigation/anchor/position \
  -d '{"value": {...}, "source": "@signalk/anchor-watch-rust"}'
```

Without the source parameter, clients receive:
```json
{"message": "there are multiple sources for the given path, but no source was specified"}
```

### Technical Details

#### Rust Plugin FFI Interface

Signal K provides these FFI imports in the `env` module:

| Function | Signature | Description |
|----------|-----------|-------------|
| `sk_debug` | `(ptr, len)` | Log debug message |
| `sk_set_status` | `(ptr, len)` | Set plugin status |
| `sk_set_error` | `(ptr, len)` | Set error message |
| `sk_handle_message` | `(ptr, len)` | Emit delta message |
| `sk_register_put_handler` | `(ctx_ptr, ctx_len, path_ptr, path_len) -> i32` | Register PUT handler |

Rust plugins MUST export:

| Export | Signature | Description |
|--------|-----------|-------------|
| `plugin_id` | `(out_ptr, max_len) -> len` | Return plugin ID |
| `plugin_name` | `(out_ptr, max_len) -> len` | Return plugin name |
| `plugin_schema` | `(out_ptr, max_len) -> len` | Return JSON schema |
| `plugin_start` | `(config_ptr, config_len) -> status` | Start plugin |
| `plugin_stop` | `() -> status` | Stop plugin |
| `allocate` | `(size) -> ptr` | Allocate memory for host |
| `deallocate` | `(ptr, size)` | Free allocated memory |

#### PUT Handler Naming Convention

Handler functions follow this pattern:
```
handle_put_{context}_{path}
```
- Replace all dots (`.`) with underscores (`_`)
- Example: `handle_put_vessels_self_navigation_anchor_position`

---

## [2.18.0+wasm2] - 2025-12-03

### Investigated - C#/.NET WASM Support

#### Status: NOT CURRENTLY WORKING

Attempted to add C#/.NET as a third WASM plugin language option using componentize-dotnet. After extensive investigation, discovered fundamental incompatibility between componentize-dotnet and Node.js/V8 (via jco transpilation).

**What Was Tested:**
- .NET 10.0 Preview with `BytecodeAlliance.Componentize.DotNet.Wasm.SDK` 0.7.0-preview00010
- WASI Component Model (P2) compilation target
- jco 1.10.0 for JavaScript transpilation

**What Works:**
- Building .NET WASI Component: ✅
- Transpiling with jco to JavaScript: ✅
- Plugin initialization (`$init`): ✅
- Plugin registration in Signal K: ✅

**What Fails:**
- Calling any exported function results in: `RuntimeError: null function or function signature mismatch`
- Root cause: .NET NativeAOT uses indirect call tables (`call_indirect`) that are initialized by `_initialize()`. This works in Wasmtime but table entries remain null in V8.

**Workarounds Attempted (None Successful):**
1. Manual `_initialize()` call - No effect
2. Manual `InitializeModules()` call - Crashes (already called by `_initialize`)
3. Various jco flags (`--instantiation sync`, `--tla-compat`) - No effect
4. Removing `[ThreadStatic]` attribute - Fixed build issues but not runtime

**Conclusion:**
componentize-dotnet explicitly only supports Wasmtime and WAMR runtimes, not V8/JavaScript. This is a known limitation documented in their README. The issue is deeply embedded in how .NET NativeAOT-LLVM structures WASM output.

**Issue Filed:**
https://github.com/bytecodealliance/componentize-dotnet/issues/103

**Files Created:**
- `examples/wasm-plugins/anchor-watch-dotnet/` - Complete example with documentation
- `examples/wasm-plugins/anchor-watch-dotnet/ISSUE_REPORT.md` - Detailed technical report

**Documentation Updated:**
- `wasm/WASM_PLUGIN_DEV_GUIDE.md` - C#/.NET section marked as NOT WORKING
- `examples/wasm-plugins/anchor-watch-dotnet/README.md` - Marked as NOT WORKING with explanation

**Future Possibilities:**
- Wait for componentize-dotnet to add V8/jco support
- Alternative: Mono interpreter approach (different compilation strategy)
- Alternative: Direct Wasmtime embedding in Node.js (if/when available)

---

## [2.18.0+wasm1] - 2025-01-02

### Added - Asyncify Support for Network Requests

#### FetchHandler Integration
- Integrated `as-fetch/bindings.raw.esm.js` for HTTP request handling in WASM plugins
- Added FetchHandler initialization with resume callback in `wasm-runtime.ts`
- Implemented Asyncify state machine support (Normal, Unwound, Rewound states)
- Added automatic detection and handling of Asyncify state transitions
- Implemented Promise-based async/await pattern for plugin_start()

**Files Modified:**
- `wasm-runtime.ts` (lines 451-566)
  - FetchHandler initialization with main function callback
  - Async plugin_start() with race condition prevention
  - Asyncify state checking and Promise handling
  - Type updates: `start: (config: string) => number | Promise<number>`
- `loader/plugin-lifecycle.ts` (line 106)
  - Made start() await async plugin_start() call
- `wasm-loader.ts`
  - Added FetchHandler import and initialization

**Key Features:**
- Race condition prevention: Promise/callback setup BEFORE calling plugin_start()
- Automatic state transition handling (no developer intervention needed)
- Supports `fetchSync()` from as-fetch library for synchronous-style HTTP requests

### Fixed - Config File Path Resolution

#### Plugin ID Mismatch Issue
- Fixed config file not found on server restart due to plugin ID mismatch
- Changed plugin discovery to load WASM first to get real plugin ID
- Use real plugin ID for config file lookup instead of package name derivation

**Problem:**
- Startup used `weather-plugin-example` (from package name `@signalk/weather-plugin-example`)
- Actual plugin ID from WASM: `weather-example`
- Config file saved by UI: `weather-example.json`
- Startup looked for: `weather-plugin-example.json` ❌

**Solution:**
- Load WASM module at startup to extract real plugin ID
- Use real ID for all config operations
- Reuse loaded instance for enabled plugins (no double-loading)

**Files Modified:**
- `loader/plugin-registry.ts` (lines 85-185)
  - Load WASM first (lines 85-106)
  - Extract plugin ID from exports (line 103)
  - Check config using real ID (lines 109-110)
  - Reuse instance for enabled plugins (line 185)

### Added - Enhanced Logging

#### WASM Plugin Lifecycle Logging
- Added comprehensive debug logging for plugin discovery and lifecycle
- Added structured logging with `signalk:wasm:*` namespaces
- Improved error messages with context and troubleshooting hints

**Log Namespaces:**
- `signalk:wasm:loader` - Plugin discovery and registration
- `signalk:wasm:runtime` - WASM runtime operations and Asyncify
- `signalk:wasm:lifecycle` - Plugin start/stop/reload events
- `signalk:wasm:api` - Server API calls from WASM

**Files Modified:**
- `wasm-runtime.ts` - Added Asyncify state logging
- `loader/plugin-registry.ts` - Added discovery and config loading logs
- `loader/plugin-lifecycle.ts` - Added lifecycle event logs

### Dependencies

#### Added
- `as-fetch` (^2.1.4) - HTTP client library for AssemblyScript with Asyncify support
- `@assemblyscript/loader` (^0.27.x) - AssemblyScript WASM loader

**Files Modified:**
- Root `package.json` - Added as-fetch and @assemblyscript/loader dependencies

### Examples

#### Weather Plugin v0.1.8
Production-ready example demonstrating:
- Asyncify integration with `fetchSync()`
- Real API integration (OpenWeatherMap)
- Network capability usage
- Delta emission for multiple paths
- Configuration schema with validation
- Auto-restart support

**Files:**
- `examples/wasm-plugins/weather-plugin/assembly/index.ts`
  - Complete implementation using fetchSync()
  - Proper error handling and status reporting
- `examples/wasm-plugins/weather-plugin/package.json`
  - Version 0.1.8
  - Dependencies: as-fetch, signalk-assemblyscript-plugin-sdk
  - Capabilities: network, storage, dataRead, dataWrite
- `examples/wasm-plugins/weather-plugin/asconfig.json`
  - Critical: `"transform": ["as-fetch/transform"]` for Asyncify
  - `"bindings": "esm"` for FetchHandler
  - `"exportRuntime": true` for Asyncify state functions
- `examples/wasm-plugins/weather-plugin/README.md`
  - Comprehensive developer onboarding guide
  - Asyncify explanation and usage patterns
  - Troubleshooting guide
  - Configuration requirements

### Documentation

#### Asyncify Implementation Guide
- Created `wasm/ASYNCIFY_IMPLEMENTATION.md`
- Detailed technical architecture documentation
- State machine explanation
- Race condition prevention details
- Debugging guide with log examples
- Common issues and solutions

#### Weather Plugin README
- Complete onboarding guide for new developers
- Step-by-step quick start
- Asyncify concept explanation
- Critical configuration files breakdown
- Code examples with explanations
- Troubleshooting section
- API reference

### Breaking Changes

None. All changes are additive and backward compatible.

### Migration Guide

Existing WASM plugins continue to work without changes. To add network capability:

1. Add as-fetch dependency: `npm install as-fetch@^2.1.4`
2. Enable Asyncify transform in `asconfig.json`:
   ```json
   {
     "options": {
       "bindings": "esm",
       "exportRuntime": true,
       "transform": ["as-fetch/transform"]
     }
   }
   ```
3. Enable network capability in `package.json`:
   ```json
   {
     "wasmCapabilities": {
       "network": true
     }
   }
   ```
4. Use fetchSync() in your plugin:
   ```typescript
   import { fetchSync } from 'as-fetch/sync'

   const response = fetchSync('https://api.example.com/data')
   if (response && response.status === 200) {
     const data = response.text()
     // Process data...
   }
   ```

### Technical Details

#### Asyncify State Machine

**State 0 (Normal)**: Regular WASM execution
- Plugin code runs normally
- No async operations in progress

**State 1 (Unwound/Paused)**: Async operation started
- WASM execution paused
- HTTP request happening in JavaScript
- Call stack saved to Asyncify memory

**State 2 (Rewound/Resuming)**: Async operation completed
- JavaScript callback triggers resume
- WASM execution continues from pause point
- Returns to State 0 (Normal)

#### Race Condition Prevention

The runtime sets up the resume callback BEFORE calling plugin_start() to prevent the callback being undefined if the HTTP request completes very quickly:

```typescript
// 1. Set up Promise and callback FIRST
asyncifyResumeFunction = () => {
  // Re-call plugin_start to continue from rewind state
}

// 2. THEN call plugin_start
let result = asLoaderInstance.exports.plugin_start(configPtr, configLen)

// 3. If unwound, wait for Promise
if (state === 1) {
  await resumePromise
}
```

### Performance Considerations

- **Minimal Overhead**: Asyncify only activates when async operations are used
- **No Double-Loading**: Plugin loaded once, instance reused for enabled plugins
- **Efficient State Management**: Asyncify state checked only when necessary
- **Memory Safe**: All WASM memory operations properly bounded and validated

### Security Considerations

- **Capability System**: Network access requires explicit `"network": true` capability
- **Sandboxed Execution**: WASM plugins run in isolated environment
- **No Direct System Access**: All I/O goes through controlled FFI bridge
- **HTTPS Enforcement**: Recommended for all production API calls

### Known Limitations

- **Node.js 18+ Required**: Native fetch API needed for as-fetch
- **Single Thread**: WASM execution is single-threaded
- **No Streaming**: HTTP responses loaded entirely into memory
- **Asyncify Overhead**: Small performance cost for state machine management

### Future Enhancements

Potential improvements for future versions:
- POST/PUT/DELETE request support with as-fetch
- WebSocket support for real-time data
- Streaming HTTP responses for large data
- HTTP request caching layer
- Rate limiting helpers
- Request retry with exponential backoff

### Credits

- Asyncify implementation based on Binaryen Asyncify transform
- as-fetch library by rockmor (https://github.com/rockmor/as-fetch)
- AssemblyScript compiler and loader (https://www.assemblyscript.org/)

### References

- [Asyncify Implementation Details](../../wasm/ASYNCIFY_IMPLEMENTATION.md)
- [Weather Plugin Example](../../examples/wasm-plugins/weather-plugin/)
- [WASM Plugin Development Guide](../../WASM_PLUGIN_DEV_GUIDE.md)
- [Binaryen Asyncify Documentation](https://github.com/WebAssembly/binaryen/blob/main/src/passes/Asyncify.cpp)
