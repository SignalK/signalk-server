---
title: Radar API
---

# Radar API

The Signal K server Radar API provides a unified interface for viewing and controlling marine radar equipment from any manufacturer. The API is **(web)app-friendly**: clients can build dynamic UIs that automatically adapt to any radar's capabilities without hardcoding support for specific brands or models.

Radar functionality is provided by "provider plugins" that handle the interaction with radar hardware and stream spoke data to connected clients.

Requests to the Radar API are made to HTTP REST endpoints rooted at `/signalk/v2/api/vessels/self/radars` or the Signal K websocket stream at `/signalk/v1/api/stream`.

Like `signalk-server` vis-a-vis the Signal K specification there is a reference implementation
for this API, which may very well remain the only implementation of the server side of the API, 
at https://github.com/MarineYachtRadar/mayara-server. However, like Signal K itself, there is no
reason it needs to remain the only implementation. In particular it would be ultra cool if some
manufacturer of marine hardware would implement this API -- even though this is very unlikely.

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
   - `dataType: "rect"` → Rectangular exclusion zone (two corners + width)
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

| Category       | Description                  | Examples                                           |
| -------------- | ---------------------------- | -------------------------------------------------- |
| `base`         | Available on all radars      | power, range, gain, sea, rain                      |
| `targets`      | Target tracking settings     | targetExpansion, targetTrails                      |
| `guardZones`   | Guard zone configuration     | guardZone1, guardZone2                             |
| `trails`       | Trail display settings       | trailsTime, clearTrails                            |
| `advanced`     | Model-specific features      | dopplerMode, beamSharpening, interferenceRejection |
| `installation` | Setup/configuration settings | antennaHeight, bearingAlignment, noTransmitSector1 |
| `info`         | Read-only information        | serialNumber, firmwareVersion, transmitTime        |

Read-only information (serialNumber, firmwareVersion, operatingHours) is exposed as controls with `isReadOnly: true`. Some controls are **dynamically** read-only when a particular mode is set. This is handled with an optional `allowed: <bool>` field in the control value.

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

## REST API

### Listing All Radars

Retrieve all available radars with their current info:

```
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

```
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

```
HTTP GET "/signalk/v2/api/vessels/self/radars/{radar_id}/capabilities"
```

_Response:_

```json
{
  "maxRange": 74080,
  "minRange": 50,
  "supportedRanges": [
    50, 75, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000, 12000,
    16000, 24000, 36000, 48000, 64000, 74080
  ],
  "spokesPerRevolution": 2048,
  "maxSpokeLength": 1024,
  "pixelValues": 16,
  "hasDoppler": true,
  "hasDualRadar": false,
  "hasDualRange": true,
  "hasSparseSpokes": false,
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
      { "type": "normal", "color": { "r": 0, "g": 0, "b": 0, "a": 0 } },
      { "type": "normal", "color": { "r": 0, "g": 0, "b": 51, "a": 255 } }
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
9. `hasSparseSpokes` - if true, the radar produces fewer spokes per revolution than `spokesPerRevolution` indicates (see [Spoke skipping](#spoke-skipping)).

### Legend

All spokes are sent with one byte per pixel. The legend explains what each byte value represents.

```json
{
  "lowReturn": 1,
  "mediumReturn": 8,
  "strongReturn": 13,
  "dopplerApproaching": 18,
  "dopplerReceding": 19,
  "historyStart": 20,
  "pixelColors": 16,
  "pixels": [
    { "type": "normal", "color": "#00000000" },
    { "type": "normal", "color": "#0000ffff" },
    { "type": "dopplerApproaching", "color": "#ff00ffff" },
    { "type": "dopplerReceding", "color": "#00ff00ff" },
    { "type": "history", "color": "#454545ff" }
  ]
}
```

The `lowReturn`, `mediumReturn`, and `strongReturn` indicate offsets in the array, typically used for smoothing algorithms.

If the radar doesn't implement Doppler, the `dopplerApproaching` and `dopplerReceding` fields will be null. If the provider doesn't implement target trails, `historyStart` will be null.

### Dual range/radar

There are two different ways that radars handle "dual" ranges. 

Navico radars implement this by acting
as if both radars are full independent, to the point where both radars use different ports and IP addresses.
They can be seen to be dependent in that if you change some controls they also change on the other radar. 
The NoTransmitZones are examples of such controls.
These radars therefore also show up as two radars in the API. 
As long as clients listen to updates to controls, which they should do anyway to be able to function in a setting where there is for instance a MFD device, they can assume that all controls can be set.


Furuno radars do this in a way where the second range shares as many control settings as possible.
At this time `mayara-server` does not yet support this mode. Once it does, a future version of this API
may be released if it has API consequences. 


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
| rect     | Rectangular exclusion zone               |

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
  "units": "s"
}
```

