# Signal K AssemblyScript Plugin SDK

Build WASM plugins for Signal K Server using TypeScript-like syntax.

## Overview

The AssemblyScript SDK allows JavaScript and TypeScript developers to write WASM plugins without learning Rust. AssemblyScript provides:

- ✅ TypeScript-like syntax (strict subset)
- ✅ Compiles directly to WASM
- ✅ Small binaries (3-10 KB typical)
- ✅ Good performance (80-90% of Rust)
- ✅ Familiar tooling (npm, TypeScript)
- ✅ HTTP requests via `as-fetch` with Asyncify
- ✅ Resource provider capability for REST APIs

## Installation

```bash
npm install @signalk/assemblyscript-plugin-sdk
npm install --save-dev assemblyscript
```

## Quick Start

### 1. Create Plugin

Create `assembly/index.ts`:

```typescript
import {
  Plugin,
  Delta,
  Update,
  PathValue,
  Source,
  emit,
  setStatus,
  getCurrentTimestamp
} from '@signalk/assemblyscript-plugin-sdk'

export class MyPlugin extends Plugin {
  id(): string {
    return 'my-plugin'
  }

  name(): string {
    return 'My AssemblyScript Plugin'
  }

  schema(): string {
    return `{
      "type": "object",
      "properties": {
        "updateRate": {
          "type": "number",
          "default": 1000
        }
      }
    }`
  }

  start(config: string): i32 {
    setStatus('Started')

    // Emit a test delta
    const source = new Source(this.id(), 'plugin')
    const timestamp = getCurrentTimestamp()
    const pathValue = new PathValue('test.value', '"hello"')
    const update = new Update(source, timestamp, [pathValue])
    const delta = new Delta('vessels.self', [update])

    emit(delta)

    return 0 // Success
  }

  stop(): i32 {
    setStatus('Stopped')
    return 0
  }
}

// Export for Signal K server
const plugin = new MyPlugin()

export function plugin_id(): string {
  return plugin.id()
}
export function plugin_name(): string {
  return plugin.name()
}
export function plugin_schema(): string {
  return plugin.schema()
}

export function plugin_start(configPtr: usize, configLen: usize): i32 {
  const configBytes = new Uint8Array(configLen)
  for (let i = 0; i < configLen; i++) {
    configBytes[i] = load<u8>(configPtr + i)
  }
  const configJson = String.UTF8.decode(configBytes.buffer)
  return plugin.start(configJson)
}

export function plugin_stop(): i32 {
  return plugin.stop()
}
```

### 2. Configure Build

Create `asconfig.json`:

```json
{
  "targets": {
    "release": {
      "outFile": "plugin.wasm",
      "optimize": true,
      "shrinkLevel": 2
    }
  }
}
```

### 3. Build

```bash
npx asc assembly/index.ts --target release
```

### 4. Install to Signal K

Create `package.json`:

```json
{
  "name": "@signalk/my-plugin",
  "version": "0.1.0",
  "keywords": ["signalk-node-server-plugin", "signalk-wasm-plugin"],
  "wasmManifest": "plugin.wasm",
  "wasmCapabilities": {
    "dataRead": true,
    "dataWrite": true,
    "storage": "vfs-only"
  }
}
```

Copy to Signal K:

```bash
mkdir -p ~/.signalk/node_modules/@signalk/my-plugin
cp plugin.wasm package.json ~/.signalk/node_modules/@signalk/my-plugin/
```

## API Reference

### Base Classes

#### `Plugin`

Abstract base class for all plugins.

**Methods to implement:**

- `id(): string` - Unique plugin identifier
- `name(): string` - Human-readable name
- `schema(): string` - JSON schema for configuration
- `start(config: string): i32` - Initialize plugin
- `stop(): i32` - Clean shutdown

### Signal K Types

#### `Delta`

Represents a Signal K delta message.

```typescript
const delta = new Delta('vessels.self', [update])
```

#### `Update`

Represents an update within a delta.

```typescript
const update = new Update(source, timestamp, [pathValue])
```

#### `PathValue`

Represents a path-value pair.

```typescript
const pathValue = new PathValue('navigation.position', positionJson)
```

#### `Source`

Represents the source of data.

```typescript
const source = new Source('my-plugin', 'plugin')
```

#### `Position`

GPS position with latitude/longitude.

```typescript
const pos = new Position(60.1, 24.9)
const posJson = pos.toJSON()
```

#### `Notification`

Signal K notification.

```typescript
const notif = new Notification(NotificationState.normal, 'Hello!')
const notifJson = notif.toJSON()
```

### API Functions

#### `emit(delta: Delta): void`

Emit a delta message to Signal K server.

```typescript
emit(delta)
```

**Requires capability:** `dataWrite: true`

#### `setStatus(message: string): void`

Set plugin status (shown in admin UI).

```typescript
setStatus('Running normally')
```

#### `setError(message: string): void`

Report an error (shown in admin UI).

```typescript
setError('Sensor connection failed')
```

#### `debug(message: string): void`

Log debug message to server logs.

```typescript
debug('Processing data: ' + value.toString())
```

#### `getSelfPath(path: string): string | null`

Read data from vessel.self.

