---
title: WASM Plugins
children:
  - assemblyscript.md
  - rust.md
  - go.md
  - dotnet.md
  - http_endpoints.md
  - deltas.md
  - capabilities.md
  - best_practices.md
  - integration_guide.md
---

# WASM Plugin Development Guide

## Overview

This guide covers how to develop WASM/WASIX plugins for Signal K Server 3.0. WASM plugins run in a secure sandbox with isolated storage and capability-based permissions.

## What Makes a WASM Plugin?

A WASM plugin is an npm package that contains the WASM code for the plugin instead of the traditional JavaScript code. A WASM plugin is identified by the `signalk-wasm-plugin` keyword in package.json and the **`wasmManifest`** field in `package.json`:

```json
{
  "name": "my-plugin-name",
  "wasmManifest": "plugin.wasm",
  "wasmCapabilities": { ... }
}
```

**Key points:**

- **`wasmManifest`** (required): Path to the compiled `.wasm` file. This field tells Signal K to load this as a WASM plugin instead of a Node.js plugin.
- **`wasmCapabilities`** (required): Declares what permissions the plugin needs (network, storage, etc.)
- **Package name** (flexible): Can be anything - `my-plugin`, `@myorg/my-plugin`, etc. There is **no requirement** to use `@signalk/` scope.
- **Keywords**: Include `signalk-wasm-plugin` for discovery (do **not** use `signalk-node-server-plugin` - that's for Node.js plugins only)

## Language Options

Signal K Server supports multiple languages for WASM plugin development:

- **AssemblyScript** - TypeScript-like syntax, easiest for JS/TS developers, smallest binaries (3-10 KB)
- **Rust** - Best performance and tooling, medium binaries (50-200 KB)
- **Go/TinyGo** - Go via TinyGo compiler, medium binaries (50-150 KB)
- **C#/.NET** - **NOT WORKING** - .NET 10 with componentize-dotnet produces WASI Component Model (P2/P3) format. Currently incompatible with Node.js/jco runtime. See [Creating C#/.NET Plugins](./dotnet.md) for details.

## Why WASM Plugins?

### Benefits

- **Security**: Sandboxed execution with no access to host system
- **Hot-reload**: Update plugins without server restart
- **Multi-language**: Write plugins in Rust, AssemblyScript, and more
- **Crash isolation**: Plugin crashes don't affect server
- **Performance**: Near-native performance with WASM
- **Self contained**: WASM plugins do not install any additional dependencies
- **Small binaries (compared to native options)**: 3-200 KB depending on language

### Current Capabilities

- **Delta Emission**: Send SignalK deltas to update vessel data
- **Status & Error Reporting**: Set plugin status and error messages
- **Configuration**: The same JSON schema-based configuration as JS plugins
- **Data Storage**: VFS-isolated file storage
- **HTTP Endpoints**: Register custom REST API endpoints
- **Static Files**: Serve web UI from `public/` directory
- **Network Access**: HTTP requests via as-fetch (AssemblyScript)
- **Resource Providers**: Serve SignalK resources
- **Weather Providers**: Integrate with Signal K Weather API
- **Radar Providers**: Integrate with Signal K Radar API

## Choose Your Language

### AssemblyScript - Recommended for JS/TS Developers

**Best for:**

- Quick prototypes
- Simple data processing
- Migrating existing Node.js plugins
- Developers familiar with TypeScript

**Pros:**

- TypeScript-like syntax
- Fast development
- Smallest binaries (3-10 KB)
- Familiar tooling (npm)

**Cons:**

- Smaller ecosystem than Rust
- Some TypeScript features unavailable
- Manual memory management

**[Jump to AssemblyScript Guide](./assemblyscript.md)**

### Rust - Recommended for Performance-Critical Plugins

**Best for:**

- Performance-critical plugins
- Complex algorithms
- Low-level operations
- Production plugins

**Pros:**

- Best performance
- Memory safety
- Rich ecosystem
- Strong typing

**Cons:**

- Steeper learning curve
- Longer compile times
- Larger binaries (50-200 KB)

**[Jump to Rust Guide](./rust.md)**

### Go/TinyGo - For Go Developers

**Best for:**

- Go developers wanting to write plugins
- Medium complexity plugins
- Resource providers with hybrid patterns

**Pros:**

- Familiar Go syntax
- Good standard library support
- Medium binaries (50-150 KB)
- Strong typing

**Cons:**

- Requires TinyGo (not standard Go)
- Some Go features unavailable
- Slower than Rust

**[Jump to Go/TinyGo Guide](./go.md)**

### C#/.NET - NOT CURRENTLY WORKING

> **Status: Non-functional** - See [jco issue #1173](https://github.com/bytecodealliance/jco/issues/1173) for details and updates.

componentize-dotnet produces WASI Component Model format which is currently incompatible with the Node.js/jco runtime used by Signal K.

**Recommendation:** Use AssemblyScript or Rust instead.

**[Jump to C#/.NET Guide](./dotnet.md)** (reference only)
