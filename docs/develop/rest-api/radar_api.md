---
title: Radar API
---

# Radar API

The Signal K server Radar API provides a unified interface for viewing and controlling marine radar equipment from any manufacturer. The API is **(web)app-friendly**: clients can build dynamic UIs that automatically adapt to any radar's capabilities without hardcoding support for specific brands or models.

Radar functionality is provided by "provider plugins" that handle the interaction with radar hardware and stream spoke data to connected clients. 

Requests to the Radar API are made to HTTP REST endpoints rooted at `/signalk/v2/api/vessels/self/radars` or the Signal K websocket stream at `/signalk/v1/api/stream` 

## Design Philosophy: Capabilities-Driven API

This API uses a **self-describing schema** pattern that benefits both radar provider developers and client/chartplotter developers.

### For Client/Chartplotter Developers

Build a **single, adaptive UI** that works with any radar—now and in the future—without hardcoding brand-specific logic.

**How it works:**

1. **Fetch capabilities once** when a radar connects — this tells you what the radar can do
2. **Generate UI widgets from the schema:**
   - `dataType: "number"` → Slider with min/max/step
   - `dataType: "enum"` with `descriptions` → Dropdown or button group
   - `dataType: "string"` → Text input field
   - `dataType: "button"` → Action button
   - `dataType: "sector"` → Angle range selector (start/end angles)
   - `dataType: "zone"` → Guard zone editor (angles + distances)
   - `isReadOnly: true` → Display-only label
3. **Subscribe to updates for current values** — the schema tells you what to expect
4. **Connect to websocket for spoke data** - receive the binary spoke data stream


**Example: Rendering a Gain Control**

```shell
$ curl -s http://10.56.0.1:6502/signalk/v2/api/vessels/self/radars/nav1034A/capabilities | jq '.controls.gain'
{
  "category": "base",
  "dataType": "number",
  "description": "How sensitive the radar is to returning echoes",
  "hasAuto": true,
  "hasAutoAdjustable": false,
  "id": 4,
  "maxValue": 100.0,
  "minValue": 0.0,
  "name": "Gain",
  "stepValue": 1.0
}
$ curl -s http://10.56.0.1:6502/signalk/v2/api/vessels/self/radars/nav1034A/controls/gain
{"auto":false,"value":58}
```

Your UI renders:
  - Mode toggle: `[Auto] [Manual]`
  - Value slider: `0 ----[58]---- 100` (disabled or hidden when mode=auto)

Whether it's a Furuno DRS4D-NXT with 20, a Navico HALO with 40 controls or a basic radar with 5 controls, the same client code handles both.

### For Radar Provider Developers (Plugin Authors)

Different manufacturers have vastly different hardware capabilities, control sets, value ranges, and operating modes. Instead of clients hardcoding knowledge about each model, your provider plugin **declares** what the radar can do:

1. **Capabilities** — hardware capabilities (Doppler, dual-range, no-transmit zones, supported ranges)
2. **Controls** — schema for each control (type, valid values, modes, read-only status)

## Control Categories

| Category       | Description                  | Examples                                                      |
| -------------- | ---------------------------- | ------------------------------------------------------------- |
| `base`         | Available on all radars      | power, range, gain, sea, rain                                 |
| `targets`      | Target tracking settings     | targetExpansion, targetTrails                                 |
| `guardZones`   | Guard zone configuration     | guardZone1, guardZone2                                        |
| `trails`       | Trail display settings       | trailsTime, clearTrails                                       |
| `advanced`     | Model-specific features      | dopplerMode, beamSharpening, interferenceRejection            |
| `installation` | Setup/configuration settings | antennaHeight, bearingAlignment, noTransmitSector1            |
| `info`         | Read-only information        | serialNumber, firmwareVersion, transmitTime                   |

Read-only information (serialNumber, firmwareVersion, operatingHours) is exposed as controls with `isReadOnly: true`. Some controls are __dynamically__ read-only when a particular mode is set. This is handled with an optional `allowed: <bool>` field in the control value.

