# Example Anchor Watch - C# WASM Plugin

> **🚧 NOT WORKING - Waiting for Better Tooling**
>
> This example demonstrates the **intended approach** for building .NET WASM plugins using
> componentize-dotnet and the WASI Component Model. However, **it does not currently work**
> due to fundamental runtime incompatibilities.
>
> **Status:** ❌ **Non-functional** - documented for future reference
>
> **For working examples, see:**
>
> - `../example-hello-assemblyscript/` - AssemblyScript (recommended, fully working)
> - `../example-anchor-watch-rust/` - Rust (fully working)

---

## Why This Doesn't Work (Yet)

### The Problem

The .NET WASM toolchain (`componentize-dotnet`) produces WASI Component Model output that
**cannot run in Node.js/V8**. This is a fundamental incompatibility, not a configuration issue.

### Technical Details

1. **componentize-dotnet only supports Wasmtime and WAMR** ([source](https://github.com/bytecodealliance/componentize-dotnet))
   - The README explicitly states: "works with Wasmtime and WAMR"
   - Node.js/V8 is NOT a supported runtime
   - jco transpilation does NOT bridge this gap

2. **Function table initialization fails in V8**
   - .NET NativeAOT uses indirect call tables that initialize correctly in Wasmtime
   - In V8 (via jco transpilation), these tables contain null entries
   - Error: `RuntimeError: null function or function signature mismatch`

3. **Attempted workarounds that did NOT work:**
   - Calling `_initialize()` manually - fails silently
   - Calling `InitializeModules()` - crashes (already called by `_initialize`)
   - Removing `[ThreadStatic]` attribute - fixed build but not runtime
   - Various jco flags (`--tla-compat`, `--instantiation sync`)

### What Would Be Needed

1. **Native Wasmtime in Node.js** - A proper `@bytecodealliance/wasmtime` npm package
   that embeds Wasmtime directly (does not exist as of Dec 2024)

2. **Improved jco support** - jco would need to properly handle .NET NativeAOT's
   function table initialization

3. **Alternative .NET toolchain** - A different compilation path that produces
   V8-compatible WASM

### Recommendation

**Wait for better tooling.** Both componentize-dotnet and jco are experimental projects
under active development. The WASI Component Model ecosystem is rapidly evolving.

For now, use **AssemblyScript** for Signal K WASM plugins - it works reliably and
produces much smaller binaries (3-10 KB vs 20+ MB).

For technical details, see the upstream issue: https://github.com/bytecodealliance/componentize-dotnet/issues/103

---

## Reference Documentation

The information below documents how this plugin **would** work once the tooling matures.
It is preserved for future reference.

---

**A comprehensive example demonstrating PUT handlers and C#/.NET WASM development for Signal K**

This plugin showcases how to build Signal K WASM plugins using C# and .NET, with a focus on implementing PUT handlers for vessel control and monitoring.

## Features

✅ **PUT Handler Implementation** - Handle PUT requests to control plugin state
✅ **C# / .NET 10** - Modern C# development with WASI support
✅ **Anchor Watch Logic** - Monitor vessel position and detect anchor drag
✅ **State Management** - Persist anchor position and alarm settings
✅ **Delta Emission** - Update Signal K data model with anchor status
✅ **Type-Safe API** - Strongly-typed C# API for Signal K integration

## What is Anchor Watch?

Anchor watch monitors your vessel's position after dropping anchor. If the vessel drifts beyond a specified radius (indicating the anchor is dragging), an alarm is triggered.

### PUT Handlers

This plugin registers three PUT handlers that allow external clients to control the anchor watch:

1. **`navigation.anchor.position`** - Set the anchor drop position
2. **`navigation.anchor.maxRadius`** - Set the drag alarm radius (meters)
3. **`navigation.anchor.alarmState`** - Enable/disable the drag alarm

## Prerequisites

### Required

- **.NET 10 SDK**
  Download from: https://dotnet.microsoft.com/download/dotnet/10.0

- **WASI SDK 25.0** (required for native WASM compilation)
  Download from: https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-25

  **Windows:**

  ```powershell
  # Download and extract wasi-sdk-25
  Invoke-WebRequest -Uri "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-25/wasi-sdk-25.0-x86_64-windows.tar.gz" -OutFile wasi-sdk-25.tar.gz
  tar -xzf wasi-sdk-25.tar.gz

  # Set environment variable (required before building)
  $env:WASI_SDK_PATH = "C:\path\to\wasi-sdk-25.0-x86_64-windows"
  ```

  **Linux:**

  ```bash
  # Download and extract wasi-sdk-25
  wget https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-25/wasi-sdk-25.0-x86_64-linux.tar.gz
  tar -xzf wasi-sdk-25.0-x86_64-linux.tar.gz

  # Set environment variable (add to ~/.bashrc for persistence)
  export WASI_SDK_PATH=/path/to/wasi-sdk-25.0-x86_64-linux
  ```

  **macOS:**

  ```bash
  # Download and extract wasi-sdk-25
  wget https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-25/wasi-sdk-25.0-arm64-macos.tar.gz
  tar -xzf wasi-sdk-25.0-arm64-macos.tar.gz

  # Set environment variable (add to ~/.zshrc for persistence)
  export WASI_SDK_PATH=/path/to/wasi-sdk-25.0-arm64-macos
  ```

  > **Note:** .NET 10 specifically requires wasi-sdk version 25.0. Other versions will not work.

- **Signal K Server 3.0+** with WASM support

### Verify Installation

```bash
dotnet --version  # Should be 10.0.x or later
echo $WASI_SDK_PATH  # Should point to wasi-sdk-25 folder
```

## Quick Start

### 1. Build the Plugin

```bash
cd examples/wasm-plugins/example-anchor-watch-dotnet
dotnet publish -c Release
```

This compiles the C# code to a native WASM binary.

### 2. Copy WASM Binary

After building, copy the generated WASM file:

```bash
# The build output is in bin/Release/net10.0/wasi-wasm/
cp bin/Release/net10.0/wasi-wasm/AnchorWatch.wasm plugin.wasm
```

**Windows (PowerShell):**

```powershell
copy bin\Release\net10.0\wasi-wasm\AnchorWatch.wasm plugin.wasm
```

### 3. Install to Signal K

**Option A: Direct Copy (Development)**

```bash
mkdir -p ~/.signalk/node_modules/@signalk/example-anchor-watch-dotnet
cp plugin.wasm package.json ~/.signalk/node_modules/@signalk/example-anchor-watch-dotnet/
```

**Option B: NPM Package (Production)**

```bash
npm pack
npm install -g signalk-example-anchor-watch-dotnet-0.1.0.tgz
```

### 4. Enable in Admin UI

1. Navigate to **Server → Plugin Config**
2. Find "Anchor Watch (.NET)"
3. Click **Enable**
4. Configure settings (max radius, alarm state)
5. Click **Submit**

### 5. Test PUT Handlers

Test the PUT handlers using curl or the Signal K REST API:

#### Set Anchor Position

```bash
curl -X PUT http://localhost:3000/signalk/v1/api/vessels/self/navigation/anchor/position \
  -H "Content-Type: application/json" \
  -d '{"value": {"latitude": 60.1234, "longitude": 24.5678}}'
```

#### Set Drag Alarm Radius

```bash
curl -X PUT http://localhost:3000/signalk/v1/api/vessels/self/navigation/anchor/maxRadius \
  -H "Content-Type: application/json" \
  -d '{"value": 75}'
```

#### Enable Alarm

```bash
curl -X PUT http://localhost:3000/signalk/v1/api/vessels/self/navigation/anchor/alarmState \
  -H "Content-Type: application/json" \
  -d '{"value": true}'
```

## Project Structure

```
example-anchor-watch-dotnet/
├── Program.cs           # Main plugin implementation
├── AnchorWatch.csproj   # .NET project file
├── package.json         # Signal K plugin manifest
├── plugin.wasm          # Compiled WASM binary (generated)
└── README.md            # This file
```

## Understanding the Code

### Plugin Lifecycle

The plugin implements the standard Signal K WASM plugin interface:

```csharp
[UnmanagedCallersOnly(EntryPoint = "plugin_id")]
public static IntPtr GetId() { ... }

[UnmanagedCallersOnly(EntryPoint = "plugin_name")]
public static IntPtr GetName() { ... }

[UnmanagedCallersOnly(EntryPoint = "plugin_schema")]
public static IntPtr GetSchema() { ... }

[UnmanagedCallersOnly(EntryPoint = "plugin_start")]
public static int Start(IntPtr configPtr, int configLen) { ... }

[UnmanagedCallersOnly(EntryPoint = "plugin_stop")]
public static int Stop() { ... }
```

### FFI Bridge

The plugin communicates with the Signal K server through FFI (Foreign Function Interface):

```csharp
[DllImport("env", EntryPoint = "sk_debug")]
public static extern void Debug(IntPtr messagePtr, int messageLen);

[DllImport("env", EntryPoint = "sk_register_put_handler")]
public static extern int RegisterPutHandler(IntPtr contextPtr, int contextLen, IntPtr pathPtr, int pathLen);
```

### PUT Handler Registration

During `plugin_start()`, the plugin registers its PUT handlers:

```csharp
SignalKApi.RegisterPut("vessels.self", "navigation.anchor.position");
SignalKApi.RegisterPut("vessels.self", "navigation.anchor.maxRadius");
SignalKApi.RegisterPut("vessels.self", "navigation.anchor.alarmState");
```

### PUT Handler Implementation

Each PUT handler is exported with a specific naming convention:

```csharp
[UnmanagedCallersOnly(EntryPoint = "handle_put_vessels_self_navigation_anchor_position")]
public static IntPtr HandleSetAnchorPosition(IntPtr requestPtr, int requestLen)
{
    // 1. Parse request JSON
    var request = JsonSerializer.Deserialize<PutRequest>(requestJson);

    // 2. Validate and process
    var position = JsonSerializer.Deserialize<Position>(request.Value.GetRawText());
    anchorState.Position = position;

    // 3. Emit delta to update data model
    SignalKApi.EmitDelta(deltaJson);

    // 4. Return response
    return MarshalJson(new PutResponse {
        State = "COMPLETED",
        StatusCode = 200,
        Message = "Success"
    });
}
```

**Handler Naming Convention:**

- Format: `handle_put_{context}_{path}` with dots replaced by underscores
- Example: `handle_put_vessels_self_navigation_anchor_position`

### Data Models

The plugin uses strongly-typed C# classes with JSON serialization:

```csharp
public class Position
{
    [JsonPropertyName("latitude")]
    public double Latitude { get; set; }

    [JsonPropertyName("longitude")]
    public double Longitude { get; set; }
}

public class PutRequest
{
    [JsonPropertyName("context")]
    public string Context { get; set; }

    [JsonPropertyName("path")]
    public string Path { get; set; }

    [JsonPropertyName("value")]
    public JsonElement Value { get; set; }
}

public class PutResponse
{
    [JsonPropertyName("state")]
    public string State { get; set; } = "COMPLETED";

    [JsonPropertyName("statusCode")]
    public int StatusCode { get; set; } = 200;

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}
```

## Configuration

Configure the plugin via the Signal K Admin UI under **Server → Plugin Config**. Configuration options are documented in the plugin's schema.

## PUT Request/Response Format

### Request Format

All PUT requests follow this structure:

```json
{
  "context": "vessels.self",
  "path": "navigation.anchor.position",
  "value": {
    "latitude": 60.1234,
    "longitude": 24.5678
  }
}
```

### Response Format

PUT handlers return a response indicating success or failure:

```json
{
  "state": "COMPLETED",
  "statusCode": 200,
  "message": "Anchor position set successfully"
}
```

**Response States:**

- `COMPLETED` - Request completed (success or error)
- `PENDING` - Request accepted but still processing (not used in this plugin)

**Status Codes:**

- `200` - Success
- `400` - Bad request (invalid input)
- `500` - Server error (handler exception)

## Signal K Data Model Updates

The plugin updates the following paths in the Signal K data model:

### `navigation.anchor.position`

```json
{
  "path": "navigation.anchor.position",
  "value": {
    "latitude": 60.1234,
    "longitude": 24.5678
  }
}
```

### `navigation.anchor.maxRadius`

```json
{
  "path": "navigation.anchor.maxRadius",
  "value": 75
}
```

### `notifications.anchor.drag`

```json
{
  "path": "notifications.anchor.drag",
  "value": {
    "state": "normal",
    "method": [],
    "message": "Anchor watch alarm enabled"
  }
}
```

## Development

### Build for Release

```bash
dotnet publish -c Release
cp bin/Release/net10.0/wasi-wasm/AnchorWatch.wasm plugin.wasm
```

### Build for Debug

```bash
dotnet publish -c Debug
cp bin/Debug/net10.0/wasi-wasm/AnchorWatch.wasm plugin.debug.wasm
```

### Enable Debug Logging

Set `enableDebug: true` in plugin configuration to see detailed logs:

```json
{
  "enabled": true,
  "enableDebug": true,
  "configuration": {
    "maxRadius": 50
  }
}
```

Then check logs:

```bash
journalctl -u signalk -f | grep "example-anchor-watch-dotnet"
```

### Hot Reload

After making changes:

1. Rebuild: `dotnet publish -c Release`
2. Copy WASM: `cp bin/Release/net10.0/wasi-wasm/AnchorWatch.wasm plugin.wasm`
3. Copy to Signal K: `cp plugin.wasm ~/.signalk/node_modules/@signalk/example-anchor-watch-dotnet/`
4. Restart plugin in Admin UI (no server restart needed!)

## Troubleshooting

### Plugin doesn't load

**Check:**

- .NET 10 SDK installed: `dotnet --version`
- WASI SDK 25.0 installed and `WASI_SDK_PATH` environment variable set
- WASM file exists: `ls -lh plugin.wasm`
- WASM file is not empty: `file plugin.wasm`

**Solution:**

```bash
# Ensure WASI_SDK_PATH is set
export WASI_SDK_PATH=/path/to/wasi-sdk-25.0

# Build
dotnet publish -c Release
cp bin/Release/net10.0/wasi-wasm/AnchorWatch.wasm plugin.wasm
```

### PUT handler not found

**Error:** `Handler function not found: handle_put_vessels_self_navigation_anchor_position`

**Check:**

- Handler function name matches the pattern: `handle_put_{context}_{path}` with dots → underscores
- Function has `[UnmanagedCallersOnly(EntryPoint = "...")]` attribute
- Function is `public static`

### Build errors

**Error:** `error NU1100: Unable to resolve 'Microsoft.NET.Runtime.WebAssembly.Wasi.Sdk'`

**Solution:**

```bash
dotnet workload install wasi-experimental
dotnet workload restore
```

**Error:** `The type or namespace name 'UnmanagedCallersOnly' could not be found`

**Solution:** Ensure you're using .NET 10:

```bash
dotnet --version  # Should show 10.0.x
```

### PUT request fails with 501

**Error:** `{"state":"COMPLETED","statusCode":501,"message":"Handler not implemented"}`

**Cause:** Handler function export name doesn't match the registered path

**Solution:**

1. Check the path you registered: `navigation.anchor.position`
2. Convert to handler name: `handle_put_vessels_self_navigation_anchor_position`
3. Ensure the function is exported with exactly that name

## C# WASM Development Tips

### Memory Management

- Use `Marshal.AllocHGlobal()` for allocating memory passed to FFI
- Remember to `Marshal.FreeHGlobal()` when done (not shown in this example for simplicity)
- Use `unsafe` blocks for pointer operations

### String Marshaling

```csharp
// Read UTF-8 string from WASM memory
private static string ReadString(IntPtr ptr, int len)
{
    var bytes = new byte[len];
    Marshal.Copy(ptr, bytes, 0, len);
    return Encoding.UTF8.GetString(bytes);
}

// Write UTF-8 string to WASM memory
private static IntPtr MarshalString(string str)
{
    var bytes = Encoding.UTF8.GetBytes(str + "\0");
    IntPtr ptr = Marshal.AllocHGlobal(bytes.Length);
    Marshal.Copy(bytes, 0, ptr, bytes.Length);
    return ptr;
}
```

### JSON Serialization

Use `System.Text.Json` for JSON operations:

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

var obj = JsonSerializer.Deserialize<MyClass>(jsonString);
var json = JsonSerializer.Serialize(obj);
```

### FFI Declarations

All FFI imports must use `[DllImport("env", EntryPoint = "...")]`:

```csharp
[DllImport("env", EntryPoint = "sk_debug")]
public static extern void Debug(IntPtr messagePtr, int messageLen);
```

All exported functions must use `[UnmanagedCallersOnly(EntryPoint = "...")]`:

```csharp
[UnmanagedCallersOnly(EntryPoint = "plugin_start")]
public static int Start(IntPtr configPtr, int configLen) { ... }
```

## Future Enhancements

Potential additions for this example:

- [ ] **Drag Detection** - Monitor current position and emit alarm when dragging
- [ ] **Distance Calculation** - Calculate distance from anchor using Haversine formula
- [ ] **History Tracking** - Store position history in VFS
- [ ] **Alarm Escalation** - Escalate alarm after sustained drag
- [ ] **Web UI** - Add HTML/CSS/JS dashboard in `public/` folder

## Resources

- **Signal K WASM Plugin Guide**: `../../wasm/WASM_PLUGIN_DEV_GUIDE.md`
- **.NET WASI Documentation**: https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/
- **Signal K Specification**: https://signalk.org/specification/
- **PUT Handler API**: `../../src/put.js`

## Support

- **GitHub Issues**: https://github.com/SignalK/signalk-server/issues
- **Signal K Slack**: #developers channel
- **Signal K Forum**: https://github.com/SignalK/signalk-server/discussions

## License

Apache-2.0

---

**Built with:** C# 14, .NET 10, WASI SDK 25.0
**Binary Size:** ~12 MB (WASI Component Model bundle with .NET runtime)
**Runtime:** Requires WASI Component Model support (NOT currently available in Signal K)

## Known Limitations

### Runtime Incompatibility (Critical)

**componentize-dotnet only works with Wasmtime and WAMR runtimes.**

Signal K uses Node.js with jco transpilation, which is NOT a supported configuration.
Even though jco can transpile the Component Model WASM to JavaScript, the underlying
.NET NativeAOT function table initialization fails in V8.

**Error observed:**

```
RuntimeError: null function or function signature mismatch
    at pluginId (wasm://wasm/...)
```

This error occurs because:

1. .NET NativeAOT uses WASM indirect call tables
2. These tables are initialized by `_initialize()` which works in Wasmtime
3. In V8 (via jco), the table entries remain null
4. Any call to a plugin function crashes

### Build Issues (Solved but runtime still fails)

1. **ThreadStatic attribute** - TLS doesn't work in WASI; patched by removing attribute
2. **Missing using statements** - wit-bindgen doesn't add `using System;`; patched during build

### Binary Size

~20 MB for a simple plugin due to bundled .NET runtime. Compare to:

- AssemblyScript: 3-10 KB
- Rust: 50-200 KB

## Investigation Timeline (Dec 2024)

1. Built .NET 10 WASM component with componentize-dotnet ✅
2. Transpiled with jco to JavaScript ✅
3. Plugin loads in Signal K, `$init` completes ✅
4. Calling `pluginId()` crashes with null function error ❌
5. Tried `_initialize()` call - no effect ❌
6. Tried `InitializeModules()` - crashes (already called) ❌
7. Removed `[ThreadStatic]` - fixed build, not runtime ❌
8. Discovered componentize-dotnet only supports Wasmtime/WAMR ❌
9. No `@bytecodealliance/wasmtime` npm package exists ❌
10. **Conclusion: Wait for better tooling**

For technical details, see the upstream issue: https://github.com/bytecodealliance/componentize-dotnet/issues/103

## Future Possibilities

1. **Native Wasmtime embedding** - If a proper `@bytecodealliance/wasmtime` npm package
   is released, it could run .NET WASM components directly

2. **Improved jco/V8 support** - The jco project may add better support for .NET
   NativeAOT output in the future

3. **Alternative .NET toolchain** - Microsoft or community may develop a compilation
   path that produces V8-compatible WASM

4. **.NET 9 or earlier** - Earlier .NET versions use different WASI approaches but
   still require WASI-SDK and have similar runtime constraints
