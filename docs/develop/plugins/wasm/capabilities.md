---
title: Plugin Capabilities
---

# Plugin Capabilities

## Capability Types

Declare required capabilities in `package.json`:

| Capability      | Description                              | Status                          |
| --------------- | ---------------------------------------- | ------------------------------- |
| `dataRead`      | Read Signal K data model                 | Supported                       |
| `dataWrite`     | Emit delta messages                      | Supported                       |
| `storage`       | Write to VFS (`vfs-only`)                | Supported                       |
| `httpEndpoints` | Register custom HTTP endpoints           | Supported                       |
| `staticFiles`   | Serve HTML/CSS/JS from `public/` folder  | Supported                       |
| `network`       | HTTP requests (via as-fetch)             | Supported (AssemblyScript only) |
| `putHandlers`   | Register PUT handlers for vessel control | Supported                       |
| `rawSockets`    | UDP socket access for radar, NMEA, etc.  | Supported                       |
| `serverEvents`  | Receive and emit server/NMEA events      | Supported                       |
| `serialPorts`   | Serial port access                       | Planned                         |

## Network API (AssemblyScript)

AssemblyScript plugins can make HTTP requests using the `as-fetch` library integrated into the SDK.

**Requirements:**

- Plugin must declare `"network": true` in manifest
- Server must be running Node.js 18+ (for native fetch support)
- Import network functions from SDK
- Must add `"transform": ["as-fetch/transform"]` to `asconfig.json` options
- Must set `"exportRuntime": true` in `asconfig.json` options

**Example: HTTP GET Request**

```typescript
import {
  httpGet,
  hasNetworkCapability
} from '@signalk/assemblyscript-plugin-sdk/assembly/network'
import { debug, setError } from '@signalk/assemblyscript-plugin-sdk/assembly'

class MyPlugin extends Plugin {
  start(config: string): i32 {
    // Always check capability first
    if (!hasNetworkCapability()) {
      setError('Network capability not granted')
      return 1
    }

    // Make HTTP GET request
    const response = httpGet('https://api.example.com/data')
    if (response === null) {
      setError('HTTP request failed')
      return 1
    }

    debug('Received: ' + response)
    return 0
  }
}
```

**Available Network Functions:**

```typescript
// Check if network capability is granted
hasNetworkCapability(): boolean

// HTTP GET request - returns response body or null on error
httpGet(url: string): string | null

// HTTP POST request - returns status code or -1 on error
httpPost(url: string, body: string): i32

// HTTP POST with response - returns response body or null
httpPostWithResponse(url: string, body: string): string | null

// HTTP PUT request - returns status code or -1 on error
httpPut(url: string, body: string): i32

// HTTP DELETE request - returns status code or -1 on error
httpDelete(url: string): i32

// Advanced HTTP request with full control
httpRequest(
  url: string,
  method: string,
  body: string | null,
  contentType: string | null
): HttpResponse | null
```

**Build Configuration (asconfig.json):**

For plugins using network capability:

```json
{
  "targets": {
    "release": {
      "outFile": "build/plugin.wasm",
      "optimize": true,
      "shrinkLevel": 2,
      "runtime": "stub"
    }
  },
  "options": {
    "bindings": "esm",
    "exportRuntime": true,
    "transform": ["as-fetch/transform"]
  }
}
```

**Manifest Configuration:**

```json
{
  "name": "my-plugin",
  "wasmCapabilities": {
    "network": true
  },
  "dependencies": {
    "@signalk/assemblyscript-plugin-sdk": "^0.2.0",
    "as-fetch": "^2.1.4"
  }
}
```

## Raw Sockets API (UDP)

The `rawSockets` capability enables direct UDP socket access for plugins that need to communicate with devices like:

- Marine radars (Navico, Raymarine, Furuno, Garmin)
- NMEA 0183 over UDP
- AIS receivers
- Other marine electronics using UDP multicast

**Requirements:**

- Plugin must declare `"rawSockets": true` in manifest
- Sockets are non-blocking (poll-based receive)
- Automatic cleanup when plugin stops

**Manifest Configuration:**

```json
{
  "name": "my-radar-plugin",
  "wasmManifest": "plugin.wasm",
  "wasmCapabilities": {
    "rawSockets": true,
    "dataWrite": true
  }
}
```

**FFI Functions Available:**

