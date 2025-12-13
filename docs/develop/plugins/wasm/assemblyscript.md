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
  Source,
  emit,
  setStatus,
  getCurrentTimestamp
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
    const source = new Source('my-plugin', 'plugin')
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
  "keywords": ["signalk-node-server-plugin", "signalk-wasm-plugin"],
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
   - If plugin doesn't appear: Check `package.json` has both `signalk-node-server-plugin` and `signalk-wasm-plugin` keywords
   - If configuration form is empty: Verify `schema()` export returns valid JSON Schema
   - If settings don't persist: Check file permissions on `~/.signalk/plugin-config-data/`

**Important**: The Admin UI shows all plugins (both Node.js and WASM) in a unified list. WASM plugins integrate seamlessly with the existing plugin configuration system.

## Additional Resources

- See the [AssemblyScript SDK](../../../../packages/assemblyscript-plugin-sdk/README.md) for full API reference
- See the [example-hello-assemblyscript](../../../../examples/wasm-plugins/example-hello-assemblyscript/README.md) example for complete working code
