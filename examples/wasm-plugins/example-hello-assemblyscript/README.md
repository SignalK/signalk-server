# Example Hello AssemblyScript - Signal K WASM Plugin

A minimal example of a Signal K WASM plugin written in AssemblyScript.

## Features

- Demonstrates AssemblyScript plugin structure
- Emits delta messages on startup and periodically via `poll()`
- Creates notifications
- Configurable update interval for periodic heartbeats
- HTTP Endpoints - Custom REST API
- Tiny binary size (~18 KB)

## Prerequisites

- Node.js >= 20

## Building

```bash
# Install dependencies
npm install

# Build release version
npm run build
```

This creates `plugin.wasm` in the current directory.

For debug builds with additional symbols:

```bash
npm run asbuild:debug
```

## Installing to Signal K

**Note:** The AssemblyScript Plugin SDK is not yet published to npm. You must install it first.

### Step 1: Install the SDK

```bash
cd /path/to/signalk-server/packages/assemblyscript-plugin-sdk
npm pack

cd ~/.signalk
npm install /path/to/signalk-assemblyscript-plugin-sdk-0.2.0.tgz
```

### Step 2: Install the plugin

Option 1: Using npm pack (recommended)

```bash
cd /path/to/example-hello-assemblyscript
npm pack

cd ~/.signalk
npm install /path/to/signalk-example-hello-assemblyscript-0.1.0.tgz
```

Option 2: Manual copy

```bash
mkdir -p ~/.signalk/node_modules/@signalk/example-hello-assemblyscript
cp plugin.wasm package.json ~/.signalk/node_modules/@signalk/example-hello-assemblyscript/
```

## Enabling

1. Navigate to **Server** → **Plugin Config** in Signal K admin UI
2. Find "Hello AssemblyScript Plugin"
3. Enable the plugin
4. Optionally enable "Debug logging" to see detailed output
5. Configure the welcome message and update interval if desired
6. Click **Submit**

## What It Does

When started, the plugin:

1. Emits a welcome notification to `notifications.hello`
2. Emits plugin information to `plugins.hello-assemblyscript.info`
3. Emits periodic heartbeat deltas to `plugins.hello-assemblyscript.heartbeat` (configurable interval)
4. Registers HTTP endpoints for REST API access

### Periodic Heartbeat

The plugin demonstrates the `poll()` export which is called by the server every ~1 second. The plugin tracks elapsed time and emits a heartbeat delta when the configured `updateInterval` (default: 5000ms) has elapsed.

Example heartbeat delta:

```json
{
  "context": "vessels.self",
  "updates": [
    {
      "source": { "label": "hello-assemblyscript", "type": "plugin" },
      "values": [
        {
          "path": "plugins.hello-assemblyscript.heartbeat",
          "value": {
            "count": 1,
            "message": "Hello from AssemblyScript!",
            "intervalMs": 5000
          }
        }
      ]
    }
  ]
}
```

### HTTP Endpoints

The plugin exposes two REST API endpoints:

**GET /plugins/\_signalk_example-hello-assemblyscript/api/info**

```bash
curl http://localhost:3000/plugins/_signalk_example-hello-assemblyscript/api/info
```

Returns:

```json
{
  "pluginName": "Hello AssemblyScript Plugin",
  "language": "AssemblyScript",
  "version": "0.1.0",
  "message": "Hello from WASM!",
  "capabilities": ["delta", "notifications", "http-endpoints"]
}
```

**GET /plugins/\_signalk_example-hello-assemblyscript/api/status**

```bash
curl http://localhost:3000/plugins/_signalk_example-hello-assemblyscript/api/status
```

Returns:

```json
{
  "status": "running",
  "uptime": "N/A",
  "memory": "sandboxed"
}
```

## Configuration

| Option           | Type   | Default                      | Description                                       |
| ---------------- | ------ | ---------------------------- | ------------------------------------------------- |
| `message`        | string | "Hello from AssemblyScript!" | Welcome message shown in notifications            |
| `updateInterval` | number | 5000                         | Interval in milliseconds between heartbeat deltas |

Configure via the Signal K Admin UI under **Server → Plugin Config**.

## Development

### Project Structure

```
example-hello-assemblyscript/
├── assembly/
│   └── index.ts          # Plugin implementation
├── package.json          # NPM package definition
├── asconfig.json         # AssemblyScript build config
├── plugin.wasm           # Compiled WASM binary (after build)
└── README.md             # This file
```

### Key Exports

The plugin exports these functions for the Signal K server:

| Export                 | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `plugin_name()`        | Returns the human-readable plugin name          |
| `plugin_schema()`      | Returns JSON schema for configuration UI        |
| `plugin_start(config)` | Called when plugin is enabled                   |
| `plugin_stop()`        | Called when plugin is disabled                  |
| `poll()`               | Called every ~1 second for periodic tasks       |
| `http_endpoints()`     | Returns JSON array of HTTP endpoint definitions |

### Debugging

Enable debug logging in the plugin configuration, then check server logs:

```bash
DEBUG=signalk:wasm:* npm start
```

You'll see messages like:

```
signalk:wasm:bindings [@signalk/example-hello-assemblyscript] Heartbeat #1
signalk:wasm:bindings [@signalk/example-hello-assemblyscript] Emitting delta (v1): ...
```

## License

Apache-2.0
