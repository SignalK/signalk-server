# Weather Plugin Example

This example demonstrates how to create a SignalK WASM plugin with **network capability** and **resource provider** support using the AssemblyScript SDK and **as-fetch** with **Asyncify** support.

## What This Plugin Demonstrates

This is a **production-ready reference implementation** showing:

- ✅ **Asyncify Integration** - Synchronous-style async HTTP requests in WASM
- ✅ **as-fetch Library** - HTTP client for AssemblyScript using native fetch
- ✅ **Network Capability** - Secure network access with permission system
- ✅ **Resource Provider** - Serve weather data via REST API (`/signalk/v2/api/resources/weather`)
- ✅ **Real API Integration** - Fetches live weather data from OpenWeatherMap
- ✅ **Signal K Deltas** - Emits data to standard Signal K paths
- ✅ **Configuration Schema** - User-friendly configuration with validation
- ✅ **Error Handling** - Robust error handling and status reporting
- ✅ **Auto-restart Support** - Plugin starts automatically on server restart

## Features

### Signal K Deltas

The plugin fetches real weather data from OpenWeatherMap API and emits Signal K deltas for:

- **environment.outside.temperature** - Temperature in Celsius
- **environment.outside.humidity** - Relative humidity (0-1 range)
- **environment.outside.pressure** - Atmospheric pressure in Pascals
- **environment.wind.speedTrue** - Wind speed in m/s
- **environment.wind.directionTrue** - Wind direction in radians

### Resource Provider API

The plugin also registers as a **resource provider** for the `weather` resource type, making weather data available via the Signal K REST API:

```bash
# List all weather resources
curl http://localhost:3000/signalk/v2/api/resources/weather
# Returns: {"current": {...weather data...}}

# Get specific weather resource
curl http://localhost:3000/signalk/v2/api/resources/weather/current
# Returns: {...weather data...}
```

Example response:

```json
{
  "current": {
    "temperature": 4.24,
    "humidity": 86,
    "pressure": 102000,
    "windSpeed": 10.73,
    "windDirection": 3.39,
    "timestamp": "2025-12-03T08:38:03.000Z",
    "location": {
      "latitude": 60.1699,
      "longitude": 24.9384
    }
  }
}
```

## Prerequisites

1. **Node.js 18+** (required for native fetch support)
2. **OpenWeatherMap API Key** - Get a free key at https://openweathermap.org/api
3. **SignalK Server 3.0+** with WASM plugin support

## Quick Start

### 1. Build the Plugin

```bash
cd examples/wasm-plugins/example-weather-plugin
npm install
npm run build
```

This creates `build/plugin.wasm` with Asyncify support enabled.

### 2. Install to SignalK Server

The easiest way is through the Plugin Config UI:

1. Start SignalK server
2. Navigate to **Server** → **Plugin Config**
3. The plugin should appear as "Weather Data Plugin (Example)"
4. Configure it (see Configuration section)
5. Enable the plugin

### 3. Configure the Plugin

| Field            | Type   | Default      | Description                        |
| ---------------- | ------ | ------------ | ---------------------------------- |
| `apiKey`         | string | _(required)_ | Your OpenWeatherMap API key        |
| `latitude`       | number | 60.1699      | Latitude for weather location      |
| `longitude`      | number | 24.9384      | Longitude for weather location     |
| `updateInterval` | number | 600000       | Update interval in ms (10 minutes) |

**Important**: You MUST provide a valid OpenWeatherMap API key for the plugin to work.

### 4. Verify It's Working

1. Check plugin status in **Server Dashboard** - should show "Weather plugin running - data fetched from OpenWeatherMap"
2. View live data in **Data Browser** under `environment.outside.*`
3. Check logs: `journalctl -u signalk -f | grep weather`

Expected log output:

```
signalk:wasm:runtime Asyncify state after plugin_start: 1
signalk:wasm:runtime Plugin is in unwound state - waiting for async operation to complete
signalk:wasm:runtime FetchHandler calling main function to resume execution
signalk:wasm:runtime Async operation completed, plugin execution resumed
```

## Understanding Asyncify

### What is Asyncify?

Asyncify is a Binaryen compile-time transform that enables **pausing and resuming** WebAssembly execution. This allows you to write synchronous-looking code in AssemblyScript that actually performs asynchronous operations like HTTP requests.

### How It Works

```typescript
// This looks synchronous but is actually async!
const response = fetchSync('https://api.example.com/data')

// Under the hood:
// 1. WASM execution pauses (state = UNWOUND)
// 2. HTTP request happens in JavaScript
// 3. When response arrives, WASM execution resumes (state = REWOUND)
// 4. Your code continues with the response
```