| Function                        | Signature                                                              | Description                                             |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `sk_udp_create`                 | `(type: i32) -> i32`                                                   | Create socket (0=udp4, 1=udp6). Returns socket_id or -1 |
| `sk_udp_bind`                   | `(socket_id, port) -> i32`                                             | Bind to port (0=any). Returns 0 or -1                   |
| `sk_udp_join_multicast`         | `(socket_id, addr_ptr, addr_len, iface_ptr, iface_len) -> i32`         | Join multicast group                                    |
| `sk_udp_leave_multicast`        | `(socket_id, addr_ptr, addr_len, iface_ptr, iface_len) -> i32`         | Leave multicast group                                   |
| `sk_udp_set_multicast_ttl`      | `(socket_id, ttl) -> i32`                                              | Set multicast TTL                                       |
| `sk_udp_set_multicast_loopback` | `(socket_id, enabled) -> i32`                                          | Enable/disable loopback                                 |
| `sk_udp_set_broadcast`          | `(socket_id, enabled) -> i32`                                          | Enable/disable broadcast                                |
| `sk_udp_send`                   | `(socket_id, addr_ptr, addr_len, port, data_ptr, data_len) -> i32`     | Send datagram                                           |
| `sk_udp_recv`                   | `(socket_id, buf_ptr, buf_max_len, addr_out_ptr, port_out_ptr) -> i32` | Receive datagram (non-blocking)                         |
| `sk_udp_pending`                | `(socket_id) -> i32`                                                   | Get number of buffered datagrams                        |
| `sk_udp_close`                  | `(socket_id) -> void`                                                  | Close socket                                            |

**Rust Example:**

```rust
#[link(wasm_import_module = "env")]
extern "C" {
    fn sk_udp_create(socket_type: i32) -> i32;
    fn sk_udp_bind(socket_id: i32, port: u16) -> i32;
    fn sk_udp_join_multicast(
        socket_id: i32,
        addr_ptr: *const u8, addr_len: usize,
        iface_ptr: *const u8, iface_len: usize
    ) -> i32;
    fn sk_udp_recv(
        socket_id: i32,
        buf_ptr: *mut u8, buf_max_len: usize,
        addr_out_ptr: *mut u8, port_out_ptr: *mut u16
    ) -> i32;
    fn sk_udp_close(socket_id: i32);
}

// Example: Radar discovery
fn start_radar_locator() -> i32 {
    // Create UDP socket
    let socket_id = unsafe { sk_udp_create(0) }; // udp4
    if socket_id < 0 {
        return -1;
    }

    // Bind to radar discovery port
    if unsafe { sk_udp_bind(socket_id, 6878) } < 0 {
        return -1;
    }

    // Join radar multicast group
    let group = "239.254.2.0";
    let iface = "";
    if unsafe { sk_udp_join_multicast(socket_id, group.as_ptr(), group.len(), iface.as_ptr(), iface.len()) } < 0 {
        return -1;
    }

    socket_id
}
```

**Important Notes:**

- Receive is non-blocking - returns 0 if no data available
- Incoming datagrams are buffered (max 1000 per socket)
- Oldest datagrams are dropped if buffer is full
- All sockets are automatically closed when plugin stops
- Use `sk_udp_pending()` to check if data is available before calling `sk_udp_recv()`

## Raw Sockets API (TCP)

The `rawSockets` capability also enables TCP socket access for plugins that need persistent connections to devices:

- Marine radars with TCP control (Furuno, Garmin)
- Devices requiring handshake/login protocols
- Any marine electronics using TCP

TCP sockets support both **line-buffered mode** (for text protocols with `\r\n` terminators) and **raw mode** (for binary protocols).

**FFI Functions Available:**

| Function                    | Signature                                      | Description                                                  |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| `sk_tcp_create`             | `() -> i32`                                    | Create TCP socket. Returns socket_id or -1                   |
| `sk_tcp_connect`            | `(socket_id, addr_ptr, addr_len, port) -> i32` | Initiate connection (non-blocking). Returns 0 or -1          |
| `sk_tcp_connected`          | `(socket_id) -> i32`                           | Check connection status. Returns 1 if connected, 0 otherwise |
| `sk_tcp_set_line_buffering` | `(socket_id, enabled) -> i32`                  | Set buffering mode (1=line, 0=raw). Default: line            |
| `sk_tcp_send`               | `(socket_id, data_ptr, data_len) -> i32`       | Send data. Returns bytes sent or -1                          |
| `sk_tcp_recv_line`          | `(socket_id, buf_ptr, buf_max_len) -> i32`     | Receive complete line (line mode). Returns len or 0          |
| `sk_tcp_recv_raw`           | `(socket_id, buf_ptr, buf_max_len) -> i32`     | Receive raw data (raw mode). Returns len or 0                |
| `sk_tcp_pending`            | `(socket_id) -> i32`                           | Get buffered item count                                      |
| `sk_tcp_close`              | `(socket_id) -> void`                          | Close socket                                                 |

**Rust Example:**