The `units` field indicates the unit of measurement for the control value. A conforming server implementation sends only SI units to clients:

| Category         | SI Unit            | Abbreviation |
| ---------------- | ------------------ | ------------ |
| Distance         | Meters             | `m`          |
| Speed            | Meters per second  | `m/s`        |
| Angle            | Radians            | `rad`        |
| Rotational speed | Radians per second | `rad/s`      |
| Duration         | Seconds            | `s`          |

Note how in the above example the server has converted a value in hours (3600 seconds) to seconds to conform to the above, but the client can convert the value back to hours for representation to
a human.

A conforming API server will allow the following units to be specified when receiving values from
a client:

| Category         | Unit               | Abbreviation |
| ---------------- | ------------------ | ------------ |
| Distance         | Meters             | `m`          |
| Distance         | Kilometers         | `km`         |
| Distance         | Nautical miles     | `nm`         |
| Speed            | Meters per second  | `m/s`        |
| Speed            | Knots              | `kn`         |
| Angle            | Radians            | `rad`        |
| Angle            | Degrees            | `deg`        |
| Rotational speed | Radians per second | `rad/s`      |
| Rotational speed | Rotations/minute   | `rpm`        |
| Duration         | Seconds            | `s`          |
| Duration         | Minutes            | `min`        |
| Duration         | Hours              | `h`          |

1. **enum**

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

The `validValues` array indicates which values can be set by clients. The `power` control guarantees that at least these values can be set across all radars: 1 (Standby) and 2 (Transmit).

1. **string**

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
  "units": "rad"
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
  "units": "rad"
}
```

A zone defines five attributes: start angle, end angle, start distance, end distance, and enabled.

```shell
$ curl -s http://localhost:6502/signalk/v2/api/vessels/self/radars/nav1034A/controls/guardZone1
{"enabled":true,"value":-0.5585,"endValue":1.7104,"startDistance":100.0,"endDistance":232.0}
```

7. **rect**

```json
{
  "id": 60,
  "name": "Exclusion zone",
  "description": "Rectangular exclusion zone",
  "category": "guardZones",
  "dataType": "rect",
  "hasEnabled": true,
  "maxValue": 100000.0
}
```

A rect defines a rectangular zone using two corners and a perpendicular width. The corners (x1, y1) and (x2, y2) define one edge of the rectangle in meters relative to the radar position (positive X is starboard, positive Y is ahead). The width extends perpendicular to this edge.

```shell
$ curl -s http://localhost:6502/signalk/v2/api/vessels/self/radars/nav1034A/controls/exclusionZone1
{"enabled":true,"x1":-50.0,"y1":100.0,"x2":50.0,"y2":100.0,"width":200.0}
```

## Radar Control

Controlling the radar can be done via HTTP REST requests or via the stream websocket.

### Getting All Control Values

```
HTTP GET "/signalk/v2/api/vessels/self/radars/{radar_id}/controls"
```

_Response:_

```json
{
  "version": "3.0.0",
  "radars": {
    "nav1034A": {
      "controls": {
        "gain": { "auto": false, "value": 50 },
        "sea": { "auto": true, "autoValue": 25, "value": 30 },
        "range": { "value": 3000 }
      }
    }
  }
}
```

### Getting a Single Control Value

```
HTTP GET "/signalk/v2/api/vessels/self/radars/{radar_id}/controls/{control_id}"
```

_Response:_

```json
{ "auto": false, "value": 50 }
```

### Setting a Control Value

```
HTTP PUT "/signalk/v2/api/vessels/self/radars/{radar_id}/controls/{control_id}"
```

**Simple numeric control:**

```json
{ "value": 75 }
```

**Control with auto mode:**

```json
{ "auto": false, "value": 75 }
```

or just change auto mode:

```json
{ "auto": true }
```

**Control with auto adjustment (e.g., Sea on HALO):**

When in auto mode, some controls accept an adjustment value:

```json
{ "auto": true, "autoValue": -20 }
```

**Sector control:**

```json
{ "enabled": true, "value": -1.5533, "endValue": -1.2217 }
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

Control values contain different fields depending on the control's `dataType` (defined in the capability schema).

**Common fields**:

