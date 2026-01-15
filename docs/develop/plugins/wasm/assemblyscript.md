---
title: AssemblyScript Plugins
---

# Creating AssemblyScript Plugins

AssemblyScript is the recommended language for developers familiar with TypeScript. It produces the smallest binaries (3-10 KB) and has the fastest development cycle.

## Step 1: Install SDK

```bash
npm install @signalk/assemblyscript-plugin-sdk
npm install --save-dev assemblyscript
```

## Step 2: Create Plugin File

Create `assembly/index.ts`:

```typescript
import {
  Plugin,
  Delta,
  Update,
  PathValue,
  emit,
  setStatus
} from '@signalk/assemblyscript-plugin-sdk/assembly'

class MyPlugin extends Plugin {
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
    const pathValue = new PathValue('test.value', '"hello"')
    const update = new Update([pathValue])
    const delta = new Delta('vessels.self', [update])
    emit(delta)

    return 0 // Success
  }

  stop(): i32 {
    setStatus('Stopped')
    return 0
  }
}

// Export for Signal K
const plugin = new MyPlugin()
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

**Note on Plugin IDs:** The plugin ID is automatically derived from your `package.json` name. For example:

- `@signalk/example-weather-plugin` → `_signalk_example-weather-plugin`
- `my-simple-plugin` → `my-simple-plugin`

This ensures unique plugin IDs (npm guarantees package name uniqueness) and eliminates discrepancies between package name and plugin ID.

## Step 3: Configure Build

Create `asconfig.json`:

```json
{
  "targets": {
    "release": {
      "outFile": "plugin.wasm",
      "optimize": true,
      "shrinkLevel": 2,
      "converge": true,
      "noAssert": true,
      "runtime": "incremental",
      "exportRuntime": true
    },
    "debug": {
      "outFile": "build/plugin.debug.wasm",
      "sourceMap": true,
      "debug": true,
      "runtime": "incremental",
      "exportRuntime": true
    }
  },
  "options": {
    "bindings": "esm"
  }
}
```

**Important**: `exportRuntime: true` is **required** for the AssemblyScript loader to work. This exports runtime helper functions like `__newString` and `__getString` that the server uses for automatic string conversions.

## Step 4: Build

```bash
npx asc assembly/index.ts --target release
```

## Step 5: Create package.json

```json
{
  "name": "my-wasm-plugin",
  "version": "0.1.0",
  "keywords": ["signalk-wasm-plugin"],
  "wasmManifest": "plugin.wasm",
  "wasmCapabilities": {
    "dataRead": true,
    "dataWrite": true,
    "storage": "vfs-only"
  }
}
```

> **Important: What makes a WASM plugin?**
>
> The **`wasmManifest`** field is the key identifier that tells Signal K this is a WASM plugin (not a Node.js plugin). It must point to your compiled `.wasm` file.
>
> The package **name can be anything** - scoped (`@myorg/my-plugin`) or unscoped (`my-wasm-plugin`). Choose a name that makes sense for your plugin and avoids conflicts on npm.

## Step 6: Test Install

**Option 1: Symlink (Recommended for Development)**

Symlinking your plugin directory allows you to make changes and rebuild without copying files:

```bash
# From your Signal K node_modules directory
cd ~/.signalk/node_modules
ln -s /path/to/your/my-wasm-plugin my-wasm-plugin

# Now any changes you make and rebuild will be picked up on server restart
```

**Option 2: Direct Copy**

```bash
mkdir -p ~/.signalk/node_modules/my-wasm-plugin
cp plugin.wasm package.json ~/.signalk/node_modules/my-wasm-plugin/

# If your plugin has a public/ folder with web UI:
cp -r public ~/.signalk/node_modules/my-wasm-plugin/
```

**Option 3: NPM Package Install**

```bash
# If you've packaged with `npm pack`
npm install -g ./my-wasm-plugin-1.0.0.tgz

# Or install from npm registry (if published)
npm install -g my-wasm-plugin
```

**Note**: Symlinking is the most efficient method for development - changes are picked up on server restart without copying files. Use npm install for production deployments or when distributing plugins.

**Important**: If your plugin includes static files (like a web UI in the `public/` folder), make sure to copy that folder as well. Static files are automatically served at `/plugins/your-plugin-id/` when the plugin is loaded.

## Step 7: Verify Plugin Configuration in Admin UI

After installing your plugin, verify it appears in the Admin UI:

1. **Navigate to Plugin Configuration**: Open the Admin UI at `http://your-server:3000/@signalk/server-admin-ui/` and go to **Server → Plugin Config**

2. **Check Plugin List**: Your WASM plugin should appear in the list with:
   - Plugin name (from `name()` export)
   - Version (from `package.json`)
   - Enable/Disable toggle
   - Configuration form (based on `schema()` export)

