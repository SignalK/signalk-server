# Example Anchor Watch - Rust WASM Plugin

A Signal K WASM plugin written in Rust demonstrating:

- Rust WASM compilation for Signal K (wasm32-wasip1 target)
- PUT handler registration and handling
- **Custom HTTP endpoints** (REST API)
- Delta message emission
- Plugin configuration via JSON schema
- Buffer-based FFI string passing

## Status: Working

This plugin is fully functional and tested on Signal K Server 3.0+ running on Raspberry Pi 5.

## Features

- **Anchor Position Tracking** - Set and monitor anchor position via PUT requests
- **Radius Alarm** - Configure maximum swing radius (10-1000 meters)
- **PUT Handlers** - Control anchor watch via Signal K PUT requests
- **Custom HTTP REST API** - Query status and drop anchor via HTTP endpoints
- **Real-time Updates** - Emits delta messages for state changes
- **Plugin State Control** - Anchor watch state tied to plugin enable/disable

## Prerequisites

### Rust Toolchain

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WASI Preview 1 target (required for Signal K WASM runtime)
rustup target add wasm32-wasip1
```

## Building

### WASI Preview 1 (Required)

Signal K Server uses the WASI Preview 1 runtime. Build with:

```bash
cargo build --release --target wasm32-wasip1
```

Output: `target/wasm32-wasip1/release/anchor_watch_rust.wasm`

### Copy to Plugin Directory

```bash
cp target/wasm32-wasip1/release/anchor_watch_rust.wasm plugin.wasm
```

## Installation

### Option 1: Direct Copy (Development)

```bash
# Create plugin directory
mkdir -p ~/.signalk/node_modules/@signalk/example-anchor-watch-rust

# Copy files
cp plugin.wasm package.json ~/.signalk/node_modules/@signalk/example-anchor-watch-rust/
```

### Option 2: npm pack (Distribution)

```bash
npm pack
# Install on target system
npm install -g ./signalk-anchor-watch-rust-0.1.0.tgz
```

## Configuration

Enable and configure the plugin via the Signal K Admin UI under **Server → Plugin Config**. Configuration options are documented in the plugin's schema.

## PUT Handlers

The plugin registers PUT handlers for vessel control. **Important**: When multiple sources provide the same path, you must specify the source in the PUT request body.

### navigation.anchor.position

Set the anchor position:

```bash
curl -X PUT http://localhost:3000/signalk/v1/api/vessels/self/navigation/anchor/position \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"value": {"latitude": 52.1234, "longitude": 4.5678}, "source": "@signalk/example-anchor-watch-rust"}'
```

### navigation.anchor.maxRadius

Set the maximum swing radius (meters):

```bash
curl -X PUT http://localhost:3000/signalk/v1/api/vessels/self/navigation/anchor/maxRadius \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"value": 75, "source": "@signalk/example-anchor-watch-rust"}'
```

### navigation.anchor.state

Query anchor watch state (informational - state is controlled by enabling/disabling the plugin):

```bash
curl -X PUT http://localhost:3000/signalk/v1/api/vessels/self/navigation/anchor/state \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"value": "on", "source": "@signalk/example-anchor-watch-rust"}'
```

**Note**: The anchor watch state is actually controlled by enabling/disabling the plugin itself. The PUT handler returns a success response but the actual state change requires toggling the plugin.

## HTTP Endpoints (REST API)

The plugin exposes custom HTTP endpoints for status queries and anchor control. These are mounted at `/plugins/_signalk_example-anchor-watch-rust/`.

### GET /api/status

Returns current anchor watch status:

```bash
curl http://localhost:3000/plugins/_signalk_example-anchor-watch-rust/api/status
```

**Response:**

```json
{
  "running": true,
  "alarmActive": false,
  "position": { "latitude": 52.1234, "longitude": 4.5678 },
  "maxRadius": 50,
  "checkInterval": 10
}
```

### GET /api/position

Returns current anchor position:

```bash
curl http://localhost:3000/plugins/_signalk_example-anchor-watch-rust/api/position
```

**Response:**

```json
{
  "latitude": 52.1234,
  "longitude": 4.5678,
  "maxRadius": 50
}
```

### POST /api/drop

Drop anchor at a specified position:

```bash
curl -X POST http://localhost:3000/plugins/_signalk_example-anchor-watch-rust/api/drop \
  -H "Content-Type: application/json" \
  -d '{"latitude": 52.1234, "longitude": 4.5678, "maxRadius": 75}'
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `latitude` | number | Yes | Latitude in degrees (-90 to 90) |
| `longitude` | number | Yes | Longitude in degrees (-180 to 180) |
| `maxRadius` | number | No | Max swing radius in meters (default: 50) |

**Response:**

```json
{
  "success": true,
  "message": "Anchor dropped",
  "position": { "latitude": 52.1234, "longitude": 4.5678 },
  "maxRadius": 75
}
```

### HTTP Authentication

Note: If Signal K server security is enabled, you need to authenticate first:

```bash
# Login and save cookie
curl -X POST http://localhost:3000/signalk/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}' \
  -c cookies.txt

# Use cookie for API requests
curl -b cookies.txt http://localhost:3000/plugins/_signalk_example-anchor-watch-rust/api/status
```

## Source Parameter

When multiple plugins/providers write to the same Signal K path, PUT requests require a `source` parameter to identify which handler should process the request.

For this plugin, use: `"source": "@signalk/example-anchor-watch-rust"`

The source name matches the npm package name declared in `package.json`.

## Signal K Paths

The plugin emits delta updates to these paths:

