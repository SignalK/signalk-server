# Feature Request: Support for jco transpilation / V8 runtime

## Summary

Components built with componentize-dotnet cannot be executed in Node.js via jco transpilation. The component builds and transpiles successfully, but calling any exported function results in `RuntimeError: null function or function signature mismatch`.

## Environment

- **componentize-dotnet**: 0.7.0-preview00010
- **.NET SDK**: 10.0.100-preview.7
- **jco**: 1.10.0
- **Node.js**: 22.x
- **OS**: Windows 11 / Raspberry Pi OS (both tested)

## Reproduction Steps

### 1. Create a minimal .NET WASI component

```csharp
// PluginImpl.cs
using SignalkPluginWorld.wit.exports.signalk.plugin.v1_0_0;

namespace SignalkPluginWorld.wit.exports.signalk.plugin.v1_0_0;

public class PluginImpl : IPlugin
{
    public static string PluginId() => "test-plugin";
    public static string PluginName() => "Test Plugin";
    public static string PluginSchema() => "{}";
    public static int PluginStart(string config) => 0;
    public static int PluginStop() => 0;
}
```

### 2. Build the component

```bash
dotnet build
# Output: bin/Debug/net10.0/wasi-wasm/native/MyPlugin.wasm
```

### 3. Transpile with jco

```bash
npx @bytecodealliance/jco transpile MyPlugin.wasm -o jco-output --name mymodule --tla-compat
```

### 4. Try to use in Node.js

```javascript
import * as module from './jco-output/mymodule.js'

await module.$init
console.log('Init complete')

// This crashes:
const id = module.plugin.pluginId()
```

## Expected Behavior

After `$init` completes, calling `pluginId()` should return the string `"test-plugin"`.

## Actual Behavior

```
RuntimeError: null function or function signature mismatch
    at pluginId (wasm://wasm/00a1b2c3:wasm-function[1234]:0x12345)
    at pluginId (file:///path/to/jco-output/mymodule.js:6220:28)
```

## Technical Analysis

### What the WASM exports

Using `jco print` on the compiled component, we can see:

```wat
(export "_initialize" (func $_initialize))
(export "InitializeModules" (func $...))
(export "signalk:plugin/plugin@1.0.0#plugin-id" (func $...))
(export "signalk:plugin/plugin@1.0.0#plugin-name" (func $...))
...
(table (;0;) 3983 3983 funcref)
```

The component:

- Exports `_initialize` (WASI reactor initialization)
- Exports `InitializeModules` (.NET runtime initialization)
- Has a function table with 3983 entries
- Exports the expected WIT functions

### What jco generates

The generated JavaScript correctly:

1. Instantiates the WASM module
2. Sets `_initialized = true` after instantiation
3. Assigns function references: `plugin100PluginId = exports1['signalk:plugin/plugin@1.0.0#plugin-id']`

### Where it fails

When `pluginId()` is called, it invokes the WASM function which internally uses `call_indirect` to dispatch through the function table. In V8, the table entries are null, causing the crash.

### Why it works in Wasmtime

In Wasmtime, the `_initialize` function properly populates the indirect call table. In V8 (via jco transpilation), this initialization either:

1. Doesn't happen correctly
2. Happens but the table isn't shared properly between the shim and core modules

## Workarounds Attempted (None Successful)

1. **Manual `_initialize()` call** - Added explicit call in jco output; no effect
2. **Manual `InitializeModules()` call** - Crashes because `_initialize` already calls it
3. **Different jco flags** - `--instantiation sync`, `--tla-compat`, etc.
4. **Removing `[ThreadStatic]`** - Fixed build issues but not runtime

## Questions for the Team

1. Is jco/V8 support planned for componentize-dotnet?
2. Is this a known limitation of the NativeAOT-LLVM approach?
3. Are there any workarounds to make the indirect call table work in V8?
4. Would a different compilation approach (e.g., Mono interpreter) work better with jco?

## Use Case

We're building a plugin system for [Signal K](https://signalk.org/) marine data server. The server runs on Node.js and we want to support WASM plugins in multiple languages. Currently:

- **AssemblyScript**: Works perfectly
- **Rust**: Works perfectly
- **C#/.NET**: Builds but can't execute

Adding .NET support would greatly benefit the enterprise/marine industry developers who prefer C#.

## Related Links

- [componentize-dotnet README](https://github.com/bytecodealliance/componentize-dotnet) - States "works with Wasmtime and WAMR"
- [jco repository](https://github.com/bytecodealliance/jco)
- [Our Signal K WASM implementation](https://github.com/dirkwa/signalk-server/tree/WASM_WASIX)

## Complete Reproduction Repository

A complete working example demonstrating this issue is available at:
https://github.com/dirkwa/signalk-server/tree/WASM_WASIX/examples/wasm-plugins/anchor-watch-dotnet

---

**Labels suggestion**: `enhancement`, `runtime-support`, `jco`

# Issue Filed

https://github.com/bytecodealliance/componentize-dotnet/issues/103