```typescript
const speedJson = getSelfPath('navigation.speedOverGround')
if (speedJson !== null) {
  const speed = parseFloat(speedJson)
}
```

**Requires capability:** `dataRead: true`

#### `getPath(path: string): string | null`

Read data from any context.

```typescript
const posJson = getPath('vessels.self.navigation.position')
```

**Requires capability:** `dataRead: true`

#### `readConfig(): string`

Read plugin configuration.

```typescript
const configJson = readConfig()
```

#### `saveConfig(configJson: string): i32`

Save plugin configuration.

```typescript
const result = saveConfig(JSON.stringify(config))
if (result !== 0) {
  setError('Failed to save config')
}
```

## Best Practices

### 1. Minimize Binary Size

Use optimization flags in `asconfig.json`:

```json
{
  "targets": {
    "release": {
      "optimize": true,
      "shrinkLevel": 2,
      "converge": true,
      "noAssert": true
    }
  }
}
```

Further optimize with `wasm-opt`:

```bash
npx wasm-opt -Oz plugin.wasm -o plugin.wasm
```

### 2. Handle Errors Gracefully

```typescript
start(config: string): i32 {
  try {
    // Initialize plugin
    setStatus('Started')
    return 0
  } catch (e) {
    setError('Failed to start: ' + e.toString())
    return 1
  }
}
```

### 3. Use Helper Functions

```typescript
import {
  createSimpleDelta,
  getCurrentTimestamp
} from '@signalk/assemblyscript-plugin-sdk'

// Quick delta creation
const delta = createSimpleDelta('my-plugin', 'test.value', '"hello"')
emit(delta)
```

### 4. Efficient JSON Handling

Values must be JSON-encoded strings:

```typescript
// Numbers
const pathValue = new PathValue('temperature', '25.5')

// Strings (note the quotes)
const pathValue = new PathValue('name', '"My Boat"')

// Objects
const pathValue = new PathValue(
  'position',
  '{"latitude":60.1,"longitude":24.9}'
)

// Use helper classes
const pos = new Position(60.1, 24.9)
const pathValue = new PathValue('position', pos.toJSON())
```

## Resource Providers

WASM plugins can register as **resource providers** to serve data via the Signal K REST API.

### Setup

1. Add capability to `package.json`:

```json
{
  "wasmCapabilities": {
    "resourceProvider": true
  }
}
```

2. Register in your plugin's `start()`:

```typescript
import {
  registerResourceProvider,
  ResourceGetRequest
} from 'signalk-assemblyscript-plugin-sdk/assembly/resources'

start(config: string): i32 {
  if (registerResourceProvider('weather')) {
    debug('Registered as weather resource provider')
  }
  return 0
}
```

3. Export handler functions:

```typescript
// List all resources - GET /signalk/v2/api/resources/weather
export function resources_list_resources(queryJson: string): string {
  return '{"current":' + cachedData.toJSON() + '}'
}

// Get specific resource - GET /signalk/v2/api/resources/weather/{id}
export function resources_get_resource(requestJson: string): string {
  const req = ResourceGetRequest.parse(requestJson)
  if (req.id === 'current') {
    return cachedData.toJSON()
  }
  return '{"error":"Not found"}'
}
```

### API Access

Once registered, your resources are available at:

```bash
curl http://localhost:3000/signalk/v2/api/resources/weather
curl http://localhost:3000/signalk/v2/api/resources/weather/current
```

See the weather-plugin example for a complete implementation.

## Examples

See examples/wasm-plugins/ in the signalk-server repository:

- `hello-assemblyscript` - Basic plugin example
- `weather-plugin` - Network requests + resource provider

## Comparison: Rust vs AssemblyScript

| Feature        | Rust            | AssemblyScript       |
| -------------- | --------------- | -------------------- |
| Learning curve | Steep           | Low (if you know TS) |
| Binary size    | 50-200 KB       | 3-10 KB              |
| Performance    | 100% (baseline) | 80-90%               |
| Compile time   | 5-30 seconds    | 1-2 seconds          |
| Tooling        | cargo           | npm                  |
| Best for       | Complex plugins | Simple plugins       |

## Limitations

AssemblyScript is a **strict subset** of TypeScript. Notable differences:

- No `any` type
- No union types (use tagged enums)
- No dynamic arrays (use fixed-size or manual memory)
- No standard library (console, setTimeout, etc.)
- Manual memory management

See [AssemblyScript documentation](https://www.assemblyscript.org/) for details.

## Troubleshooting

### Plugin doesn't load

Check that:

- `wasmManifest` points to correct file
- `signalk-wasm-plugin` keyword is present
- WASM binary is valid: `file plugin.wasm`

### Compilation errors

Common issues:

- Using disallowed TypeScript features
- Missing type annotations
- Incorrect memory operations

### Runtime errors

Check server logs:

```bash
DEBUG=signalk:wasm:* npm start
```

## Resources

- [AssemblyScript Documentation](https://www.assemblyscript.org/)
- [Signal K WASM Plugin Guide](../../docs/develop/plugins/wasm/)
- [Example Plugins](../../examples/wasm-plugins/)

## Support

- GitHub Issues: https://github.com/SignalK/signalk-server/issues
- Slack: #developers channel
- Forum: https://github.com/SignalK/signalk-server/discussions

## License

Apache-2.0