| Path                          | Type                      | Description                                   |
| ----------------------------- | ------------------------- | --------------------------------------------- |
| `navigation.anchor.position`  | `{ latitude, longitude }` | Anchor position in degrees                    |
| `navigation.anchor.maxRadius` | number                    | Maximum swing radius in meters                |
| `navigation.anchor.state`     | string                    | "on" when plugin enabled, "off" when disabled |

## Project Structure

```
example-anchor-watch-rust/
├── Cargo.toml           # Rust package manifest
├── package.json         # npm package for Signal K
├── plugin.wasm          # Built WASM binary (after build)
├── README.md
└── src/
    └── lib.rs           # Plugin implementation
```

## Technical Details

### FFI Interface

The plugin uses raw FFI to communicate with the Signal K server:

**Imports from host (env module):**

- `sk_debug(ptr, len)` - Log debug message
- `sk_set_status(ptr, len)` - Set plugin status
- `sk_set_error(ptr, len)` - Set error message
- `sk_handle_message(ptr, len)` - Emit delta message
- `sk_register_put_handler(ctx_ptr, ctx_len, path_ptr, path_len)` - Register PUT handler

**Exports to host:**

- `plugin_id(out_ptr, max_len) -> len` - Return plugin ID
- `plugin_name(out_ptr, max_len) -> len` - Return plugin name
- `plugin_schema(out_ptr, max_len) -> len` - Return JSON schema
- `plugin_start(config_ptr, config_len) -> status` - Start plugin
- `plugin_stop() -> status` - Stop plugin
- `allocate(size) -> ptr` - Allocate memory for host-to-WASM strings
- `deallocate(ptr, size)` - Free allocated memory

**PUT Handlers:**

- `handle_put_vessels_self_navigation_anchor_position(value_ptr, value_len, response_ptr, response_max_len) -> len`
- `handle_put_vessels_self_navigation_anchor_maxRadius(value_ptr, value_len, response_ptr, response_max_len) -> len`
- `handle_put_vessels_self_navigation_anchor_state(value_ptr, value_len, response_ptr, response_max_len) -> len`

**HTTP Endpoints:**

- `http_endpoints(out_ptr, max_len) -> len` - Return JSON array of endpoint definitions
- `http_get_status(request_ptr, request_len, response_ptr, response_max_len) -> len` - GET /api/status
- `http_get_position(request_ptr, request_len, response_ptr, response_max_len) -> len` - GET /api/position
- `http_post_drop(request_ptr, request_len, response_ptr, response_max_len) -> len` - POST /api/drop

### PUT Handler Naming Convention

Handler function names follow this pattern:

```
handle_put_{context}_{path}
```

- Replace all dots (`.`) with underscores (`_`)
- Context: `vessels.self` → `vessels_self`
- Path: `navigation.anchor.position` → `navigation_anchor_position`

### Memory Management

Rust plugins use buffer-based string passing:

1. Host calls `allocate(size)` to get memory for input
2. Host writes UTF-8 bytes to allocated memory
3. Plugin reads input and writes output to provided buffer
4. Host calls `deallocate(ptr, size)` to free memory

This differs from AssemblyScript plugins which use the AS loader for automatic string conversion.

## Development

```bash
# Check code
cargo check --target wasm32-wasip1

# Build debug
cargo build --target wasm32-wasip1

# Build release (optimized)
cargo build --release --target wasm32-wasip1

# Copy to plugin.wasm
cp target/wasm32-wasip1/release/anchor_watch_rust.wasm plugin.wasm
```

### Debugging

Enable debug logging on the Signal K server:

```bash
DEBUG=signalk:wasm:* signalk-server
```

Or use journalctl on systemd systems:

```bash
journalctl -u signalk -f | grep wasm
```

## Binary Size

Rust WASM plugins are typically 50-200 KB when optimized:

```bash
# Check size
ls -lh target/wasm32-wasip1/release/anchor_watch_rust.wasm
# Expected: ~100-150 KB
```

### Size Optimization

The `Cargo.toml` includes optimizations:

```toml
[profile.release]
opt-level = "z"     # Optimize for size
lto = true          # Link-time optimization
strip = true        # Strip debug symbols
```

Further optimization with `wasm-opt` (optional):

```bash
wasm-opt -Oz plugin.wasm -o plugin.optimized.wasm
```

## Troubleshooting

### Plugin not loading

- Verify `wasmManifest` in `package.json` points to correct file
- Check that `plugin.wasm` exists and is readable
- Enable debug logging: `DEBUG=signalk:wasm:*`

### PUT handlers not registering

- Check `"putHandlers": true` in `wasmCapabilities`
- Verify handler function names match the pattern exactly
- Check server logs for registration messages

### HTTP endpoints returning 404

- Check `"httpEndpoints": true` in `wasmCapabilities`
- Verify `http_endpoints()` export returns valid JSON array
- Check that handler function names match exactly
- Enable debug logging: `DEBUG=signalk:wasm:*`

### PUT requests return "multiple sources" error

- Add `"source": "@signalk/example-anchor-watch-rust"` to the request body
- The source must match the package name in `package.json`

### Memory errors

- Ensure `allocate` and `deallocate` are exported
- Check buffer sizes in handler functions
- Verify UTF-8 encoding of all strings

## Dependencies

### Rust Crates (Cargo.toml)

- `serde` (1.0) - JSON serialization with derive macros
- `serde_json` (1.0) - JSON parsing

### No external WASM libraries needed

The plugin uses only Rust standard library and serde for JSON. No wasm-bindgen or other WASM-specific crates required.

## License

Apache-2.0