| Field       | Description                                                       |
| ----------- | ----------------------------------------------------------------- |
| `value`     | The control value (numeric or string) (if dataType is not `rect`) |
| `auto`      | Whether automatic mode is enabled (if `hasAuto` is true)          |
| `autoValue` | Adjustment when auto=true (if `hasAutoAdjustable` is true)        |
| `timestamp` | ISO 8601 timestamp when value was last changed                    |

**dataType-specific fields**:

| Field           | dataType           | Description                           |
| --------------- | ------------------ | ------------------------------------- |
| `enabled`       | sector, zone, rect | Whether the control is enabled        |
| `endValue`      | sector, zone       | End angle (radians)                   |
| `startDistance` | zone               | Inner radius (meters)                 |
| `endDistance`   | zone               | Outer radius (meters)                 |
| `x1`            | rect               | First corner X (meters, starboard +)  |
| `y1`            | rect               | First corner Y (meters, ahead +)      |
| `x2`            | rect               | Second corner X (meters, starboard +) |
| `y2`            | rect               | Second corner Y (meters, ahead +)     |
| `width`         | rect               | Perpendicular width (meters)          |



## ARPA Target Tracking

The Radar API defines ARPA (Automatic Radar Plotting Aid) target tracking with CPA/TCPA calculations and SignalK notification integration.

`mayara-server` now fully supports this API.

If the radar is a dual-radar device then `mayara-server` has a CLI option `--merge-targets`, when this
is used targets will be shared between both ranges and move from one radar to another.

### Listing Tracked Targets

```
HTTP GET "/signalk/v2/api/vessels/self/radars/{id}/targets"
```

_Response:_

```json
[
  {
    "id": 1,
    "status": "tracking",
    "position": {
      "bearing": 0.789,
      "distance": 1852,
      "latitude": 52.3702,
      "longitude": 4.8952
    },
    "motion": {
      "course": 3.14159,
      "speed": 3.34
    },
    "danger": {
      "cpa": 150,
      "tcpa": 324
    },
    "acquisition": "auto",
    "sourceZone": 1,
    "firstSeen": "2025-01-15T10:25:00Z",
    "lastSeen": "2025-01-15T10:30:00Z"
  }
]
```

**Units:** All distances are in meters. All angles (bearing, course) are in radians [0, 2π). Speed is in m/s. Time values (tcpa) are in seconds.

**Optional fields:** Sub-structures are omitted when data is not yet known or not applicable:

- `motion`: Omitted when motion is not yet computed (target still acquiring). Present with `speed: 0` and `course: 0` for confirmed stationary targets (buoys, anchored vessels).
- `danger`: Omitted when vessels are diverging (no CPA exists) or own-ship motion unavailable
- `position.latitude`/`longitude`: Omitted when radar position is unavailable
- `sourceZone`: Omitted for manually acquired targets or Doppler-detected targets

### Manual Target Acquisition

```
HTTP POST "/signalk/v2/api/vessels/self/radars/{id}/targets"
```

_Request body:_

```json
{
  "bearing": 0.785,
  "distance": 2000
}
```

### Cancel Target Tracking

```
HTTP DELETE "/signalk/v2/api/vessels/self/radars/{id}/targets/{targetId}"
```

## Streaming API (WebSocket)

There are two types of websocket:

1. Control Stream: Signal K formatted JSON messages containing control information to and from radars, as well as targets.
2. Spoke Data Stream: High volume radar spoke data in binary format (up to 1 MB/s).

## Control Stream

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
- Subscriptions and desubscriptions can be made for paths. You can use '\*' for all radars
  including radars still to be discovered.
- When first connected all radar meta data will be sent.
- When a new radar is discovered all existing streams will also be sent the meta
  data for the new radar.

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

To receive real-time ARPA target updates, subscribe to the targets path:

```json
{
  "subscribe": [
    {
      "path": "radars.*.targets.*",
      "policy": "instant"
    }
  ]
}
```

You can subscribe to both controls and targets simultaneously:

```json
{
  "subscribe": [
    { "path": "radars.*.controls.*", "period": 1000 },
    { "path": "radars.*.targets.*", "policy": "instant" }
  ]
}
```