Some further considerations as how to show controls:
- Within each category, all controls have a numeric `id` field which may be used for ordering.
- The `advanced` and especially the `installation` categories could be shown in a different panel.
- In particular the `installation` controls are typically configured once.
- The `power` and `range` controls are used often and should be easy to be controlled.
- The `gain`, `sea` and `rain` controls are usually represented graphically on a PPI window.

## API Overview

```
/signalk/v2/api/vessels/self/radars
├── GET                              → List all active radars
├── /interfaces
│   └── GET                          → List network interfaces and listener status
├── /stream                          → WebSocket (control values and targets for all radars)
└── /{radar_id}
    ├── /capabilities GET            → Get radar capabilities and control definitions
    ├── /controls
    │   ├── GET                      → Get all control values
    │   └── /{control_id}
    │       ├── GET                  → Get single control value
    │       └── PUT                  → Set single control value
    └── /spokes                      → WebSocket (spoke data in binary format)
```

## Radar Information

### Listing All Radars

Retrieve all available radars with their current info:

```typescript
HTTP GET "/signalk/v2/api/vessels/self/radars"
```

_Response:_

```json
{
  "version": "3.0.0",
  "radars": {
    "nav1034A": {
      "brand": "Navico",
      "model": "HALO",
      "name": "HALO 034A",
      "radarIpAddress": "192.168.1.50",
      "spokeDataUrl": "ws://192.168.1.100:8080/signalk/v2/api/vessels/self/radars/nav1034A/spokes",
      "streamUrl": "ws://192.168.1.100:8080/signalk/v1/stream"
    },
    "nav1034B": {
      "brand": "Navico",
      "model": "HALO",
      "name": "HALO 034B",
      "radarIpAddress": "192.168.1.50",
      "spokeDataUrl": "ws://192.168.1.100:8080/signalk/v2/api/vessels/self/radars/nav1034B/spokes",
      "streamUrl": "ws://192.168.1.100:8080/signalk/v1/stream"
    }
  }
}
```

### Network Interfaces

Check which network interfaces are available and which radar brands are listening:

```typescript
HTTP GET "/signalk/v2/api/vessels/self/radars/interfaces"
```

_Response:_

```json
{
  "radars": {
    "interfaces": {
      "brands": ["Navico", "Furuno", "Raymarine"],
      "interfaces": {
        "en0": {
          "status": "Ok",
          "ip": "192.168.1.100",
          "netmask": "255.255.255.0",
          "listeners": {
            "Navico": "Active",
            "Furuno": "No match for 172.31.255.255",
            "Raymarine": "Listening"
          }
        },
        "en1": {
          "status": "WirelessIgnored"
        }
      }
    }
  }
}
```

This endpoint is useful for diagnosing network configuration issues when radars are not being detected.

### Getting Radar Capabilities

The capability manifest describes everything a radar can do. Clients should fetch this at the beginning of a session. The contents do not change during radar operation.

```typescript
HTTP GET "/signalk/v2/api/vessels/self/radars/{radar_id}/capabilities"
```

_Response:_

```json
{
  "maxRange": 74080,
  "minRange": 50,
  "supportedRanges": [50, 75, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000, 12000, 16000, 24000, 36000, 48000, 64000, 74080],
  "spokesPerRevolution": 2048,
  "maxSpokeLength": 1024,
  "pixelValues": 16,
  "hasDoppler": true,
  "hasDualRadar": false,
  "hasDualRange": true,
  "noTransmitSectors": 2,
  "controls": {
    "gain": {
      "id": 4,
      "name": "Gain",
      "description": "How sensitive the radar is to returning echoes",
      "category": "base",
      "dataType": "number",
      "minValue": 0.0,
      "maxValue": 100.0,
      "stepValue": 1.0,
      "hasAuto": true,
      "hasAutoAdjustable": false
    }
  },
  "legend": {
    "lowReturn": 1,
    "mediumReturn": 8,
    "strongReturn": 13,
    "targetBorder": 17,
    "dopplerApproaching": 18,
    "dopplerReceding": 19,
    "historyStart": 20,
    "pixelColors": 16,
    "pixels": [
      {"type": "normal", "color": {"r": 0, "g": 0, "b": 0, "a": 0}},
      {"type": "normal", "color": {"r": 0, "g": 0, "b": 51, "a": 255}}
    ]
  }
}
```