### Asyncify State Machine

- **State 0 (Normal)**: Regular execution
- **State 1 (Unwound)**: Paused, waiting for async operation
- **State 2 (Rewound)**: Resuming after async operation completes

The SignalK WASM runtime handles all state transitions automatically!

## Code Structure

```
example-weather-plugin/
├── assembly/
│   └── index.ts              # Main plugin implementation
├── build/
│   ├── plugin.wasm          # Compiled WASM binary (after npm run build)
│   ├── plugin.d.ts          # TypeScript definitions
│   └── plugin.js            # Generated bindings
├── node_modules/
│   ├── as-fetch/            # HTTP client library with Asyncify
│   └── signalk-assemblyscript-plugin-sdk/
├── asconfig.json            # AssemblyScript compiler config (CRITICAL!)
├── package.json             # Dependencies and capabilities
└── README.md
```

## Critical Configuration Files

### 1. asconfig.json - Enables Asyncify

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
    "transform": ["as-fetch/transform"] // ← ENABLES ASYNCIFY!
  }
}
```

**Critical Setting**: `"transform": ["as-fetch/transform"]`

- This enables the Asyncify transform during compilation
- **Without this, fetchSync() will not work!**
- Must also have `"bindings": "esm"` for FetchHandler
- Must have `"exportRuntime": true` for Asyncify state functions

### 2. package.json - Declares Capabilities

```json
{
  "name": "@signalk/weather-plugin-example",
  "version": "0.2.0",
  "wasmManifest": "build/plugin.wasm",
  "wasmCapabilities": {
    "network": true, // ← REQUIRED for as-fetch
    "storage": "vfs-only",
    "dataRead": true,
    "dataWrite": true,
    "serialPorts": false,
    "resourceProvider": true // ← REQUIRED for resource provider
  },
  "dependencies": {
    "as-fetch": "^2.1.4",
    "@signalk/assemblyscript-plugin-sdk": "^0.2.0"
  }
}
```

**Critical Settings**:

- `"network": true` - Grants permission to make HTTP requests (required for `fetchSync()`)
- `"resourceProvider": true` - Grants permission to register as a resource provider

## Using as-fetch in Your Code

### Basic Pattern

```typescript
import { fetchSync } from 'as-fetch/sync'
import { Response } from 'as-fetch/assembly'

export function plugin_start(config: Config): i32 {
  // 1. Make HTTP request (looks sync, but uses Asyncify)
  const response = fetchSync('https://api.example.com/data')

  // 2. Check if request succeeded
  if (!response) {
    setError('Failed to fetch data')
    return 1
  }

  // 3. Check HTTP status
  if (response.status !== 200) {
    setError(`API error: ${response.status.toString()}`)
    return 1
  }

  // 4. Get response text
  const data = response.text()

  // 5. Process and emit data
  // ... your code here

  return 0
}
```

### Complete Example from This Plugin

```typescript
private fetchWeatherData(): void {
  // 1. Build API URL
  const url =
    `https://api.openweathermap.org/data/2.5/weather?lat=${this.lat}&lon=${this.lon}&appid=${this.apiKey}&units=metric`

  debug('Fetching weather data from: ' + url)

  // 2. Make request using fetchSync (Asyncify magic happens here!)
  const response = fetchSync(url)

  // 3. Error handling
  if (!response) {
    setError('Failed to fetch weather data from OpenWeatherMap')
    return
  }

  if (response.status !== 200) {
    setError(`OpenWeatherMap API error: ${response.status.toString()}`)
    return
  }

  // 4. Parse JSON response
  const jsonText = response.text()
  const weatherData = JSON.parse<OpenWeatherMapResponse>(jsonText)

  // 5. Create and emit deltas
  const delta = createEmptyDelta(this.pluginId)

  const tempUpdate = new Update()
  tempUpdate.path = 'environment.outside.temperature'
  tempUpdate.value = JSON.stringify(weatherData.main.temp + 273.15) // Convert to Kelvin
  delta.updates[0].values.push(tempUpdate)

  const humidityUpdate = new Update()
  humidityUpdate.path = 'environment.outside.humidity'
  humidityUpdate.value = JSON.stringify(weatherData.main.humidity / 100.0) // Convert to 0-1 range
  delta.updates[0].values.push(humidityUpdate)

  // ... more updates

  emit(delta)
  setStatus('Weather data updated successfully')
}
```

## Using Resource Providers

### Registering as a Resource Provider

```typescript
import {
  registerResourceProvider,
  ResourceGetRequest
} from 'signalk-assemblyscript-plugin-sdk/assembly/resources'

