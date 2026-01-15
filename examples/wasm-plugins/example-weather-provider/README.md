# Weather Provider Plugin Example

This example demonstrates how to create a WASM plugin that integrates with Signal K's **Weather Provider API**.

## What is a Weather Provider?

Signal K has a specialized Weather API that provides standardized endpoints for weather data:

```
GET /signalk/v2/api/weather/observations?lat=...&lon=...
GET /signalk/v2/api/weather/forecasts/daily?lat=...&lon=...
GET /signalk/v2/api/weather/forecasts/point?lat=...&lon=...
GET /signalk/v2/api/weather/warnings?lat=...&lon=...
GET /signalk/v2/api/weather/_providers
```

This is different from the **Resource Provider** pattern (used by `weather-plugin`), which provides generic key-value storage at `/signalk/v2/api/resources/{type}`.

## Features

- Registers as a Signal K Weather Provider
- Fetches real weather data from OpenWeatherMap API
- Implements all three Weather Provider methods:
  - `getObservations()` - Current weather conditions
  - `getForecasts()` - Daily and point-in-time forecasts
  - `getWarnings()` - Weather warnings/alerts
- Also emits weather data as Signal K deltas

## Prerequisites

- Node.js 18+
- OpenWeatherMap API key (free tier works)

## Building

```bash
cd examples/wasm-plugins/example-weather-provider
npm install
npm run build
```

## Installation

**Note:** The AssemblyScript Plugin SDK is not yet published to npm. Install it first - see [example-hello-assemblyscript](../example-hello-assemblyscript/README.md#installing-to-signal-k) for instructions.

1. Build the plugin
2. Create installable package and install:
   ```bash
   npm pack
   cd ~/.signalk
   npm install /path/to/signalk-example-weather-provider-0.1.0.tgz
   ```
3. Restart Signal K server
4. Configure with your OpenWeatherMap API key

## Configuration

Configure the plugin via the Signal K Admin UI under **Server → Plugin Config**. You will need to provide your OpenWeatherMap API key. Configuration options are documented in the plugin's schema.

## Testing

Once configured and running, test the Weather API:

```bash
# Get providers
curl http://localhost:3000/signalk/v2/api/weather/_providers

# Get observations
curl "http://localhost:3000/signalk/v2/api/weather/observations?lat=60.17&lon=24.94"

# Get daily forecast
curl "http://localhost:3000/signalk/v2/api/weather/forecasts/daily?lat=60.17&lon=24.94"

# Get point forecast
curl "http://localhost:3000/signalk/v2/api/weather/forecasts/point?lat=60.17&lon=24.94"

# Get warnings
curl "http://localhost:3000/signalk/v2/api/weather/warnings?lat=60.17&lon=24.94"
```

## Weather Provider vs Resource Provider

| Feature    | Weather Provider                           | Resource Provider                  |
| ---------- | ------------------------------------------ | ---------------------------------- |
| API Path   | `/signalk/v2/api/weather/*`                | `/signalk/v2/api/resources/{type}` |
| Methods    | getObservations, getForecasts, getWarnings | list, get, set, delete             |
| Use Case   | Standardized weather data                  | Generic data storage               |
| Capability | `weatherProvider: true`                    | `resourceProvider: true`           |
| FFI        | `sk_register_weather_provider`             | `sk_register_resource_provider`    |

## Implementation Details

### Capability Declaration

In `package.json`:

```json
{
  "wasmCapabilities": {
    "weatherProvider": true,
    "network": true
  }
}
```

### Registration

In plugin `start()`:

```typescript
@external("env", "sk_register_weather_provider")
declare function sk_register_weather_provider(namePtr: usize, nameLen: usize): i32

// Register with provider name
registerWeatherProvider('OpenWeatherMap WASM')
```

### Handler Exports

The plugin must export these functions:

```typescript
// GET /signalk/v2/api/weather/observations
export function weather_get_observations(requestJson: string): string

// GET /signalk/v2/api/weather/forecasts/{type}
export function weather_get_forecasts(requestJson: string): string

// GET /signalk/v2/api/weather/warnings
export function weather_get_warnings(requestJson: string): string
```

### Request Format

```json
{
  "position": {
    "latitude": 60.17,
    "longitude": 24.94
  },
  "type": "daily",
  "options": {
    "maxCount": 7
  }
}
```

### Response Format (Observations/Forecasts)

```json
[
  {
    "date": "2025-12-05T10:00:00.000Z",
    "type": "observation",
    "description": "light rain",
    "outside": {
      "temperature": 275.15,
      "relativeHumidity": 0.85,
      "pressure": 101300,
      "cloudCover": 0.75
    },
    "wind": {
      "speedTrue": 5.2,
      "directionTrue": 3.14
    }
  }
]
```

### Response Format (Warnings)

```json
[
  {
    "startTime": "2025-12-05T10:00:00.000Z",
    "endTime": "2025-12-05T18:00:00.000Z",
    "details": "Strong wind warning",
    "source": "OpenWeatherMap",
    "type": "Warning"
  }
]
```

## See Also

- [example-weather-plugin](../example-weather-plugin/) - Resource Provider example
- [WASM Developer Guide](../../../docs/develop/plugins/wasm/README.md)
- [Signal K Weather API](https://signalk.org/specification/1.7.0/doc/weather.html)
