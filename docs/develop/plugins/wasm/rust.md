---
title: Rust Plugins
---

# Creating Rust Plugins

Rust is excellent for WASM plugins due to its zero-cost abstractions, memory safety, and mature WASM tooling. Signal K Rust plugins use **buffer-based FFI** for string passing, which differs from AssemblyScript's automatic string handling.

## Rust vs AssemblyScript: Key Differences

| Aspect            | AssemblyScript          | Rust                            |
| ----------------- | ----------------------- | ------------------------------- |
| String passing    | Automatic via AS loader | Manual buffer-based FFI         |
| Memory management | AS runtime handles      | `allocate`/`deallocate` exports |
| Binary size       | 3-10 KB                 | 50-200 KB                       |
| Target            | `wasm32` (AS compiler)  | `wasm32-wasip1`                 |

## Step 1: Project Structure

Create a new Rust library project:

```bash
cargo new --lib example-anchor-watch-rust
cd example-anchor-watch-rust
```

## Step 2: Configure Cargo.toml

```toml
[package]
name = "anchor_watch_rust"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[profile.release]
opt-level = "z"     # Optimize for size
lto = true          # Link-time optimization
strip = true        # Strip symbols
```

## Step 3: Implement Plugin (src/lib.rs)

```rust
use std::cell::RefCell;
use serde::{Deserialize, Serialize};

// =============================================================================
// FFI Imports - These MUST match what the Signal K runtime provides in "env"
// =============================================================================

#[link(wasm_import_module = "env")]
extern "C" {
    fn sk_debug(ptr: *const u8, len: usize);
    fn sk_set_status(ptr: *const u8, len: usize);
    fn sk_set_error(ptr: *const u8, len: usize);
    fn sk_handle_message(ptr: *const u8, len: usize);
    fn sk_register_put_handler(
        context_ptr: *const u8, context_len: usize,
        path_ptr: *const u8, path_len: usize
    ) -> i32;
}

// =============================================================================
// Helper wrappers for FFI functions
// =============================================================================

fn debug(msg: &str) {
    unsafe { sk_debug(msg.as_ptr(), msg.len()); }
}

fn set_status(msg: &str) {
    unsafe { sk_set_status(msg.as_ptr(), msg.len()); }
}

fn set_error(msg: &str) {
    unsafe { sk_set_error(msg.as_ptr(), msg.len()); }
}

fn handle_message(msg: &str) {
    unsafe { sk_handle_message(msg.as_ptr(), msg.len()); }
}

fn register_put_handler(context: &str, path: &str) -> i32 {
    unsafe {
        sk_register_put_handler(
            context.as_ptr(), context.len(),
            path.as_ptr(), path.len()
        )
    }
}

// =============================================================================
// Memory Allocation - REQUIRED for buffer-based string passing
// =============================================================================

/// Allocate memory for string passing from host
#[no_mangle]
pub extern "C" fn allocate(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Deallocate memory
#[no_mangle]
pub extern "C" fn deallocate(ptr: *mut u8, size: usize) {
    unsafe {
        let _ = Vec::from_raw_parts(ptr, 0, size);
    }
}

// =============================================================================
// Plugin State
// =============================================================================

thread_local! {
    static STATE: RefCell<PluginState> = RefCell::new(PluginState::default());
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PluginConfig {
    #[serde(default)]
    max_radius: f64,
}

#[derive(Debug, Default)]
struct PluginState {
    config: PluginConfig,
    is_running: bool,
}

// =============================================================================
// Plugin Exports - Core plugin interface
// =============================================================================

static PLUGIN_ID: &str = "my-rust-plugin";
static PLUGIN_NAME: &str = "My Rust Plugin";
static PLUGIN_SCHEMA: &str = r#"{
    "type": "object",
    "properties": {
        "maxRadius": {
            "type": "number",
            "title": "Max Radius",
            "default": 50
        }
    }
}"#;

/// Return the plugin ID (buffer-based)
#[no_mangle]
pub extern "C" fn plugin_id(out_ptr: *mut u8, out_max_len: usize) -> i32 {
    write_string(PLUGIN_ID, out_ptr, out_max_len)
}

/// Return the plugin name (buffer-based)
#[no_mangle]
pub extern "C" fn plugin_name(out_ptr: *mut u8, out_max_len: usize) -> i32 {
    write_string(PLUGIN_NAME, out_ptr, out_max_len)
}

/// Return the plugin JSON schema (buffer-based)
#[no_mangle]
pub extern "C" fn plugin_schema(out_ptr: *mut u8, out_max_len: usize) -> i32 {
    write_string(PLUGIN_SCHEMA, out_ptr, out_max_len)
}

/// Start the plugin with configuration
#[no_mangle]
pub extern "C" fn plugin_start(config_ptr: *const u8, config_len: usize) -> i32 {
    // Read config from buffer
    let config_json = unsafe {
        let slice = std::slice::from_raw_parts(config_ptr, config_len);
        String::from_utf8_lossy(slice).to_string()
    };

    // Parse configuration
    let parsed_config: PluginConfig = match serde_json::from_str(&config_json) {
        Ok(c) => c,
        Err(e) => {
            set_error(&format!("Failed to parse config: {}", e));
            return 1;
        }
    };

    // Update state
    STATE.with(|state| {
        let mut s = state.borrow_mut();
        s.config = parsed_config;
        s.is_running = true;
    });

    debug("Plugin started successfully");
    set_status("Running");

    0 // Success
}

/// Stop the plugin
#[no_mangle]
pub extern "C" fn plugin_stop() -> i32 {
    STATE.with(|state| {
        state.borrow_mut().is_running = false;
    });

    debug("Plugin stopped");
    set_status("Stopped");

    0 // Success
}

// =============================================================================
// Helper Functions
// =============================================================================

/// Write string to output buffer, return bytes written
fn write_string(s: &str, ptr: *mut u8, max_len: usize) -> i32 {
    let bytes = s.as_bytes();
    let len = bytes.len().min(max_len);
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, len);
    }
    len as i32
}
```

