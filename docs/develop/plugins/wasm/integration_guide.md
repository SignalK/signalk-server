---
title: Integration Guide for WASM Plugins
---

# Integration Guide for WASM Plugins

## Static File Serving

Plugins can serve HTML, CSS, JavaScript and other static files:

**Structure:**

```
@signalk/my-plugin/
├── public/           # Automatically served at /plugins/my-plugin/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── plugin.wasm
└── package.json
```

**Access:** `http://localhost:3000/plugins/my-plugin/` serves `public/index.html`

## Resource Providers

WASM plugins can act as **resource providers** for Signal K resources like weather data, routes, waypoints, or custom resource types.

### Enabling Resource Provider Capability

Add `resourceProvider: true` to your package.json:

```json
{
  "wasmCapabilities": {
    "network": true,
    "dataRead": true,
    "dataWrite": true,
    "resourceProvider": true
  }
}
```

### Registering as a Resource Provider

#### AssemblyScript

```typescript
import { registerResourceProvider } from '@signalk/assemblyscript-plugin-sdk/assembly/resources'

// In plugin start():
if (!registerResourceProvider('weather-forecasts')) {
  setError('Failed to register as resource provider')
  return 1
}
```

#### Rust

```rust
#[link(wasm_import_module = "env")]
extern "C" {
    fn sk_register_resource_provider(type_ptr: *const u8, type_len: usize) -> i32;
}

pub fn register_resource_provider(resource_type: &str) -> bool {
    let bytes = resource_type.as_bytes();
    unsafe { sk_register_resource_provider(bytes.as_ptr(), bytes.len()) == 1 }
}

// In plugin_start():
if !register_resource_provider("weather-forecasts") {
    // Registration failed
    return 1;
}
```

### Implementing Resource Handlers

After registering, your plugin must export these handler functions:

#### `resources_list_resources` - List resources matching a query

**AssemblyScript:**

```typescript
export function resources_list_resources(queryJson: string): string {
  // queryJson: {"bbox": [...], "distance": 1000, ...}
  // Return JSON object: {"resource-id-1": {...}, "resource-id-2": {...}}
  return '{"forecast-1": {"name": "Current Weather", "type": "weather"}}'
}
```

**Rust:**

```rust
#[no_mangle]
pub extern "C" fn resources_list_resources(
    request_ptr: *const u8, request_len: usize,
    response_ptr: *mut u8, response_max_len: usize,
) -> i32 {
    // Parse query, build response
    let response = r#"{"forecast-1": {"name": "Current Weather"}}"#;
    write_string(response, response_ptr, response_max_len)
}
```

#### `resources_get_resource` - Get a single resource

**AssemblyScript:**

```typescript
export function resources_get_resource(requestJson: string): string {
  // requestJson: {"id": "forecast-1", "property": null}
  return '{"name": "Current Weather", "temperature": 20.5, "humidity": 0.65}'
}
```

#### `resources_set_resource` - Create or update a resource

**AssemblyScript:**

```typescript
export function resources_set_resource(requestJson: string): string {
  // requestJson: {"id": "forecast-1", "value": {...}}
  // Return empty string on success, or error message
  return ''
}
```

#### `resources_delete_resource` - Delete a resource

**AssemblyScript:**

```typescript
export function resources_delete_resource(requestJson: string): string {
  // requestJson: {"id": "forecast-1"}
  return ''
}
```

### Accessing Resources via HTTP

Once registered, resources are available at:

```
GET  /signalk/v2/api/resources/{type}           # List all
GET  /signalk/v2/api/resources/{type}/{id}      # Get one
POST /signalk/v2/api/resources/{type}/{id}      # Create/update
DELETE /signalk/v2/api/resources/{type}/{id}    # Delete
```

### Standard vs Custom Resource Types

Signal K defines standard resource types with validation:

- `routes` - Navigation routes
- `waypoints` - Navigation waypoints
- `notes` - Freeform notes
- `regions` - Geographic regions
- `charts` - Chart metadata

Custom types (like `weather-forecasts`) have no schema validation and can contain any JSON structure.

## Weather Providers

WASM plugins can act as **weather providers** for Signal K's specialized Weather API.

### Weather Provider vs Resource Provider

| Feature    | Weather Provider                           | Resource Provider                  |
| ---------- | ------------------------------------------ | ---------------------------------- |
| API Path   | `/signalk/v2/api/weather/*`                | `/signalk/v2/api/resources/{type}` |
| Methods    | getObservations, getForecasts, getWarnings | list, get, set, delete             |
| Use Case   | Standardized weather data                  | Generic data storage               |
| Capability | `weatherProvider: true`                    | `resourceProvider: true`           |
| FFI        | `sk_register_weather_provider`             | `sk_register_resource_provider`    |

### Enabling Weather Provider Capability

```json
{
  "wasmCapabilities": {
    "network": true,
    "dataWrite": true,
    "weatherProvider": true
  }
}
```

### Implementing Weather Handler Exports

Your plugin must export these handler functions:

#### `weather_get_observations` - Get current weather observations

```typescript
export function weather_get_observations(requestJson: string): string {
  // requestJson: {"position": {"latitude": 60.17, "longitude": 24.94}, "options": {...}}
  return (
    '[{"date":"2025-01-01T00:00:00Z","type":"observation","description":"Clear sky",' +
    '"outside":{"temperature":280.15,"relativeHumidity":0.65,"pressure":101300,"cloudCover":0.1},' +
    '"wind":{"speedTrue":5.0,"directionTrue":1.57}}]'
  )
}
```

