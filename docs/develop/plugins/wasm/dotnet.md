---
title: C#/.NET Plugins
---

# Creating C#/.NET Plugins

> **NOT WORKING**: .NET WASM plugins cannot run in Signal K's Node.js/jco environment.
> componentize-dotnet only supports Wasmtime and WAMR runtimes. This section is preserved
> for future reference when tooling improves.
>
> **Use AssemblyScript or Rust instead for working WASM plugins.**

## Why C#/.NET Doesn't Work (Dec 2024)

The .NET WASM toolchain (`componentize-dotnet`) produces WASI Component Model output that
requires native Wasmtime or WAMR to execute. When transpiled via jco to JavaScript:

1. The WASM module loads successfully
2. The `$init` promise resolves
3. All functions appear to be exported
4. **Calling any function crashes** with `RuntimeError: null function or function signature mismatch`

This happens because .NET NativeAOT uses indirect call tables that are initialized by
`_initialize()`. In Wasmtime, this works correctly. In V8 (via jco), the table entries
remain null, causing every function call to fail.

**Workarounds attempted:**

- Manual `_initialize()` call - no effect
- `InitializeModules()` call - crashes (already called by `_initialize`)
- Removing `[ThreadStatic]` attribute - fixed build but not runtime
- Various jco flags (`--tla-compat`, `--instantiation sync`) - no effect

**Conclusion:** Wait for better tooling. Both componentize-dotnet and jco are under
active development.

---

## Reference: How It Would Work (Future)

The following documentation describes the **intended** build process for when the
tooling matures. The code compiles and transpiles successfully, but cannot execute.

### Understanding WASI Versions

.NET 10 produces **WASI Component Model** (P2/P3) binaries, not WASI Preview 1 (P1) format:

| Format          | Version Magic | Compatible Runtimes     |
| --------------- | ------------- | ----------------------- |
| WASI P1         | `0x01`        | Node.js WASI, wasmer    |
| Component Model | `0x0d`        | wasmtime, jco transpile |

Signal K currently uses WASI P1. To run .NET plugins, either:

1. **Upgrade runtime** to wasmtime with component support
2. **Transpile** with `jco` to JavaScript + P1 WASM

### Step 1: Install Prerequisites

```powershell
# Install .NET 10 SDK (https://dotnet.microsoft.com/download/dotnet/10.0)
# Verify installation
dotnet --version  # Should show 10.0.x

# Install componentize-dotnet templates
dotnet new install BytecodeAlliance.Componentize.DotNet.Templates
```

### Step 2: Create Project Structure

```
example-anchor-watch-dotnet/
├── AnchorWatch.csproj      # Project file with componentize-dotnet
├── PluginImpl.cs           # Plugin implementation
├── nuget.config            # NuGet feed for LLVM compiler
├── patch-threadstatic.ps1  # Build-time patcher (Windows)
└── wit/
    └── signalk-plugin.wit  # WIT interface definition
```

### Step 3: Create WIT Interface

Create `wit/signalk-plugin.wit`:

```wit
package signalk:plugin@1.0.0;

/// Plugin interface - exported by WASM plugin
interface plugin {
    /// Returns unique plugin identifier
    plugin-id: func() -> string;

    /// Returns human-readable plugin name
    plugin-name: func() -> string;

    /// Returns JSON Schema for plugin configuration
    plugin-schema: func() -> string;

    /// Start the plugin with JSON configuration
    /// Returns 0 on success, non-zero on error
    plugin-start: func(config: string) -> s32;

    /// Stop the plugin
    /// Returns 0 on success, non-zero on error
    plugin-stop: func() -> s32;
}

/// Signal K API - imported from host
interface signalk-api {
    /// Log debug message
    sk-debug: func(message: string);

    /// Set plugin status message
    sk-set-status: func(message: string);

    /// Set plugin error message
    sk-set-error: func(message: string);

    /// Emit a Signal K delta message
    sk-handle-message: func(delta-json: string);

    /// Register a PUT handler for a path
    sk-register-put-handler: func(context: string, path: string) -> s32;
}

/// World definition - connects imports and exports
world signalk-plugin {
    import signalk-api;
    export plugin;
}
```

### Step 4: Create Project File