### Controls

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
{
  "updates": [
    {
      "$source": "mayara",
      "values": [
        {
          "path": "radars.nav1034A.controls.spokes",
          "value": { "value": 2048 }
        }
      ]
    }
  ]
}
```

Example of setting a control:

```json
{
  "path": "radars.nav1034A.controls.guardZone1",
  "value": {
    "value": 0.735,
    "endValue": 3.1415,
    "startDistance": 0,
    "endDistance": 500,
    "enabled": true
  }
}
```

Target updates are sent whenever a target's position, motion, or status changes:

```json
{
  "updates": [
    {
      "$source": "mayara",
      "timestamp": "2025-01-15T10:30:00Z",
      "values": [
        {
          "path": "radars.nav1034A.targets.1",
          "value": {
            "id": 1,
            "status": "tracking",
            "position": {
              "bearing": 0.789,
              "distance": 1852,
              "latitude": 52.3702,
              "longitude": 4.8952
            },
            "motion": {
              "course": 3.14159,
              "speed": 3.34
            },
            "danger": {
              "cpa": 150,
              "tcpa": 324
            },
            "acquisition": "auto",
            "sourceZone": 1,
            "firstSeen": "2025-01-15T10:25:00Z",
            "lastSeen": "2025-01-15T10:30:00Z"
          }
        }
      ]
    }
  ]
}
```

Targets are created either automatically (ARPA) or manually (MARPA, via a REST or stream message.)
In all cases the targets go through the following states: `acquiring` -> `tracking` -> `lost`.

When a target is deleted (either because it has been in status `lost` for a while or a client explicitly deletes it), a final `null` value is sent:

```json
{
  "updates": [
    {
      "$source": "mayara",
      "timestamp": "2025-01-15T10:32:00Z",
      "values": [
        {
          "path": "radars.nav1034A.targets.1",
          "value": null
        }
      ]
    }
  ]
}
```


## Spoke Data Stream

Because radars can produce up to 4 megabytes of data per rotation, this data is transmitted
on a separate websocket _per radar_ and is in a binary format. The data is encoded using [Protocol Buffers](https://protobuf.dev/) (protobuf), Google's language-neutral binary serialization format. Protobuf provides compact encoding and fast parsing, with official implementations available for most programming languages including JavaScript, Python, Java, C++, Go, and Rust.

The message schema is stable and will not change within a major version (per [semver](https://semver.org/)):

```protobuf
syntax = "proto3";

/*
 * The data stream coming from a radar is a series of spokes.
 * The number of spokes per revolution is different for each type of
 * radar and can be found in the radar specification found at
 * .../v1/api/radars as 'spokes_per_revolution' or .../v3/api/radar/{id}/capabilities
 * The maximum length of each spoke is also defined there, as well as the legend that provides
 * a lookup table for each byte of data in the spoke.
 *
 * The angle and bearing fields below are in terms of spokes, so
 * range from [0..spokes_per_revolution>.
 *
 * Angle is a mandatory field and tells you the rotation of the spoke
 * relative to the front of the boat, going clockwise. 0 means directly
 * ahead, spokes_per_revolution / 4 is to starboard, spokes_per_revolution / 2 is directly astern, etc.
 *
 * Bearing, if set, means that either the radar or the radar server has
 * enriched the data with a true bearing, e.g. 0 is directly North,
 * spokes_per_revolution / 4 is directly West, spokes_per_revolution / 2 is South, etc.
 *
 * Likewise, time and lat/lon indicate the best effort when the spoke
 * was generated, and the lat/lon of the radar at the time of generation.
 *
 */
message RadarMessage {
    message Spoke {
        uint32 angle = 1; // [0..spokes_per_revolution>, angle from bow
        optional uint32 bearing = 2; // [0..spokes_per_revolution>, offset from True North
        uint32 range = 3; // [meters], range in meters of the last pixel in data
        optional uint64 time = 4; // [millis since UNIX epoch] Time when spoke was generated or received
        optional double lat = 6; // Location of radar at time of generation
        optional double lon = 7; // Location of radar at time of generation
        bytes data = 5;
    }
    repeated Spoke spokes = 2;
}
```

The URL is found in the `radars` REST response as `spokeDataUrl` or can be constructed as:

```
/signalk/v2/api/vessels/self/radars/{radar_id}/spokes
```

### Connection Logic

This a Javascript example how to set up the connection to receive spokes:

```javascript
// Fetch radars
const response = await fetch('/signalk/v2/api/vessels/self/radars/')
const data = await response.json()

// Choose a radar_id from the returned radars
const radarId = Object.keys(data.radars)[0]
const radar = data.radars[radarId]

// Connect to spoke data stream
const wsUrl =
  radar.spokeDataUrl ??
  `ws://${location.host}/signalk/v2/api/vessels/self/radars/${radarId}/spokes`

const socket = new WebSocket(wsUrl)
socket.binaryType = 'arraybuffer'