#### `weather_get_forecasts` - Get weather forecasts

```typescript
export function weather_get_forecasts(requestJson: string): string {
  // requestJson: {"position": {...}, "type": "daily"|"point", "options": {"maxCount": 7}}
  return '[{"date":"...","type":"daily","outside":{...},"wind":{...}}]'
}
```

#### `weather_get_warnings` - Get weather warnings/alerts

```typescript
export function weather_get_warnings(requestJson: string): string {
  // requestJson: {"position": {...}}
  return '[]'
}
```

### Weather Data Format

#### Observation/Forecast Object

```json
{
  "date": "2025-12-05T10:00:00.000Z",
  "type": "observation",
  "description": "light rain",
  "outside": {
    "temperature": 275.15,
    "minTemperature": 273.0,
    "maxTemperature": 278.0,
    "feelsLikeTemperature": 272.0,
    "relativeHumidity": 0.85,
    "pressure": 101300,
    "cloudCover": 0.75
  },
  "wind": {
    "speedTrue": 5.2,
    "directionTrue": 3.14,
    "gust": 8.0
  }
}
```

Units:

- Temperature: Kelvin
- Humidity: Ratio (0-1)
- Pressure: Pascals
- Wind speed: m/s
- Wind direction: Radians

#### Warning Object

```json
{
  "startTime": "2025-12-05T10:00:00.000Z",
  "endTime": "2025-12-05T18:00:00.000Z",
  "details": "Strong wind warning",
  "source": "Weather Service",
  "type": "Warning"
}
```

### Accessing Weather Data via HTTP

```bash
# List providers
curl http://localhost:3000/signalk/v2/api/weather/_providers

# Get observations for a location
curl "http://localhost:3000/signalk/v2/api/weather/observations?lat=60.17&lon=24.94"

# Get daily forecasts
curl "http://localhost:3000/signalk/v2/api/weather/forecasts/daily?lat=60.17&lon=24.94"

# Get point-in-time forecasts
curl "http://localhost:3000/signalk/v2/api/weather/forecasts/point?lat=60.17&lon=24.94"

# Get weather warnings
curl "http://localhost:3000/signalk/v2/api/weather/warnings?lat=60.17&lon=24.94"
```

## Radar Providers

WASM plugins can act as **radar providers** for Signal K's Radar API at `/signalk/v2/api/vessels/self/radars`.

### Enabling Radar Provider Capability

```json
{
  "signalk": {
    "wasmCapabilities": {
      "radarProvider": true,
      "network": true
    }
  }
}
```

### Registering as a Radar Provider

```typescript
// Declare the host function
@external("env", "sk_register_radar_provider")
declare function sk_register_radar_provider(namePtr: usize, nameLen: i32): i32;

export function start(configJson: string): i32 {
  const name = "My Radar Plugin";
  const nameBytes = String.UTF8.encode(name);
  const result = sk_register_radar_provider(
    changetype<usize>(nameBytes),
    nameBytes.byteLength
  );

  if (result === 0) {
    sk_set_plugin_error("Failed to register as radar provider", 38);
    return 1;
  }

  return 0;
}
```

### Required Handler Exports

```typescript
// Return JSON array of radar IDs this provider manages
export function radar_get_radars(): string {
  return JSON.stringify(['radar-0', 'radar-1'])
}

// Return RadarInfo JSON for a specific radar
export function radar_get_radar_info(requestJson: string): string {
  const info = {
    id: 'radar-0',
    name: 'Furuno DRS4D-NXT',
    brand: 'Furuno',
    status: 'transmit',
    spokesPerRevolution: 2048,
    maxSpokeLen: 1024,
    range: 2000,
    controls: {
      gain: { auto: false, value: 50 },
      sea: { auto: true, value: 30 }
    }
  }
  return JSON.stringify(info)
}
```

### RadarInfo Interface

```typescript
interface RadarInfo {
  id: string // Unique radar ID
  name: string // Display name
  brand?: string // Manufacturer
  status: 'off' | 'standby' | 'transmit' | 'warming'
  spokesPerRevolution: number // Spokes per rotation
  maxSpokeLen: number // Max spoke samples
  range: number // Current range (meters)
  controls: RadarControls // Current control values
  legend?: LegendEntry[] // Color legend for display
  streamUrl?: string // Optional external WebSocket URL
}
```

### Streaming Radar Spokes

Radar spoke data arrives at ~60Hz (2048 spokes/rotation × 30-60 RPM). Plugins stream binary protobuf data directly to clients:

```typescript
import { sk_radar_emit_spokes } from './signalk-api'

// Called when spoke data received via UDP multicast
function processSpokeData(radarId: string, spokeProtobuf: Uint8Array): void {
  sk_radar_emit_spokes(radarId, spokeProtobuf.buffer, spokeProtobuf.byteLength)
}
```

Clients connect to the WebSocket stream:

```javascript
const wsUrl = `ws://${location.host}/signalk/v2/api/vessels/self/radars/radar-0/stream`
const ws = new WebSocket(wsUrl)
ws.binaryType = 'arraybuffer'

ws.onmessage = (event) => {
  const spokeData = new Uint8Array(event.data)
  // Decode and render spoke
}
```