Create `AnchorWatch.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <RuntimeIdentifier>wasi-wasm</RuntimeIdentifier>
    <UseAppHost>false</UseAppHost>
    <PublishTrimmed>true</PublishTrimmed>
    <InvariantGlobalization>true</InvariantGlobalization>
    <SelfContained>true</SelfContained>
    <OutputType>Library</OutputType>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
    <Nullable>enable</Nullable>
    <IlcExportUnmanagedEntrypoints>true</IlcExportUnmanagedEntrypoints>
    <TrimmerSingleWarn>false</TrimmerSingleWarn>
    <WasmEnableThreads>false</WasmEnableThreads>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="BytecodeAlliance.Componentize.DotNet.Wasm.SDK"
                      Version="0.7.0-preview00010" />
    <!-- Platform-specific LLVM compiler (adjust for your platform) -->
    <PackageReference Include="runtime.win-x64.Microsoft.DotNet.ILCompiler.LLVM"
                      Version="10.0.0-*" />
  </ItemGroup>

  <ItemGroup>
    <Wit Update="wit/signalk-plugin.wit" World="signalk-plugin" />
  </ItemGroup>

  <ItemGroup>
    <Compile Remove="Program.cs" />
  </ItemGroup>

  <!-- Patch wit-bindgen generated files for WASI compatibility -->
  <Target Name="PatchWitBindgen" AfterTargets="GenerateWitBindings" BeforeTargets="CoreCompile">
    <PropertyGroup>
      <WitBindgenFile>$(IntermediateOutputPath)wit_bindgen\SignalkPlugin.cs</WitBindgenFile>
    </PropertyGroup>
    <Exec Command="powershell -ExecutionPolicy Bypass -File &quot;$(MSBuildProjectDirectory)\patch-threadstatic.ps1&quot; -FilePath &quot;$(WitBindgenFile)&quot;"
          Condition="Exists('$(WitBindgenFile)')" />
  </Target>

</Project>
```

### Step 5: Create NuGet Config

Create `nuget.config` for the experimental LLVM compiler:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="dotnet-experimental"
         value="https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet-experimental/nuget/v3/index.json" />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
</configuration>
```

### Step 6: Create Build Patcher

Create `patch-threadstatic.ps1` (required to fix wit-bindgen issues):

```powershell
# Patch wit-bindgen generated C# files for WASI compatibility
# Fixes:
# 1. ThreadStaticAttribute missing in WASI single-threaded environment
# 2. Missing using statements in generated code
param([string]$FilePath)

# Get the directory containing the generated files
$dir = Split-Path $FilePath -Parent

# Patch all .cs files in the wit_bindgen directory
Get-ChildItem -Path $dir -Filter "*.cs" | ForEach-Object {
    $file = $_.FullName
    $content = Get-Content $file -Raw
    $modified = $false

    # Add missing using statements if not present
    if ($content -match '#nullable enable' -and $content -notmatch 'using System;(\r?\n)') {
        $content = $content -replace '(#nullable enable\r?\n)', "`$1using System;`nusing System.Collections.Generic;`n"
        $modified = $true
    }

    # For SignalkPlugin.cs specifically, add ThreadStatic stub
    if ($_.Name -eq 'SignalkPlugin.cs') {
        if ($content -match '\[ThreadStatic\]') {
            $content = $content -replace '\[ThreadStatic\]', '[global::System.ThreadStatic]'
            $modified = $true
        }

        if ($content -notmatch '// WASI ThreadStatic stub') {
            $stub = @"
// WASI ThreadStatic stub - single-threaded environment
namespace System {
    [global::System.AttributeUsage(global::System.AttributeTargets.Field, Inherited = false)]
    public sealed class ThreadStaticAttribute : global::System.Attribute { }
}

"@
            $content = $content -replace 'namespace SignalkPluginWorld', ($stub + 'namespace SignalkPluginWorld')
            $modified = $true
        }
    }

    if ($modified) {
        Set-Content $file $content -NoNewline
        Write-Host "Patched $($_.Name)"
    }
}

Write-Host "Patching complete"
```

### Step 7: Implement Plugin

Create `PluginImpl.cs`:

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;
using SignalkPluginWorld.wit.exports.signalk.plugin.v1_0_0;
using SignalkPluginWorld.wit.imports.signalk.plugin.v1_0_0;

namespace AnchorWatch;

/// <summary>
/// Anchor Watch Plugin - monitors vessel position relative to anchor
/// </summary>
public class PluginImpl : IPlugin
{
    private static PluginConfig? _config;
    private static bool _isRunning;

    public static string PluginId() => "anchor-watch-dotnet";

    public static string PluginName() => "Anchor Watch (.NET)";

    public static string PluginSchema() => """
        {
            "type": "object",
            "title": "Anchor Watch Configuration",
            "properties": {
                "maxRadius": {
                    "type": "number",
                    "title": "Maximum Radius (meters)",
                    "description": "Alert when vessel drifts beyond this radius from anchor",
                    "default": 50
                },
                "checkInterval": {
                    "type": "number",
                    "title": "Check Interval (seconds)",
                    "default": 10
                }
            }
        }
        """;

    public static int PluginStart(string config)
    {
        try
        {
            SignalkApiInterop.SkDebug($"Starting Anchor Watch with config: {config}");

            // Parse configuration
            _config = string.IsNullOrEmpty(config)
                ? new PluginConfig()
                : JsonSerializer.Deserialize(config, SourceGenerationContext.Default.PluginConfig)
                  ?? new PluginConfig();

            _isRunning = true;

            SignalkApiInterop.SkSetStatus($"Monitoring anchor (radius: {_config.MaxRadius}m)");
            SignalkApiInterop.SkDebug("Anchor Watch started successfully");

            return 0; // Success
        }
        catch (Exception ex)
        {
            SignalkApiInterop.SkSetError($"Failed to start: {ex.Message}");
            return 1; // Error
        }
    }

    public static int PluginStop()
    {
        _isRunning = false;
        SignalkApiInterop.SkSetStatus("Stopped");
        SignalkApiInterop.SkDebug("Anchor Watch stopped");
        return 0;
    }
}

/// <summary>
/// Plugin configuration
/// </summary>
public class PluginConfig
{
    [JsonPropertyName("maxRadius")]
    public double MaxRadius { get; set; } = 50;

    [JsonPropertyName("checkInterval")]
    public int CheckInterval { get; set; } = 10;
}

/// <summary>
/// JSON source generator for AOT compatibility
/// </summary>
[JsonSourceGenerationOptions(WriteIndented = false)]
[JsonSerializable(typeof(PluginConfig))]
internal partial class SourceGenerationContext : JsonSerializerContext
{
}
```