```rust
#[link(wasm_import_module = "env")]
extern "C" {
    fn sk_tcp_create() -> i32;
    fn sk_tcp_connect(socket_id: i32, addr_ptr: *const u8, addr_len: usize, port: u16) -> i32;
    fn sk_tcp_connected(socket_id: i32) -> i32;
    fn sk_tcp_set_line_buffering(socket_id: i32, enabled: i32) -> i32;
    fn sk_tcp_send(socket_id: i32, data_ptr: *const u8, data_len: usize) -> i32;
    fn sk_tcp_recv_line(socket_id: i32, buf_ptr: *mut u8, buf_max_len: usize) -> i32;
    fn sk_tcp_recv_raw(socket_id: i32, buf_ptr: *mut u8, buf_max_len: usize) -> i32;
    fn sk_tcp_pending(socket_id: i32) -> i32;
    fn sk_tcp_close(socket_id: i32);
}

// Example: Furuno radar control connection
fn connect_furuno_radar(ip: &str, port: u16) -> i32 {
    // Create TCP socket
    let socket_id = unsafe { sk_tcp_create() };
    if socket_id < 0 {
        return -1;
    }

    // Initiate connection (non-blocking)
    if unsafe { sk_tcp_connect(socket_id, ip.as_ptr(), ip.len(), port) } < 0 {
        return -1;
    }

    socket_id
}

fn poll_connection(socket_id: i32) {
    // Check if connected
    if unsafe { sk_tcp_connected(socket_id) } != 1 {
        return; // Still connecting
    }

    // Send command with \r\n terminator
    let cmd = "$S69,2,0,0,60,300,0\r\n";
    unsafe { sk_tcp_send(socket_id, cmd.as_ptr(), cmd.len()) };

    // Receive response line
    let mut buf = [0u8; 256];
    let len = unsafe { sk_tcp_recv_line(socket_id, buf.as_mut_ptr(), buf.len()) };
    if len > 0 {
        // Process response
    }
}
```

**Important Notes:**

- Connection is non-blocking - poll `sk_tcp_connected()` until connected
- Line-buffered mode (default) splits incoming data on `\r\n` or `\n`
- Raw mode returns data as it arrives (for binary protocols)
- Use `sk_tcp_pending()` to check if data is available
- All sockets are automatically closed when plugin stops

## PUT Handlers API

WASM plugins can register PUT handlers to respond to PUT requests from clients, enabling vessel control and configuration management.

**Requirements:**

- Plugin must declare `"putHandlers": true` in manifest
- Import PUT handler functions from FFI
- Register handlers during `plugin_start()`
- Export handler functions with correct naming convention

**Manifest Configuration:**

```json
{
  "name": "my-plugin",
  "wasmManifest": "plugin.wasm",
  "wasmCapabilities": {
    "putHandlers": true
  }
}
```

**Handler Naming Convention:**

**Format:** `handle_put_{context}_{path}`

- Replace all dots (`.`) with underscores (`_`)
- Convert to lowercase (recommended)

**Examples:**

| Context        | Path                                    | Handler Function Name                                           |
| -------------- | --------------------------------------- | --------------------------------------------------------------- |
| `vessels.self` | `navigation.anchor.position`            | `handle_put_vessels_self_navigation_anchor_position`            |
| `vessels.self` | `steering.autopilot.target.headingTrue` | `handle_put_vessels_self_steering_autopilot_target_headingTrue` |

**Response Format:**

```json
{
  "state": "COMPLETED",
  "statusCode": 200,
  "message": "Operation successful"
}
```

- `state` - Request state: `COMPLETED` or `PENDING`
- `statusCode` - HTTP status code (200, 400, 403, 500, 501)
- `message` - Human-readable message (optional)

## Storage API

Plugins have access to isolated virtual filesystem:

```rust
use std::fs;

fn save_state() {
    // Plugin sees "/" as its VFS root
    fs::write("/data/state.json", state_json).unwrap();
}

fn load_state() -> String {
    fs::read_to_string("/data/state.json").unwrap_or_default()
}
```

**VFS Structure:**

```
/ (VFS root)
├── data/      # Persistent storage
├── config/    # Plugin-managed config
└── tmp/       # Temporary files
```

## Delta Emission

Emit delta messages to update Signal K data:

```rust
fn emit_position_delta() {
    let delta = r#"{
        "context": "vessels.self",
        "updates": [{
            "source": {
                "label": "example-wasm",
                "type": "plugin"
            },
            "timestamp": "2025-12-01T10:00:00.000Z",
            "values": [{
                "path": "navigation.position",
                "value": {
                    "latitude": 60.1,
                    "longitude": 24.9
                }
            }]
        }]
    }"#;

    handle_message(&delta);
}
```

## Server Events API

The `serverEvents` capability enables plugins to receive and emit server events and NMEA data streams. This is essential for plugins that need to:

- Process raw NMEA 0183 sentences
- Emit NMEA 2000 PGN data
- Monitor server status and provider events
- Integrate with the Signal K data pipeline

### Enabling Server Events Capability