socket.onmessage = (event) => {
  const spokeData = new Uint8Array(event.data)
  // Process binary spoke data...
}
```

### Spoke content and the legend

Every spoke contains `spoke_len` bytes. The radar API always uses one byte per pixel, with every byte representing a value explained by the `legend` contained in the capabilities.

The legend provides a lookup table mapping each byte value to its meaning and suggested display color:

- **Byte values 0 to `pixelColors - 1`**: Normal radar returns, ranging from no echo (0) to strongest echo. The `lowReturn`, `mediumReturn`, and `strongReturn` fields indicate thresholds within this range, useful for smoothing or color gradient algorithms.
- **Byte value at `targetBorder`**: Indicates the edge of a tracked ARPA target.
- **Byte value at `dopplerApproaching`**: Object moving toward the radar (requires Doppler-capable radar).
- **Byte value at `dopplerReceding`**: Object moving away from the radar (requires Doppler-capable radar).
- **Byte values from `historyStart` onward**: Historical trail data showing where targets were in previous rotations.

The `pixels` array provides the complete mapping from byte value to RGBA color. Clients can use this directly for rendering, or implement their own color scheme based on the semantic pixel types (`normal`, `targetBorder`, `dopplerApproaching`, `dopplerReceding`, `history`).

If the radar doesn't support a feature, the corresponding legend field will be absent or null (e.g., `dopplerApproaching` and `dopplerReceding` are absent for non-Doppler radars).

In a later API release it is likely that the legend will be expanded to contain color mappings for different palettes.

### Spoke skipping

Some radars have a high value for `spokes_per_revolution` but actually only produce fewer spokes
per each revolution. At the moment of writing this is true for Furuno radars but not the other
supported radars from Garmin, Navico and Raymarine. The Furuno radars set `hasSparseSpokes` in 
the capabilities struct to `true`.

A conforming GUI must allow for this and either implement some way to expand missing spokes or
to reconsider the width of spokes to be from the angle/bearing from the received spoke to the
previously received spoke. 

A typical value for Furuno is to have `spokes_per_revolution = 8192` but the actual # of spokes
will be ~ 900. Weirdly enough it is not a "round" figure like 1440, 2048, 512 or 250 like the
other radars.

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
  hasSparseSpokes: boolean
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
  category:
    | 'base'
    | 'targets'
    | 'guardZones'
    | 'trails'
    | 'advanced'
    | 'installation'
    | 'info'
  dataType: 'number' | 'enum' | 'string' | 'button' | 'sector' | 'zone' | 'rect'
  isReadOnly?: boolean
  hasEnabled?: boolean
  minValue?: number
  maxValue?: number
  stepValue?: number
  maxDistance?: number
  units?: 'm' | 'm/s' | 'rad' | 'rad/s' | 's'
  descriptions?: Record<string, string> // For enum types
  validValues?: number[] // For enum types
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
  units?: 'm' | 'km' | 'nm' | 'm/s' | 'kn' | 'rad' | 'deg' | 'rad/s' | 'rpm' | 's' | 'min' | 'h'
  auto?: boolean
  autoValue?: number
  enabled?: boolean
  endValue?: number // End angle for sectors/zones (radians)
  startDistance?: number // Inner radius for zones (meters)
  endDistance?: number // Outer radius for zones (meters)
  x1?: number // Rect: first corner X (meters)
  y1?: number // Rect: first corner Y (meters)
  x2?: number // Rect: second corner X (meters)
  y2?: number // Rect: second corner Y (meters)
  width?: number // Rect: perpendicular width (meters)
  timestamp?: string // ISO 8601 timestamp when value was last changed
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
  type:
    | 'normal'
    | 'dopplerApproaching'
    | 'dopplerReceding'
    | 'history'
  color: string
}
```

### Target

```typescript
interface Target {
  id: number
  status: 'tracking' | 'lost' | 'acquiring'
  position: {
    bearing: number // radians [0, 2π)
    distance: number // meters
    latitude?: number // omitted if radar position unavailable
    longitude?: number // omitted if radar position unavailable
  }
  motion?: {
    // omitted if motion not yet computed; present with zeros for stationary targets
    course: number // radians [0, 2π)
    speed: number // m/s
  }
  danger?: {
    // omitted if vessels diverging or own-ship motion unavailable
    cpa: number // meters
    tcpa: number // seconds
  }
  acquisition: 'manual' | 'auto'
  sourceZone?: number // guard zone (1 or 2) that acquired this target; omitted for manual/Doppler
  firstSeen: string // ISO 8601 timestamp
  lastSeen: string // ISO 8601 timestamp
}
```
