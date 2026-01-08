---
title: Deltas
---

# Working with Signal K Deltas

WASM plugins can both **emit** and **receive** Signal K deltas. This page covers both directions.

## Emitting Deltas

Use the `emit()` function to send delta messages to the Signal K server:

```typescript
import {
  emit,
  createSimpleDelta,
  SK_VERSION_V1,
  SK_VERSION_V2
} from '@signalk/assemblyscript-plugin-sdk/assembly'

// Emit a v1 delta (default - for regular navigation data)
const tempDelta = createSimpleDelta('environment.outside.temperature', '288.15')
emit(tempDelta)

// Emit a v2 delta (for Course API and v2-specific paths)
const courseDelta = createSimpleDelta(
  'navigation.course.nextPoint',
  positionJson
)
emit(courseDelta, SK_VERSION_V2)
```

**Note:** Plugins should NOT include `source` or `timestamp` in emitted deltas. The server automatically:

- Sets `$source` to the plugin ID
- Fills in `timestamp` with the current time

### Signal K v1 vs v2 Deltas

The `emit()` function accepts an optional second parameter to specify the Signal K version:

| Version      | Constant        | Use Case                                                                                   |
| ------------ | --------------- | ------------------------------------------------------------------------------------------ |
| v1 (default) | `SK_VERSION_V1` | Regular navigation data: `navigation.*`, `environment.*`, `electrical.*`, etc.             |
| v2           | `SK_VERSION_V2` | Course API paths and v2-specific data that should not be mixed into the v1 full data model |

**Why does this matter?**

- **v1 deltas** update the full Signal K data model and are available via the REST API and WebSocket subscriptions
- **v2 deltas** are emitted as events for v2 API subscribers without mixing into the v1 data model

Most plugins should use v1 (the default). Only use v2 when emitting Course API data or other v2-specific paths.

This mirrors the TypeScript plugin API where `handleMessage()` accepts an optional `skVersion` parameter.

---

## Receiving Deltas

WASM plugins can subscribe to receive Signal K deltas, enabling them to react to navigation data changes, course updates, sensor readings, and other vessel data in real-time.

## Implementing a Delta Handler

Export a `delta_handler()` function to receive deltas:

```typescript
// assembly/index.ts

// Plugin state
let vesselLat: f64 = 0.0
let vesselLon: f64 = 0.0
let hasPosition: bool = false

export function delta_handler(deltaJson: string): void {
  // Check for position updates
  if (deltaJson.indexOf('"path":"navigation.position"') >= 0) {
    const lat = parseFloat64FromJson(deltaJson, 'latitude')
    const lon = parseFloat64FromJson(deltaJson, 'longitude')

    if (lat !== 0.0 || lon !== 0.0) {
      vesselLat = lat
      vesselLon = lon
      hasPosition = true
      debug('Position updated: ' + lat.toString() + ', ' + lon.toString())
    }
  }

  // Check for course nextPoint
  if (deltaJson.indexOf('"path":"navigation.course.nextPoint"') >= 0) {
    // Extract destination coordinates and perform calculations
    // ...
  }

  // Check for speedOverGround
  if (deltaJson.indexOf('"navigation.speedOverGround"') >= 0) {
    const speed = parseFloat64FromJson(deltaJson, 'value')
    // Process speed data
  }
}

// Helper function to parse float from JSON
function parseFloat64FromJson(json: string, key: string): f64 {
  const searchKey = '"' + key + '":'
  const match = json.indexOf(searchKey)
  if (match < 0) return 0.0

  let start = match + searchKey.length
  while (
    start < json.length &&
    (json.charCodeAt(start) == 32 || json.charCodeAt(start) == 9)
  ) {
    start++
  }

  let end = start
  while (end < json.length) {
    const c = json.charCodeAt(end)
    if (c == 44 || c == 125 || c == 93) break // comma, }, ]
    end++
  }

  const numStr = json.substring(start, end).trim()
  return parseFloat(numStr)
}
```

## Received Delta JSON Format

Deltas received by `delta_handler()` include `$source` and `timestamp` (added by the server):

```json
{
  "context": "vessels.self",
  "updates": [
    {
      "$source": "n2k-on-ve.can-socket.43",
      "timestamp": "2024-01-15T12:30:00.000Z",
      "values": [
        {
          "path": "navigation.position",
          "value": { "latitude": -17.68, "longitude": 177.39 }
        },
        { "path": "navigation.speedOverGround", "value": 5.2 }
      ]
    }
  ]
}
```

## Common Use Cases

1. **Course Calculations** - React to `navigation.course.nextPoint` and `navigation.position` to calculate bearing, distance, XTE
2. **Anchor Watch** - Monitor `navigation.position` and compare to anchor position
3. **Speed Alerts** - Watch `navigation.speedOverGround` for threshold breaches
4. **Environment Monitoring** - Track `environment.wind.*`, `environment.water.temperature`, etc.

## Detecting Cleared Values

When values are cleared (e.g., destination removed), the server sends `null` values:

```typescript
export function delta_handler(deltaJson: string): void {
  if (deltaJson.indexOf('"path":"navigation.course.nextPoint"') >= 0) {
    // Try to extract position first
    const lat = parseFloat64FromJson(deltaJson, 'latitude')
    const lon = parseFloat64FromJson(deltaJson, 'longitude')

    if (lat !== 0.0 || lon !== 0.0) {
      // Valid position - update state
      nextPointLat = lat
      nextPointLon = lon
      hasDestination = true
    } else {
      // Check if this is a null/clear operation
      const pathIdx = deltaJson.indexOf('"path":"navigation.course.nextPoint"')
      const checkRange = deltaJson.substring(
        pathIdx,
        Math.min(pathIdx + 100, deltaJson.length) as i32
      )
      if (checkRange.indexOf('"value":null') >= 0) {
        hasDestination = false
        debug('Destination cleared')
      }
    }
  }
}
```

## Performance Considerations

- **Filter Early** - Check for relevant paths before parsing to minimize processing
- **State Caching** - Store parsed values in global variables rather than re-parsing
- **Debouncing** - High-frequency data (GPS at 10Hz) may benefit from debouncing calculations