Capability fields:

1. `hasDoppler` - if true, the radar can detect boats or objects approaching or receding and emits separate pixel colors for these.
2. `hasDualRadar` - if true, the physical radome reports itself as two independent radars that can be set to different ranges and modes. Currently only Navico 4G and HALO support this.
3. `hasDualRange` - mutually exclusive with `hasDualRadar`, indicates a more limited form of supporting two ranges with one device.
4. `minRange` and `maxRange` - define what ranges the radar supports (in meters).
5. `supportedRanges` - list of all discrete range values the radar supports (in meters).
6. `maxSpokeLength` and `spokesPerRevolution` - define how many pixels the radar produces each revolution.
7. `noTransmitSectors` - how many sectors the radar can stop transmitting to avoid obstacles like masts.
8. `pixelValues` - number of distinct pixel intensity values.

### Legend

All spokes are sent with one byte per pixel. The legend explains what each byte value represents.

```json
{
  "lowReturn": 1,
  "mediumReturn": 8,
  "strongReturn": 13,
  "targetBorder": 17,
  "dopplerApproaching": 18,
  "dopplerReceding": 19,
  "historyStart": 20,
  "pixelColors": 16,
  "pixels": [
    {"type": "normal", "color": {"r": 0, "g": 0, "b": 0, "a": 0}},
    {"type": "normal", "color": {"r": 0, "g": 0, "b": 255, "a": 255}},
    {"type": "targetBorder", "color": {"r": 200, "g": 200, "b": 200, "a": 255}},
    {"type": "dopplerApproaching", "color": {"r": 255, "g": 0, "b": 0, "a": 255}},
    {"type": "dopplerReceding", "color": {"r": 0, "g": 255, "b": 0, "a": 255}},
    {"type": "history", "color": {"r": 69, "g": 69, "b": 69, "a": 255}}
  ]
}
```

The `lowReturn`, `mediumReturn`, and `strongReturn` indicate offsets in the array, typically used for smoothing algorithms.

If the radar doesn't implement Doppler, the `dopplerApproaching` and `dopplerReceding` fields will be null. If the provider doesn't implement target trails, `historyStart` will be null.

### Controls

The `controls` object in capabilities lists all controls the radar supports. Control data types:

| dataType | Description                              |
| -------- | ---------------------------------------- |
| number   | Numeric value with min/max/step          |
| enum     | Discrete set of values with descriptions |
| string   | Text value                               |
| button   | Action trigger (no value)                |
| sector   | Angle range (start/end)                  |
| zone     | Guard zone (angles + distances)          |

1. **number**

```json
{
  "id": 47,
  "name": "Transmit time",
  "description": "How long the radar has been transmitting over its lifetime",
  "category": "info",
  "dataType": "number",
  "isReadOnly": true,
  "minValue": 0.0,
  "maxValue": 3599996400.0,
  "stepValue": 3600.0,
  "units": "Seconds"
}
```

The following `units` values are supported:

- `Meters`, `KiloMeters`, `NauticalMiles` - distance
- `MetersPerSecond`, `Knots` - speed
- `Degrees`, `Radians` - angle
- `RadiansPerSecond`, `RotationsPerMinute` - rotational speed
- `Seconds`, `Minutes`, `Hours` - duration

2. **enum**

```json
{
  "id": 0,
  "name": "Power",
  "description": "Radar operational state",
  "category": "base",
  "dataType": "enum",
  "minValue": 0.0,
  "maxValue": 3.0,
  "stepValue": 1.0,
  "descriptions": {
    "0": "Off",
    "1": "Standby",
    "2": "Transmit",
    "3": "Preparing"
  },
  "validValues": [1, 2]
}
```