```json
{
  "name": "my-nmea-plugin",
  "wasmManifest": "plugin.wasm",
  "wasmCapabilities": {
    "serverEvents": true,
    "dataWrite": true
  }
}
```

### Available Event Types

#### Server Events (uppercase)

These are server status events delivered via the `serverevent` mechanism:

| Event Type         | Description                     |
| ------------------ | ------------------------------- |
| `SERVERSTATISTICS` | Server performance statistics   |
| `VESSEL_INFO`      | Vessel name, MMSI, UUID         |
| `DEBUG_SETTINGS`   | Current debug configuration     |
| `SERVERMESSAGE`    | Server log messages             |
| `PROVIDERSTATUS`   | Data provider connection status |
| `SOURCEPRIORITIES` | Source priority configuration   |

#### Generic Events (lowercase)

NMEA data stream and parser events:

| Event Type                | Description                           |
| ------------------------- | ------------------------------------- |
| `nmea0183`                | Raw NMEA 0183 sentences from hardware |
| `nmea0183out`             | Derived NMEA 0183 from plugins        |
| `nmea2000JsonOut`         | NMEA 2000 PGN data in JSON format     |
| `nmea2000out`             | Raw NMEA 2000 data                    |
| `nmea2000OutAvailable`    | Signal that N2K output is ready       |
| `canboatjs:error`         | Parser error events                   |
| `canboatjs:warning`       | Parser warning events                 |
| `canboatjs:unparsed:data` | Unparsed data from canboatjs          |

### Implementing an Event Handler

Export an `event_handler()` function to receive events:

**Rust:**

```rust
#[link(wasm_import_module = "env")]
extern "C" {
    fn sk_debug(ptr: *const u8, len: usize);
    fn sk_subscribe_events(event_types_ptr: *const u8, event_types_len: usize) -> i32;
    fn sk_emit_event(
        type_ptr: *const u8, type_len: usize,
        data_ptr: *const u8, data_len: usize,
    ) -> i32;
}

// Subscribe to specific event types during plugin_start()
#[no_mangle]
pub extern "C" fn plugin_start(config_ptr: *const u8, config_len: usize) -> i32 {
    // Subscribe to NMEA 0183 events
    let events = r#"["nmea0183", "nmea0183out"]"#;
    unsafe {
        if sk_subscribe_events(events.as_ptr(), events.len()) != 1 {
            return 1; // Failed to subscribe
        }
    }
    0
}

// Receive events via the event_handler export
#[no_mangle]
pub extern "C" fn event_handler(event_ptr: *const u8, event_len: usize) {
    let event_json = unsafe {
        let slice = std::slice::from_raw_parts(event_ptr, event_len);
        String::from_utf8_lossy(slice).to_string()
    };

    // Event format: {"type": "nmea0183", "data": "$GPRMC,...", "timestamp": 1234567890}
    // Parse and process the event...
}
```

### Event JSON Format

Events delivered to `event_handler()` have this structure:

```json
{
  "type": "nmea0183",
  "data": "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A",
  "timestamp": 1706400000000
}
```

- `type` - The event type (e.g., `nmea0183`, `SERVERSTATISTICS`)
- `data` - Event payload (string for NMEA sentences, object for server events)
- `timestamp` - Unix timestamp in milliseconds
- `from` - (optional) Source plugin ID for plugin-emitted events

### Emitting Events

Use `sk_emit_event` to emit events:

**Rust:**

```rust
fn emit_pgn(pgn_data: &str) -> bool {
    let event_type = "nmea2000JsonOut";
    unsafe {
        sk_emit_event(
            event_type.as_ptr(), event_type.len(),
            pgn_data.as_ptr(), pgn_data.len(),
        ) == 1
    }
}

// Example: Emit a PGN 129025 (Position, Rapid Update)
let pgn = r#"{
    "pgn": 129025,
    "src": "wasm-plugin",
    "dst": 255,
    "prio": 2,
    "fields": {
        "Latitude": 60.1699,
        "Longitude": 24.9384
    }
}"#;
emit_pgn(pgn);
```

### Event Emission Behavior

- **Generic events** (`nmea0183`, `nmea2000JsonOut`, etc.) are emitted directly to the server event bus, allowing interop with other plugins and the Signal K data pipeline.
- **Custom events** (any other name) are automatically prefixed with `PLUGIN_` to prevent plugins from impersonating server events.

### Example: NMEA 0183 to NMEA 2000 Converter

See the `example-event-handler-rust` plugin for a complete example that:

1. Subscribes to `nmea0183` events
2. Parses RMC and GGA sentences
3. Emits `nmea2000JsonOut` events with PGN 129025 (Position) and PGN 129026 (COG/SOG)

```
[Hardware] --nmea0183--> [WASM Plugin] --nmea2000JsonOut--> [N2K Output]
```