// In your start() function:
if (registerResourceProvider('weather')) {
  debug('Successfully registered as weather resource provider')
} else {
  debug('Failed to register - capability not granted')
}
```

### Implementing Resource Handlers

Export these functions to handle resource requests:

```typescript
// List all resources - GET /signalk/v2/api/resources/weather
export function resources_list_resources(queryJson: string): string {
  // Return JSON object: { "id1": {...}, "id2": {...} }
  return '{"current":' + cachedData.toJSON() + '}'
}

// Get specific resource - GET /signalk/v2/api/resources/weather/{id}
export function resources_get_resource(requestJson: string): string {
  const req = ResourceGetRequest.parse(requestJson)

  if (req.id === 'current') {
    return cachedData.toJSON()
  }

  return '{"error":"Resource not found"}'
}

// Optional: Set resource - PUT /signalk/v2/api/resources/weather/{id}
export function resources_set_resource(requestJson: string): string {
  // Handle resource creation/update
  return '{"success":true}'
}

// Optional: Delete resource - DELETE /signalk/v2/api/resources/weather/{id}
export function resources_delete_resource(requestJson: string): string {
  // Handle resource deletion
  return '{"success":true}'
}
```

### ResourceGetRequest Structure

```typescript
class ResourceGetRequest {
  id: string // Resource ID from URL path
  property: string // Optional property filter

  static parse(json: string): ResourceGetRequest
}
```

## How the Runtime Handles Asyncify

The SignalK WASM runtime automatically:

1. **Initializes FetchHandler** with a resume callback
2. **Calls plugin_start()** with your configuration
3. **Detects Asyncify state** - checks if state = 1 (unwound)
4. **Waits for completion** - awaits the Promise
5. **Resumes execution** - FetchHandler calls resume callback
6. **Returns result** - your plugin continues normally

You don't need to handle any of this - it's all automatic!

### Race Condition Prevention

The runtime sets up the resume callback **BEFORE** calling `plugin_start()` to prevent race conditions:

```typescript
// Set up Promise and callback FIRST
asyncifyResumeFunction = () => {
  // Re-call plugin_start to continue from rewind state
}

// THEN call plugin_start
let result = asLoaderInstance.exports.plugin_start(configPtr, configLen)

// If state = 1, wait for Promise to resolve
if (state === 1) {
  await resumePromise
}
```

This ensures fast HTTP responses don't complete before the callback is registered.

## Debugging

### Enable Debug Logging

```bash
# Linux/macOS
DEBUG=signalk:wasm:* npm start