The `validValues` array indicates which values can be set by clients. The `power` control guarantees these values across all radars: 1=Standby, 2=Transmit.

3. **string**

```json
{
  "id": 53,
  "name": "Custom name",
  "description": "User defined name for the radar",
  "category": "advanced",
  "dataType": "string"
}
```

4. **button**

A button triggers an action without needing a value:

```json
{
  "id": 15,
  "name": "Clear trails",
  "description": "Clear target trails",
  "category": "trails",
  "dataType": "button"
}
```

5. **sector**

```json
{
  "id": 35,
  "name": "No Transmit sector",
  "description": "First no-transmit sector",
  "category": "installation",
  "dataType": "sector",
  "hasEnabled": true,
  "minValue": -3.141592653589793,
  "maxValue": 3.141592653589793,
  "stepValue": 0.0017453292519943296,
  "units": "Radians"
}
```

A sector defines a start and end angle from -π to +π radians, plus an enabled flag. The value for start is transmitted in `value` and the end in `endValue`.

```shell
$ curl -s http://localhost:6502/signalk/v2/api/vessels/self/radars/nav1034A/controls/noTransmitSector1
{"enabled":true,"value":-1.5533,"endValue":-1.2217}
```

6. **zone**

```json
{
  "id": 16,
  "name": "Guard zone",
  "description": "First guard zone for target detection",
  "category": "guardZones",
  "dataType": "zone",
  "hasEnabled": true,
  "minValue": -3.141592653589793,
  "maxValue": 3.141592653589793,
  "maxDistance": 100000.0,
  "units": "Radians"
}
```

A zone defines five attributes: start angle, end angle, start distance, end distance, and enabled.

```shell
$ curl -s http://localhost:6502/signalk/v2/api/vessels/self/radars/nav1034A/controls/guardZone1
{"enabled":true,"value":-0.5585,"endValue":1.7104,"startDistance":100.0,"endDistance":232.0}
```

## Radar Control

Controlling the radar can be done via HTTP REST requests or via the stream websocket.

### Getting All Control Values

```typescript
HTTP GET "/signalk/v2/api/vessels/self/radars/{radar_id}/controls"
```

_Response:_

```json
{
  "version": "3.0.0",
  "radars": {
    "nav1034A": {
      "controls": {
        "gain": {"auto": false, "value": 50},
        "sea": {"auto": true, "autoValue": 25, "value": 30},
        "range": {"value": 3000}
      }
    }
  }
}
```

### Getting a Single Control Value

```typescript
HTTP GET "/signalk/v2/api/vessels/self/radars/{radar_id}/controls/{control_id}"
```

_Response:_

```json
{"auto": false, "value": 50}
```

### Setting a Control Value

```typescript
HTTP PUT "/signalk/v2/api/vessels/self/radars/{radar_id}/controls/{control_id}"
```

**Simple numeric control:**

```json
{"value": 75}
```

**Control with auto mode:**

```json
{"auto": false, "value": 75}
```

or just change auto mode:

```json
{"auto": true}
```

**Control with auto adjustment (e.g., Sea on HALO):**

When in auto mode, some controls accept an adjustment value:

```json
{"auto": true, "autoValue": -20}
```

**Sector control:**

```json
{"enabled": true, "value": -1.5533, "endValue": -1.2217}
```

**Zone control:**

```json
{
  "enabled": true,
  "value": -0.5585,
  "endValue": 1.7104,
  "startDistance": 100.0,
  "endDistance": 500.0
}
```

**Button control:**

For buttons, send an empty body or `{}` - the PUT request itself triggers the action.

### Control Value Fields

