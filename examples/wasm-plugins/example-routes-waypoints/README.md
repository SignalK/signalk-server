# Routes & Waypoints Resource Provider Plugin Example

This example demonstrates how to create a WASM plugin that provides **standard Signal K resource types** (routes and waypoints) via the Resource Provider API.

## What is a Resource Provider?

Signal K's Resource API provides generic CRUD operations for navigation data:

```
GET    /signalk/v2/api/resources/{type}           # List all
GET    /signalk/v2/api/resources/{type}/{id}      # Get one
POST   /signalk/v2/api/resources/{type}           # Create new
PUT    /signalk/v2/api/resources/{type}/{id}      # Update existing
DELETE /signalk/v2/api/resources/{type}/{id}      # Delete
```

Standard resource types include:

- `routes` - Navigation routes (GeoJSON LineString)
- `waypoints` - Navigation waypoints (GeoJSON Point)
- `notes` - Freeform notes
- `regions` - Geographic regions
- `charts` - Chart metadata

## Features

This plugin demonstrates:

- Registering as a resource provider for **multiple types** (routes AND waypoints)
- Implementing all 4 CRUD handlers
- GeoJSON-compliant data structures
- Signal K schema compliance
- In-memory storage with pre-populated sample data

## Sample Data

The plugin comes with sample Helsinki-area navigation data:

**Waypoints:**

- Helsinki Marina (60.1695°N, 24.9560°E)
- Suomenlinna Anchorage (60.1450°N, 24.9880°E)
- Fuel Dock (60.1680°N, 24.9620°E)

**Routes:**

- "Marina to Suomenlinna" - 3.5km route with 3 waypoints

## Building

```bash
cd examples/wasm-plugins/example-routes-waypoints
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
   npm install /path/to/signalk-example-routes-waypoints-0.1.0.tgz
   ```
3. Restart Signal K server
4. Enable the plugin in the Admin UI

## Configuration

No configuration required. The plugin automatically loads sample data on startup.

## Testing

Once enabled, test the Resource API:

```bash
# List all waypoints
curl http://localhost:3000/signalk/v2/api/resources/waypoints

# Get a specific waypoint
curl http://localhost:3000/signalk/v2/api/resources/waypoints/a1b2c3d4-0001-4000-8000-000000000001

# List all routes
curl http://localhost:3000/signalk/v2/api/resources/routes

# Get a specific route
curl http://localhost:3000/signalk/v2/api/resources/routes/b2c3d4e5-0001-4000-8000-000000000001

# Create a new waypoint
curl -X POST http://localhost:3000/signalk/v2/api/resources/waypoints \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Waypoint",
    "description": "Test waypoint",
    "type": "Waypoint",
    "feature": {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [25.0, 60.2]
      },
      "properties": {}
    }
  }'

# Delete a waypoint
curl -X DELETE http://localhost:3000/signalk/v2/api/resources/waypoints/a1b2c3d4-0001-4000-8000-000000000001
```

## Data Formats

### Waypoint (GeoJSON Point)

```json
{
  "name": "Helsinki Marina",
  "description": "Main marina in Helsinki harbor",
  "type": "Marina",
  "feature": {
    "type": "Feature",
    "geometry": {
      "type": "Point",
      "coordinates": [24.956, 60.1695]
    },
    "properties": {}
  }
}
```

### Route (GeoJSON LineString)

```json
{
  "name": "Marina to Suomenlinna",
  "description": "Short trip from Helsinki Marina to Suomenlinna anchorage",
  "distance": 3500,
  "feature": {
    "type": "Feature",
    "geometry": {
      "type": "LineString",
      "coordinates": [
        [24.956, 60.1695],
        [24.97, 60.16],
        [24.988, 60.145]
      ]
    },
    "properties": {
      "coordinatesMeta": [
        { "name": "Start - Marina" },
        { "name": "Channel marker" },
        { "name": "End - Anchorage" }
      ]
    }
  }
}
```

## Implementation Details

### Capability Declaration

In `package.json`:

```json
{
  "wasmManifest": "build/plugin.wasm",
  "wasmCapabilities": {
    "storage": "vfs-only",
    "dataRead": true,
    "dataWrite": true,
    "resourceProvider": true
  }
}
```

### Multiple Resource Type Registration

The plugin registers for BOTH resource types in `start()`:

```typescript
registerResourceProvider('routes')
registerResourceProvider('waypoints')
```

### Handler Exports

The plugin exports these functions for resource operations:

```typescript
// List resources (routes or waypoints based on resourceType in query)
export function resources_list_resources(queryJson: string): string

// Get single resource
export function resources_get_resource(requestJson: string): string

// Create/update resource
export function resources_set_resource(requestJson: string): string

// Delete resource
export function resources_delete_resource(requestJson: string): string
```

### Request Format

All handlers receive a JSON request with `resourceType` indicating which type is being accessed:

```json
{
  "resourceType": "waypoints",
  "id": "a1b2c3d4-0001-4000-8000-000000000001"
}
```

## See Also

- [example-weather-plugin](../example-weather-plugin/) - Resource Provider with custom type
- [example-weather-provider](../example-weather-provider/) - Weather Provider API example
- [WASM Developer Guide](../../../docs/develop/plugins/wasm/README.md)
- [Signal K Resources API](https://signalk.org/specification/1.7.0/doc/resources.html)