# Windows PowerShell
$env:DEBUG="signalk:wasm:*"
npm start
```

### Key Log Messages to Look For

**Successful Asyncify flow:**

```
signalk:wasm:runtime Initializing as-fetch handler with exports
signalk:wasm:runtime Calling plugin_start with config: {...
signalk:wasm:runtime Asyncify state after plugin_start: 1
signalk:wasm:runtime Plugin is in unwound state - waiting for async operation to complete
signalk:wasm:runtime FetchHandler calling main function to resume execution
signalk:wasm:runtime Re-calling plugin_start to resume from rewind state
signalk:wasm:runtime Async operation completed, plugin execution resumed
```

**Config file loading:**

```
signalk:wasm:loader Plugin @signalk/weather-plugin-example is enabled, initializing VFS and preparing for startup
```

## Troubleshooting

### Plugin Doesn't Fetch Data on Server Restart

**Symptom**: Plugin works when enabled/disabled in UI, but doesn't start on server restart

**Cause**: Config file path mismatch (fixed in v0.1.8)

**Solution**: Update to latest version. The runtime now:

1. Loads WASM first to get real plugin ID
2. Uses real ID to find config file
3. Reuses loaded instance for enabled plugins

### "Network capability not granted"

**Cause**: Missing or incorrect network capability declaration

**Solution**: Ensure `package.json` has:

```json
"wasmCapabilities": {
  "network": true
}
```

### Asyncify Not Working / fetchSync Hangs

**Causes**:

1. Missing Asyncify transform in `asconfig.json`
2. Wrong as-fetch import path
3. Missing `"bindings": "esm"` configuration

**Solution**: Check `asconfig.json`:

```json
{
  "options": {
    "bindings": "esm", // ← Required
    "exportRuntime": true, // ← Required
    "transform": ["as-fetch/transform"] // ← Required
  }
}
```

And use correct import:

```typescript
import { fetchSync } from 'as-fetch/sync' // ← Correct
// NOT: import { fetchSync } from 'as-fetch'
```

### "Failed to fetch weather data"

**Possible Causes**:

1. Invalid API key
2. No internet connection
3. OpenWeatherMap API rate limit exceeded
4. Node.js version < 18 (native fetch not available)

**Solution**:

1. Verify API key at https://openweathermap.org/api
2. Test URL in browser or curl
3. Check rate limits (free tier: 60 calls/minute)
4. Update Node.js to v18 or higher

### No Data in Signal K Paths

**Check**:

1. Plugin status in **Server Dashboard**
2. Debug logs: `journalctl -u signalk -f | grep weather`
3. Data Browser for `environment.outside.*` paths
4. Configuration values (lat/lon/apiKey)

## API Reference

### as-fetch Functions

```typescript
// Synchronous-style HTTP GET (uses Asyncify)
function fetchSync(url: string): Response | null

// Response object
class Response {
  status: i32 // HTTP status code
  text(): string // Get response body as text
}
```

### SignalK SDK Functions

```typescript
// Emit delta to server
function emit(delta: Delta): void

// Set plugin status (shown in Dashboard)
function setStatus(message: string): void

// Set plugin error (shown in Dashboard)
function setError(message: string): void

// Debug logging (server logs)
function debug(message: string): void

// Create simple delta
function createSimpleDelta(source: string, path: string, value: string): Delta

// Create empty delta with updates array
function createEmptyDelta(source: string): Delta
```

## Best Practices

### 1. Always Check Response Status

```typescript
if (!response) {
  setError('Request failed')
  return
}

if (response.status !== 200) {
  setError(`HTTP ${response.status.toString()}`)
  return
}
```

### 2. Use Proper Error Messages

```typescript
// Good - specific and actionable
setError('OpenWeatherMap API returned 401 - check API key')

// Bad - vague and unhelpful
setError('Error')
```

### 3. Set Status on Success

```typescript
fetchWeatherData()
setStatus('Weather plugin running - data fetched from OpenWeatherMap')
```

This makes the plugin visible in the Server Dashboard.

### 4. Use Debug Logging

```typescript
debug('Fetching weather from: ' + url)
debug('Temperature: ' + temp.toString())
```

Helps troubleshoot issues without cluttering error messages.

### 5. Validate Configuration

```typescript
if (this.apiKey.length === 0) {
  setError('API key is required')
  return 1
}
```

## Extending This Example

Ideas for your own plugins:

1. **Different APIs** - NOAA, Weather Underground, etc.
2. **Multiple Endpoints** - Combine data from several sources
3. **Caching** - Store responses in VFS to reduce API calls
4. **Rate Limiting** - Implement backoff for API limits
5. **JSON Parser** - Use `json-as` library for complex parsing
6. **POST Requests** - Submit data to external services
7. **Authentication** - Bearer tokens, OAuth, etc.

## Performance Considerations

### Memory Usage

- Response text is stored in WASM linear memory
- Large responses may need memory growth configuration
- Consider streaming for very large responses

### API Rate Limits

OpenWeatherMap free tier:

- 60 calls/minute
- 1,000,000 calls/month

Default update interval (10 minutes) = ~4,320 calls/month ✅

### Startup Time

- Plugin loads WASM on server start
- First HTTP request may take longer (DNS lookup, TCP handshake)
- Subsequent requests are typically faster

## Security Considerations

### Network Capability System

The plugin **cannot** make HTTP requests unless:

1. `package.json` declares `"network": true`
2. User approves the capability (implicit via install)
3. Runtime grants the capability at load time

### API Key Protection

- API keys are stored in plugin config (encrypted at rest)
- Never log full API keys
- Consider using environment variables for production

### HTTPS Only

- Always use HTTPS URLs for production APIs
- Avoid HTTP to prevent MITM attacks

## Version History

- **v0.2.0** - Added resource provider capability for REST API access to weather data
- **v0.1.8** - Fixed config file path mismatch and race condition prevention
- **v0.1.7** - Added race condition fix in Asyncify callback setup
- **v0.1.6** - Initial Asyncify support implementation
- **v0.1.5** - First working version with as-fetch

## Additional Resources

### Documentation

- [SignalK WASM Plugin Dev Guide](../../../WASM_PLUGIN_DEV_GUIDE.md) - Complete guide to WASM plugin development
- [AssemblyScript Documentation](https://www.assemblyscript.org/) - Language reference
- [as-fetch Library](https://github.com/rockmor/as-fetch) - HTTP client for AssemblyScript
- [OpenWeatherMap API](https://openweathermap.org/api) - Weather API documentation

### Support

- File issues: https://github.com/SignalK/signalk-server/issues
- Discussions: https://github.com/SignalK/signalk-server/discussions
- Slack: https://signalk-dev.slack.com/

## License

Apache-2.0

---

**Ready to build your own plugin?** Start by copying this example and modifying it for your use case!