| Field           | Description                                              |
| --------------- | -------------------------------------------------------- |
| `value`         | The control value (numeric or string)                    |
| `auto`          | Whether automatic mode is enabled                        |
| `autoValue`     | Adjustment when auto=true (for controls that support it) |
| `enabled`       | Whether the control is enabled (sectors, zones)          |
| `endValue`      | End angle for sectors and zones (radians)                |
| `startDistance` | Inner radius for zones (meters)                          |
| `endDistance`   | Outer radius for zones (meters)                          |

## Streaming (WebSocket)

There are two types of websocket:

1. Signal K formatted JSON data about radars and commands to it.
2. High volume radar spoke data in binary format (up to 1 MB/s).

### Control Stream

The JSON data websocket provides real-time control value updates for all radars via the standard Signal K stream.

The URI is found in the radar response as `streamUrl` or can be constructed as:

```
ws://{host}:{port}/signalk/v1/stream
```

This websocket endpoint works identical to a Signal K stream, as documented in
https://signalk.org/specification/1.5.0/doc/streaming_api.html 

In short:
- By default you are described to all paths
- Query parameters `subscribe=none` can be used to start without any subscriptions and `sendCachedValues=false` to disable sending all currently cached values.
- Subscriptions and desubscriptions can be made for paths. You can use '*' for all radars
  including radars still to be discovered.
- When first connected all radar meta data will be sent, as when already connected and a radar
  is discovered.

The recommended way of connecting is to either send `subscribe=none` and then a subscribe to all controls, as in the example below, with a policy of `instant`. The number of updates after the 
initial cache dump is low, about 2 messages per second.

```json
"subscribe": [
            {
              "path": "radars.*.controls.*",
              "period": 1000
            },
          ]
```

Example of received meta-data:

```json
{
  "updates": [
    {
      "$source": "mayara",
      "timestamp": "2026-02-23T18:15:26.409454084Z",
      "meta": [
        {
          "path": "radars.nav1034A.controls.guardZone1",
          "value": {
            "id": 13,
            "name": "Guard zone",
            "description": "First guard zone for target detection",
            "category": "guardZones",
            "dataType": "zone",
            "hasEnabled": true,
            "minValue": -3.141592653589793,
            "maxValue": 3.141592653589793,
            "units": "rad",
            "maxDistance": 100000.0
          }
        },
        {
          "path": "radars.nav1034A.controls.firmwareVersion",
          "value": {
            "id": 48,
            "name": "Firmware version",
            "description": "Version of the radar firmware",
            "category": "info",
            "dataType": "string",
            "isReadOnly": true
          }
        }
      ]
    }
  ]
}
```

Example of received data:

```json
{"updates":[{"$source":"mayara","values":[{"path":"radars.nav1034A.controls.spokes","value":{"value":2048}}]}]}
```

Example of setting a control:

```json
{ "path": "radars.nav1034A.controls.guardZone1",
  "value": {
    "value":0.735,
    "endValue": 3.1415,
    "startDistance": 0,
    "endDistance": 500,
    "enabled": true
  }
}
```

### Spoke Data Stream

Radar spoke data is streamed via WebSocket as binary frames. The URL is found in the `radars` REST response as `spokeDataUrl` or can be constructed as:

```
/signalk/v2/api/vessels/self/radars/{radar_id}/spokes
```

### Connection Logic

```javascript
// Fetch radars
const response = await fetch('/signalk/v2/api/vessels/self/radars/')
const data = await response.json()

// Choose a radar_id from the returned radars
const radarId = Object.keys(data.radars)[0]
const radar = data.radars[radarId]

// Connect to spoke data stream
const wsUrl = radar.spokeDataUrl ??
  `ws://${location.host}/signalk/v2/api/vessels/self/radars/${radarId}/spokes`

const socket = new WebSocket(wsUrl)
socket.binaryType = 'arraybuffer'