## Step 4: Create package.json

```json
{
  "name": "my-rust-wasm-plugin",
  "version": "0.1.0",
  "description": "My Rust WASM plugin for Signal K",
  "keywords": ["signalk-wasm-plugin"],
  "wasmManifest": "plugin.wasm",
  "wasmCapabilities": {
    "network": false,
    "storage": "vfs-only",
    "dataRead": true,
    "dataWrite": true,
    "putHandlers": true
  },
  "author": "Your Name",
  "license": "Apache-2.0"
}
```

> **Note**: The package name can be anything - there's no requirement for `@signalk/` scope. The `wasmManifest` field is what identifies this as a WASM plugin.

## Step 5: Build

```bash
# Build with WASI Preview 1 target (required for Signal K)
cargo build --release --target wasm32-wasip1

# Copy to plugin.wasm
cp target/wasm32-wasip1/release/my_rust_plugin.wasm plugin.wasm
```

> **Important**: Use `wasm32-wasip1` target, NOT `wasm32-wasi`. Signal K requires WASI Preview 1.

## Step 6: Install

**Option 1: Symlink (Recommended for Development)**

```bash
cd ~/.signalk/node_modules
ln -s /path/to/your/my-rust-wasm-plugin my-rust-wasm-plugin
```

**Option 2: Direct Copy**

```bash
mkdir -p ~/.signalk/node_modules/my-rust-wasm-plugin
cp plugin.wasm package.json ~/.signalk/node_modules/my-rust-wasm-plugin/
```

**Option 3: NPM Package Install**

```bash
npm pack
npm install -g ./my-rust-wasm-plugin-0.1.0.tgz
```

## Step 7: Enable in Admin UI

1. Navigate to **Server** → **Plugin Config**
2. Find "My Rust Plugin"
3. Click **Enable**
4. Configure settings
5. Click **Submit**

## Rust FFI Interface Reference

Signal K provides these FFI imports in the `env` module:

| Function                  | Parameters                               | Description          |
| ------------------------- | ---------------------------------------- | -------------------- |
| `sk_debug`                | `(ptr, len)`                             | Log debug message    |
| `sk_set_status`           | `(ptr, len)`                             | Set plugin status    |
| `sk_set_error`            | `(ptr, len)`                             | Set error message    |
| `sk_handle_message`       | `(ptr, len)`                             | Emit delta message   |
| `sk_register_put_handler` | `(ctx_ptr, ctx_len, path_ptr, path_len)` | Register PUT handler |

> **IMPORTANT: Use Exact Function Names**
>
> You MUST use the exact function names listed above. Common mistakes:
>
> - `sk_log_debug`, `sk_log_info`, `sk_log_warn` → Use `sk_debug` for all logging
> - `sk_emit_delta` → Use `sk_handle_message`
> - `sk_udp_recv_from` → Use `sk_udp_recv`
>
> There is only one logging function (`sk_debug`). If you need log levels, prefix your message:
>
> ```rust
> debug("[INFO] Starting radar scan");
> debug("[WARN] Connection timeout");
> ```

## Required Plugin Exports

Your plugin MUST export:

| Export          | Signature                            | Description        |
| --------------- | ------------------------------------ | ------------------ |
| `plugin_id`     | `(out_ptr, max_len) -> len`          | Return plugin ID   |
| `plugin_name`   | `(out_ptr, max_len) -> len`          | Return plugin name |
| `plugin_schema` | `(out_ptr, max_len) -> len`          | Return JSON schema |
| `plugin_start`  | `(config_ptr, config_len) -> status` | Start plugin       |
| `plugin_stop`   | `() -> status`                       | Stop plugin        |
| `allocate`      | `(size) -> ptr`                      | Allocate memory    |
| `deallocate`    | `(ptr, size)`                        | Free memory        |

## Optional Plugin Exports

Your plugin MAY export:

| Export           | Signature                | Description                                                                                                                                          |
| ---------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `poll`           | `() -> status`           | Called every 1 second while plugin is running. Useful for polling hardware, sockets, or external systems. Return 0 for success, non-zero for errors. |
| `http_endpoints` | `() -> json`             | Return JSON array of HTTP endpoint definitions                                                                                                       |
| `delta_handler`  | `(delta_ptr, delta_len)` | Receives Signal K deltas as JSON strings. Called for every delta emitted by the server.                                                              |

## Additional Resources

See the example-anchor-watch-rust plugin in `examples/wasm-plugins/example-anchor-watch-rust/` for a complete working plugin with PUT handlers.
