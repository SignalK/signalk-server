# Example Hello AssemblyScript - Signal K WASM Plugin

A minimal example of a Signal K WASM plugin written in AssemblyScript.

## Features

- ✅ Demonstrates AssemblyScript plugin structure
- ✅ Emits delta messages
- ✅ Creates notifications
- ✅ Uses configuration
- ✅ **HTTP Endpoints** (Phase 2) - Custom REST API
- ✅ Tiny binary size (~5-10 KB)

## Prerequisites

- Node.js >= 20
- AssemblyScript compiler

## Building

```bash
# Install dependencies
npm install

# Build release version
npm run build

# Build debug version
npm run asbuild:debug
```

This will create `plugin.wasm` in the current directory.

## Installing to Signal K

```bash
# Copy to Signal K plugins directory
mkdir -p ~/.signalk/node_modules/@signalk/example-hello-assemblyscript
cp plugin.wasm ~/.signalk/node_modules/@signalk/example-hello-assemblyscript/
cp package.json ~/.signalk/node_modules/@signalk/example-hello-assemblyscript/
```

## Enabling

1. Navigate to **Server** → **Plugin Config** in Signal K admin UI
2. Find "Hello AssemblyScript Plugin"
3. Click **Enable**
4. Configure the welcome message if desired
5. Click **Submit**

## What It Does

When started, the plugin:

1. Emits a welcome notification to `notifications.hello`
2. Emits plugin information to `plugins.hello-assemblyscript.info`
3. Registers HTTP endpoints for REST API access
4. Logs debug messages to server logs

### HTTP Endpoints

The plugin exposes two REST API endpoints:

**GET /plugins/hello-assemblyscript/api/info**

```bash
curl http://localhost:3000/plugins/hello-assemblyscript/api/info
```

Returns:

```json
{
  "pluginId": "hello-assemblyscript",
  "pluginName": "Hello AssemblyScript Plugin",
  "language": "AssemblyScript",
  "version": "0.1.0",
  "message": "Hello from WASM!",
  "capabilities": ["delta", "notifications", "http-endpoints"]
}
```

**GET /plugins/hello-assemblyscript/api/status**

```bash
curl http://localhost:3000/plugins/hello-assemblyscript/api/status
```

Returns:

```json
{
  "status": "running",
  "uptime": "N/A",
  "memory": "sandboxed"
}
```

## Important Notes

### WASM Memory Limitations

WASM plugins have a **~64KB buffer limitation** for stdin/memory operations in Node.js. For handling large data volumes (like log files), use a **hybrid approach**:

- **WASM Plugin**: Registers endpoints and handles configuration
- **Node.js Handler**: Server intercepts specific endpoints and handles I/O directly

See [signalk-logviewer](https://github.com/SignalK/signalk-server/tree/master/packages/signalk-logviewer) for a real-world example of this pattern.

## Configuration

The plugin accepts the following configuration:

- **message** (string): Welcome message to display (default: "Hello from AssemblyScript!")
- **updateInterval** (number): Update interval in milliseconds (default: 5000)

## Development

### Project Structure

```
example-hello-assemblyscript/
├── assembly/
│   └── index.ts          # Plugin implementation
├── package.json          # NPM package definition
├── asconfig.json         # AssemblyScript build config
└── README.md            # This file
```

### Building for Production

For the smallest possible binary:

```bash
npm run asbuild:release
```

Then optimize with `wasm-opt`:

```bash
npx wasm-opt -Oz plugin.wasm -o plugin.wasm
```

### Debugging

Build with debug symbols:

```bash
npm run asbuild:debug
```

Check server logs for debug messages:

```bash
DEBUG=signalk:wasm:* npm start
```

## Binary Size

- **Debug build**: ~15-20 KB
- **Release build**: ~5-10 KB
- **Optimized with wasm-opt**: ~3-5 KB

Compare to typical Rust WASM plugin: 50-200 KB

## License

Apache-2.0