3. **Verify Configuration Persistence**:
   - Configuration is saved to `~/.signalk/plugin-config-data/your-plugin-id.json`
   - Changes are applied immediately (plugin restarts automatically)
   - The file structure is:
     ```json
     {
       "enabled": true,
       "enableDebug": false,
       "configuration": {
         "updateRate": 1000
       }
     }
     ```

4. **Troubleshooting**:
   - If plugin doesn't appear: Check `package.json` has the `signalk-wasm-plugin` keyword and `wasmManifest` field
   - If configuration form is empty: Verify `schema()` export returns valid JSON Schema
   - If settings don't persist: Check file permissions on `~/.signalk/plugin-config-data/`

**Important**: The Admin UI shows all plugins (both Node.js and WASM) in a unified list. WASM plugins integrate seamlessly with the existing plugin configuration system.

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

Represents an update within a delta. The server automatically adds `$source` and `timestamp`.

```typescript
const update = new Update([pathValue])
```

#### `PathValue`

Represents a path-value pair.

```typescript
const pathValue = new PathValue('navigation.position', positionJson)
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

### Helper Functions

```typescript
import {
  createSimpleDelta,
  getCurrentTimestamp
} from '@signalk/assemblyscript-plugin-sdk'

// Quick delta creation
const delta = createSimpleDelta('my-plugin', 'test.value', '"hello"')
emit(delta)
```

### JSON Parsing

The SDK includes [assemblyscript-json](https://github.com/near/assemblyscript-json) for parsing JSON data. This is useful when working with configuration, API responses, or resource provider requests.

```typescript
import { JSON } from '@signalk/assemblyscript-plugin-sdk/assembly'

// Parse a JSON string
const jsonStr = '{"name": "My Boat", "speed": 5.2}'
const parsed = JSON.parse(jsonStr)

if (parsed.isObj) {
  const obj = parsed as JSON.Obj

  // Get string values
  const nameValue = obj.getString('name')
  if (nameValue !== null) {
    const name = nameValue.valueOf() // "My Boat"
  }

  // Get number values
  const speedValue = obj.getNum('speed')
  if (speedValue !== null) {
    const speed = speedValue.valueOf() // 5.2 (as f64)
  }
}
```

**Available methods on `JSON.Obj`:**

- `getString(key)` - Returns `JSON.Str | null`
- `getNum(key)` - Returns `JSON.Num | null`
- `getBool(key)` - Returns `JSON.Bool | null`
- `getObj(key)` - Returns `JSON.Obj | null`
- `getArr(key)` - Returns `JSON.Arr | null`
- `getValue(key)` - Returns `JSON.Value | null`

**Note:** Plugins using resource providers or parsing complex JSON should add `assemblyscript-json` to their dependencies:

```bash
npm install assemblyscript-json
```

### JSON Value Encoding

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
} from '@signalk/assemblyscript-plugin-sdk/assembly/resources'

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

## Network Requests with Asyncify

AssemblyScript plugins can make HTTP requests using the `as-fetch` library with Asyncify support.

### Setup

1. Add dependencies:

```bash
npm install as-fetch @signalk/assemblyscript-plugin-sdk
```

2. Enable the Asyncify transform in `asconfig.json`:

```json
{
  "options": {
    "bindings": "esm",
    "exportRuntime": true,
    "transform": ["as-fetch/transform"]
  }
}
```

3. Declare network capability in `package.json`:

```json
{
  "wasmCapabilities": {
    "network": true
  }
}
```

### Making Requests

```typescript
import { fetchSync } from 'as-fetch/sync'

const response = fetchSync('https://api.example.com/data')

if (response && response.status === 200) {
  const data = response.text()
  // Process data...
}
```

### How Asyncify Works

Asyncify enables synchronous-style async code in WASM:

1. WASM execution pauses when `fetchSync()` is called
2. HTTP request happens in JavaScript
3. When response arrives, WASM execution resumes
4. Your code continues with the response

The Signal K runtime handles all state transitions automatically.

### Troubleshooting Network Requests

**fetchSync hangs or doesn't work:**

- Ensure `"transform": ["as-fetch/transform"]` is in `asconfig.json`
- Use correct import: `import { fetchSync } from 'as-fetch/sync'`
- Verify `"network": true` in `wasmCapabilities`

**Request fails:**

- Check Node.js version >= 18 (required for native fetch)
- Verify the URL is accessible
- Check API keys/authentication

See the [example-weather-plugin](https://github.com/SignalK/signalk-server/tree/master/examples/wasm-plugins/example-weather-plugin) for a complete implementation.

## AssemblyScript Limitations

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

## Additional Resources

- [AssemblyScript Documentation](https://www.assemblyscript.org/)
- [Example Plugins](https://github.com/SignalK/signalk-server/tree/master/examples/wasm-plugins)