### Step 8: Build

```powershell
cd examples/wasm-plugins/example-anchor-watch-dotnet

# Clean previous build
Remove-Item -Recurse -Force obj -ErrorAction SilentlyContinue

# Build
dotnet build

# Output location
# bin/Debug/net10.0/wasi-wasm/publish/AnchorWatch.wasm
```

Expected output:

```
Wiederherstellung abgeschlossen (1.7s)
  AnchorWatch net10.0 wasi-wasm erfolgreich mit 1 Warnung(en) (16.9s)
```

The warning about `ThreadStaticAttribute` conflict is expected and harmless.

### Step 9: Verify Output

```powershell
# Check file size
dir bin\Debug\net10.0\wasi-wasm\publish\AnchorWatch.wasm
# ~20 MB

# Verify WIT interface (requires jco)
npx @bytecodealliance/jco wit bin\Debug\net10.0\wasi-wasm\publish\AnchorWatch.wasm
```

Expected WIT output:

```wit
package root:component;

world root {
  import wasi:cli/environment@0.2.0;
  import wasi:io/streams@0.2.0;
  ...
  import signalk:plugin/signalk-api@1.0.0;

  export signalk:plugin/plugin@1.0.0;
}
```

## Troubleshooting .NET Builds

### Error: ThreadStaticAttribute not found

The `patch-threadstatic.ps1` script should fix this automatically. If it persists:

1. Delete the `obj` folder completely
2. Ensure the patch script path is correct in `.csproj`
3. Run `dotnet build` again

### Error: Microsoft.DotNet.ILCompiler.LLVM not found

Ensure `nuget.config` is present with the `dotnet-experimental` feed.

### Error: List<> or Span<> not found

The patch script adds missing `using` statements. If errors persist, manually add to the generated files:

```csharp
using System;
using System.Collections.Generic;
```

### Large binary size (~20 MB)

This is expected for NativeAOT-LLVM compilation. The binary includes:

- .NET runtime (trimmed)
- WASI Component Model adapter
- Your plugin code

Future optimizations may reduce this.

## Using the Signal K API

The WIT-generated bindings provide type-safe access to Signal K APIs:

```csharp
using SignalkPluginWorld.wit.imports.signalk.plugin.v1_0_0;

// Log debug message
SignalkApiInterop.SkDebug("Debug message");

// Set status
SignalkApiInterop.SkSetStatus("Running");

// Set error
SignalkApiInterop.SkSetError("Something went wrong");

// Emit delta
var delta = """
{
    "context": "vessels.self",
    "updates": [{
        "source": {"label": "anchor-watch-dotnet", "type": "plugin"},
        "timestamp": "2025-12-02T10:00:00.000Z",
        "values": [{
            "path": "navigation.anchor.position",
            "value": {"latitude": 60.1234, "longitude": 24.5678}
        }]
    }]
}
""";
SignalkApiInterop.SkHandleMessage(delta);

// Register PUT handler
SignalkApiInterop.SkRegisterPutHandler("vessels.self", "navigation.anchor.position");
```

## Runtime Integration (Coming Soon)

The .NET WASM component uses WASI Component Model format. To run it in Signal K:

**Option 1: Wasmtime Runtime**
Replace Node.js WASI with wasmtime (supports Component Model natively).

**Option 2: jco Transpilation**
Transpile to JavaScript + WASI P1:

```bash
npx @bytecodealliance/jco transpile AnchorWatch.wasm -o ./transpiled
```

This generates JavaScript bindings that work with the current Node.js runtime.

## Additional Resources

See the example-anchor-watch-dotnet example in `examples/wasm-plugins/example-anchor-watch-dotnet/` for the complete working example.
