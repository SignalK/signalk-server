# Weather Plugin Example

This example demonstrates a WASM plugin with **network capability** and **resource provider** support using the AssemblyScript SDK with Asyncify.

## Features

- HTTP requests via `as-fetch` with Asyncify
- Resource provider for weather data REST API
- Real API integration with OpenWeatherMap
- Signal K delta emission

## Signal K Paths

The plugin emits deltas for:

- `environment.outside.temperature` - Temperature in Kelvin
- `environment.outside.humidity` - Relative humidity (0-1)
- `environment.outside.pressure` - Pressure in Pascals
- `environment.wind.speedTrue` - Wind speed in m/s
- `environment.wind.directionTrue` - Wind direction in radians

## Resource Provider API

```bash
# List weather resources
curl http://localhost:3000/signalk/v2/api/resources/weather

# Get current weather
curl http://localhost:3000/signalk/v2/api/resources/weather/current
```

## Prerequisites

- Node.js 18+ (required for native fetch)
- OpenWeatherMap API key (free at https://openweathermap.org/api)
- Signal K Server 3.0+

## Building

```bash
cd examples/wasm-plugins/example-weather-plugin
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
   npm install /path/to/signalk-example-weather-plugin-0.2.0.tgz
   ```
3. Restart Signal K server
4. Enable and configure in Admin UI

## Configuration

Configure via the Signal K Admin UI under **Server → Plugin Config**. You must provide a valid OpenWeatherMap API key. Configuration options are documented in the plugin's schema.

## Key Implementation Details

### Asyncify Configuration

The `asconfig.json` must include the Asyncify transform:

```json
{
  "options": {
    "bindings": "esm",
    "exportRuntime": true,
    "transform": ["as-fetch/transform"]
  }
}
```

### Capability Declaration

The `package.json` declares required capabilities:

```json
{
  "wasmCapabilities": {
    "network": true,
    "resourceProvider": true
  }
}
```

## Debugging

```bash
DEBUG=signalk:wasm:* npm start
```

## See Also

- [AssemblyScript Plugin Guide](../../../docs/develop/plugins/wasm/assemblyscript.md) - Full documentation
- [WASM Developer Guide](../../../docs/develop/plugins/wasm/README.md)
- [as-fetch Library](https://github.com/nicoburniske/as-fetch)

## License

Apache-2.0