socket.onmessage = (event) => {
  const spokeData = new Uint8Array(event.data)
  // Process binary spoke data...
}
```

## ARPA Target Tracking

The Radar API defines ARPA (Automatic Radar Plotting Aid) target tracking with CPA/TCPA calculations and SignalK notification integration.

At the moment this is not fully supported but the API is defined.

### Listing Tracked Targets

```typescript
HTTP GET "/signalk/v2/api/vessels/self/radars/{id}/targets"
```

_Response:_

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "targets": [
    {
      "id": 1,
      "status": "tracking",
      "position": {
        "bearing": 45.2,
        "distance": 1852,
        "latitude": 52.3702,
        "longitude": 4.8952
      },
      "motion": {
        "course": 180.0,
        "speed": 6.5
      },
      "danger": {
        "cpa": 150,
        "tcpa": 324
      },
      "acquisition": "auto",
      "firstSeen": "2025-01-15T10:25:00Z",
      "lastSeen": "2025-01-15T10:30:00Z"
    }
  ]
}
```

### Manual Target Acquisition

```typescript
HTTP POST "/signalk/v2/api/vessels/self/radars/{id}/targets"
```

_Request body:_

```json
{
  "bearing": 45.0,
  "distance": 2000
}
```

### Cancel Target Tracking

```typescript
HTTP DELETE "/signalk/v2/api/vessels/self/radars/{id}/targets/{targetId}"
```

## TypeScript Interfaces

### RadarsResponse

```typescript
interface RadarsResponse {
  version: string
  radars: Record<string, RadarInfo>
}

interface RadarInfo {
  name: string
  brand: string
  model?: string
  radarIpAddress: string
  spokeDataUrl: string
  streamUrl: string
}
```

### Capabilities

```typescript
interface Capabilities {
  maxRange: number
  minRange: number
  supportedRanges: number[]
  spokesPerRevolution: number
  maxSpokeLength: number
  pixelValues: number
  hasDoppler: boolean
  hasDualRadar: boolean
  hasDualRange: boolean
  noTransmitSectors: number
  controls: Record<string, ControlDefinition>
  legend: Legend
}
```

### ControlDefinition

```typescript
interface ControlDefinition {
  id: number
  name: string
  description: string
  category: 'base' | 'targets' | 'guardZones' | 'trails' | 'advanced' | 'installation' | 'info'
  dataType: 'number' | 'enum' | 'string' | 'button' | 'sector' | 'zone'
  isReadOnly?: boolean
  hasEnabled?: boolean
  minValue?: number
  maxValue?: number
  stepValue?: number
  maxDistance?: number
  units?: 'Meters' | 'KiloMeters' | 'NauticalMiles' | 'MetersPerSecond' | 'Knots' | 'Degrees' | 'Radians' | 'RadiansPerSecond' | 'RotationsPerMinute' | 'Seconds' | 'Minutes' | 'Hours'
  descriptions?: Record<string, string>  // For enum types
  validValues?: number[]  // For enum types
  hasAuto?: boolean
  hasAutoAdjustable?: boolean
  autoAdjustMinValue?: number
  autoAdjustMaxValue?: number
}
```

### ControlValue

```typescript
interface ControlValue {
  value?: number | string
  auto?: boolean
  autoValue?: number
  enabled?: boolean
  endValue?: number
  startDistance?: number
  endDistance?: number
}
```

### Legend

```typescript
interface Legend {
  lowReturn: number
  mediumReturn: number
  strongReturn: number
  targetBorder: number
  dopplerApproaching?: number
  dopplerReceding?: number
  historyStart: number
  pixelColors: number
  pixels: LegendPixel[]
}

interface LegendPixel {
  type: 'normal' | 'targetBorder' | 'dopplerApproaching' | 'dopplerReceding' | 'history'
  color: { r: number; g: number; b: number; a: number }
}
```

### Target

```typescript
interface Target {
  id: number
  status: 'tracking' | 'lost' | 'acquiring'
  position: {
    bearing: number
    distance: number
    latitude?: number
    longitude?: number
  }
  motion: {
    course: number
    speed: number
  }
  danger: {
    cpa: number
    tcpa: number
  }
  acquisition: 'manual' | 'auto'
  firstSeen: string
  lastSeen: string
}
```
