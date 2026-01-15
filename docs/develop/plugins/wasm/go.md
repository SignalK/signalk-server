---
title: Go/TinyGo Plugins
---

# Creating Go/TinyGo Plugins

Go plugins use TinyGo, a Go compiler designed for small environments including WebAssembly.

## Step 1: Install TinyGo

Download from https://tinygo.org/getting-started/install/

```bash
# Verify installation
tinygo version
```

## Step 2: Create Project Structure

```
my-go-plugin/
├── main.go           # Plugin code
├── go.mod            # Go module
├── package.json      # npm package manifest
├── public/           # Static web assets (optional)
│   └── index.html
└── README.md
```

## Step 3: Create go.mod

```go
module my-go-plugin

go 1.21
```

## Step 4: Create main.go

```go
package main

import (
	"encoding/json"
	"unsafe"
)

// FFI Imports from Signal K host
//go:wasmimport env sk_debug
func sk_debug(ptr *byte, len uint32)

//go:wasmimport env sk_set_status
func sk_set_status(ptr *byte, len uint32)

//go:wasmimport env sk_set_error
func sk_set_error(ptr *byte, len uint32)

//go:wasmimport env sk_handle_message
func sk_handle_message(ptr *byte, len uint32)

// Helper wrappers
func debug(msg string) {
	if len(msg) > 0 {
		sk_debug(unsafe.StringData(msg), uint32(len(msg)))
	}
}

func setStatus(msg string) {
	if len(msg) > 0 {
		sk_set_status(unsafe.StringData(msg), uint32(len(msg)))
	}
}

func handleMessage(msg string) {
	if len(msg) > 0 {
		sk_handle_message(unsafe.StringData(msg), uint32(len(msg)))
	}
}

// Memory allocation for string passing
//export allocate
func allocate(size uint32) *byte {
	buf := make([]byte, size)
	return &buf[0]
}

//export deallocate
func deallocate(ptr *byte, size uint32) {
	// With leaking GC, memory is reclaimed when module unloads
}

// Plugin exports
//export plugin_id
func plugin_id(outPtr *byte, maxLen uint32) int32 {
	return writeString("my-go-plugin", outPtr, maxLen)
}

//export plugin_name
func plugin_name(outPtr *byte, maxLen uint32) int32 {
	return writeString("My Go Plugin", outPtr, maxLen)
}

//export plugin_schema
func plugin_schema(outPtr *byte, maxLen uint32) int32 {
	schema := `{"type":"object","properties":{}}`
	return writeString(schema, outPtr, maxLen)
}

//export plugin_start
func plugin_start(configPtr *byte, configLen uint32) int32 {
	debug("Go plugin starting")
	setStatus("Running")

	// Emit a test delta
	delta := `{"updates":[{"values":[{"path":"test.goPlugin","value":"hello from Go"}]}]}`
	handleMessage(delta)

	return 0
}

//export plugin_stop
func plugin_stop() int32 {
	debug("Go plugin stopped")
	setStatus("Stopped")
	return 0
}

// Helper: write string to output buffer
func writeString(s string, ptr *byte, maxLen uint32) int32 {
	bytes := []byte(s)
	length := len(bytes)
	if uint32(length) > maxLen {
		length = int(maxLen)
	}
	dst := unsafe.Slice(ptr, length)
	copy(dst, bytes[:length])
	return int32(length)
}

// Required for TinyGo WASM
func main() {}
```

## Step 5: Create package.json

```json
{
  "name": "my-go-wasm-plugin",
  "version": "0.1.0",
  "description": "My Go WASM plugin",
  "keywords": ["signalk-wasm-plugin"],
  "wasmManifest": "plugin.wasm",
  "wasmCapabilities": {
    "dataRead": true,
    "dataWrite": true,
    "storage": "vfs-only"
  }
}
```

> **Note**: The package name can be anything - there's no requirement for `@signalk/` scope. The `wasmManifest` field is what identifies this as a WASM plugin.

## Step 6: Build

```bash
# Release build (smaller, optimized)
tinygo build -o plugin.wasm -target=wasip1 -gc=leaking -no-debug main.go

# Debug build (for development)
tinygo build -o plugin.wasm -target=wasip1 main.go
```

## Step 7: Install

**Option 1: Symlink (Recommended for Development)**

```bash
cd ~/.signalk/node_modules
ln -s /path/to/your/my-go-wasm-plugin my-go-wasm-plugin
```

**Option 2: Direct Copy**

```bash
mkdir -p ~/.signalk/node_modules/my-go-wasm-plugin
cp plugin.wasm package.json ~/.signalk/node_modules/my-go-wasm-plugin/
```

## Go FFI Interface Reference

Signal K provides these FFI imports in the `env` module:

| Function                        | Parameters   | Description                   |
| ------------------------------- | ------------ | ----------------------------- |
| `sk_debug`                      | `(ptr, len)` | Log debug message             |
| `sk_set_status`                 | `(ptr, len)` | Set plugin status             |
| `sk_set_error`                  | `(ptr, len)` | Set error message             |
| `sk_handle_message`             | `(ptr, len)` | Emit delta message            |
| `sk_register_resource_provider` | `(ptr, len)` | Register as resource provider |

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

## TinyGo Limitations

TinyGo is a subset of Go. Notable limitations:

- No reflection (limited `encoding/json` support)
- No goroutines with WASI Preview 1
- Garbage collector options: `leaking` (recommended), `conservative`
- Some standard library packages unavailable

See https://tinygo.org/docs/reference/lang-support/ for details.

## Additional Resources

See the example-routes-waypoints plugin in `examples/wasm-plugins/example-routes-waypoints/` for a complete resource provider plugin.
