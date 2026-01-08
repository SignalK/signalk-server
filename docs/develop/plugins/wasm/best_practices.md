---
title: Best Practices for WASM Plugins
---

# Best Practices for WASM Plugins

## Hot Reload

WASM plugins support hot-reload without server restart:

### Manual Reload

1. Build new WASM binary: `cargo build --target wasm32-wasip1 --release`
2. Copy to plugin directory: `cp target/wasm32-wasip1/release/*.wasm ~/.signalk/...`
3. In Admin UI: **Server** → **Plugin Config** → Click **Reload** button

### Reload Behavior

During reload:

- `stop()` is called on old instance
- Subscriptions are preserved
- Deltas are buffered (not lost)
- New instance is loaded
- `start()` is called with saved config
- Buffered deltas are replayed

## Error Handling

### Crash Recovery

If a WASM plugin crashes:

1. **First crash**: Automatic restart after 1 second
2. **Second crash**: Restart after 2 seconds
3. **Third crash**: Restart after 4 seconds
4. **After 3 crashes**: Plugin disabled, admin notification

### Error Reporting

Report errors to admin UI:

```rust
fn handle_error(err: &str) {
    sk_set_error(&format!("Error: {}", err));
}
```

## Optimization

### 1. Minimize Binary Size

```toml
[profile.release]
opt-level = "z"     # Optimize for size
lto = true          # Enable link-time optimization
strip = true        # Strip debug symbols
```

Use `wasm-opt` for further optimization:

```bash
wasm-opt -Oz plugin.wasm -o plugin.wasm
```

### 2. Handle Errors Gracefully

```rust
fn start(config_ptr: *const u8, config_len: usize) -> i32 {
    match initialize_plugin(config_ptr, config_len) {
        Ok(_) => {
            sk_set_status("Started");
            0 // Success
        }
        Err(e) => {
            sk_set_error(&format!("Failed to start: {}", e));
            1 // Error
        }
    }
}
```

### 3. Use Efficient JSON Parsing

```rust
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct Config {
    #[serde(default)]
    enabled: bool,
}

fn parse_config(json: &str) -> Result<Config, serde_json::Error> {
    serde_json::from_str(json)
}
```

### 4. Limit Memory Usage

- Avoid large allocations
- Clear buffers after use
- Use streaming for large data

### WASM Memory Limitations

WASM plugins running in Node.js have **~64KB buffer limitations** for stdin/stdout operations. This is a fundamental limitation of the Node.js WASI implementation, not a Signal K restriction.

**Impact:**

- Small JSON responses (< 64KB): Work fine in pure WASM
- Medium data (64KB - 1MB): May freeze or fail
- Large data (> 1MB): Will fail or freeze the server

**Hybrid Architecture Pattern**

For plugins that need to handle large data volumes (logs, file streaming, large JSON responses), use a **hybrid approach**:

- **WASM Plugin**: Registers HTTP endpoints and provides configuration UI
- **Node.js Handler**: Server intercepts specific endpoints and handles I/O directly in Node.js
- **Result**: Can handle unlimited data without memory constraints

Use this pattern when your plugin needs to:

- Return large JSON responses (> 64KB)
- Process large file uploads
- Handle streaming data

### 5. Provide Good UX

- Clear status messages
- Descriptive error messages
- Comprehensive JSON schema for configuration

## Debugging

### Logging

```rust
fn debug_log(message: &str) {
    unsafe {
        sk_debug(message.as_ptr(), message.len());
    }
}
```

### Testing Locally

1. Build with debug symbols: `cargo build --target wasm32-wasip1`
2. Use `wasmtime` for local testing:

```bash
wasmtime --dir /tmp::/ plugin.wasm
```

### Enable Server Debug Logging

```bash
# Linux/macOS
DEBUG=signalk:wasm:* signalk-server
```

### Common Issues

**Issue**: Plugin doesn't load
**Solution**: Check `wasmManifest` path in package.json

**Issue**: Capability errors
**Solution**: Ensure required capabilities declared in package.json

**Issue**: Crashes on start
**Solution**: Check server logs for error details

## Migration from Node.js

### 1. Assess Compatibility

Check if your plugin:

- ✅ Processes deltas
- ✅ Reads/writes configuration
- ✅ Uses data model APIs
- ✅ Registers REST endpoints
- ❌ Uses serial ports (planned but not there yet)
- ✅ Makes HTTP requests (via as-fetch in AssemblyScript)
- ✅ Uses UDP/TCP sockets (rawSockets capability)

### 2. Port Logic to Rust

Convert TypeScript/JavaScript logic to Rust:

**Before (Node.js):**

```javascript
plugin.start = function (config) {
  app.handleMessage('my-plugin', {
    updates: [{ values: [{ path: 'foo', value: 'bar' }] }]
  })
}
```

**After (WASM/Rust):**

```rust
fn start(config_ptr: *const u8, config_len: usize) -> i32 {
    let delta = json!({
        "updates": [{ "values": [{ "path": "foo", "value": "bar" }] }]
    });
    sk_emit_delta(&delta.to_string());
    0
}
```

### 3. Migrate Data

Use migration helper to copy existing data to VFS:

```rust
fn first_run_migration() {
    // Server provides migration API
    // Copies files from ~/.signalk/plugin-config-data/{id}/
    // to ~/.signalk/plugin-config-data/{id}/vfs/data/
}
```

## Example Plugins

The following example plugins are available in the repository:

- [example-hello-assemblyscript](https://github.com/SignalK/signalk-server/tree/master/examples/wasm-plugins/example-hello-assemblyscript) - Minimal AssemblyScript plugin that emits a delta on start
- [example-anchor-watch-rust](https://github.com/SignalK/signalk-server/tree/master/examples/wasm-plugins/example-anchor-watch-rust) - Anchor watch plugin in Rust
- [example-routes-waypoints](https://github.com/SignalK/signalk-server/tree/master/examples/wasm-plugins/example-routes-waypoints) - Resource provider for routes and waypoints
- [example-weather-provider](https://github.com/SignalK/signalk-server/tree/master/examples/wasm-plugins/example-weather-provider) - Weather API provider implementation
- [example-weather-plugin](https://github.com/SignalK/signalk-server/tree/master/examples/wasm-plugins/example-weather-plugin) - Weather data plugin
