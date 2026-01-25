---
title: Radar API
---

# Radar API

The Signal K server Radar API provides a unified interface for viewing and controlling marine radar equipment from any manufacturer. The API is **chartplotter-friendly**: clients can build dynamic UIs that automatically adapt to any radar's capabilities without hardcoding support for specific brands or models.

Radar functionality is provided by "provider plugins" that handle the interaction with radar hardware and stream spoke data to connected clients.

Requests to the Radar API are made to HTTP REST endpoints rooted at `/signalk/v2/api/vessels/self/radars`.

## Design Philosophy: Capabilities-Driven API

This API uses a **self-describing schema** pattern that benefits both radar provider developers and client/chartplotter developers.

### For Client/Chartplotter Developers

Build a **single, adaptive UI** that works with any radar—now and in the future—without hardcoding brand-specific logic.

**How it works:**

1. **Fetch capabilities once** when a radar connects — this tells you what the radar can do
2. **Generate UI widgets from the schema:**
   - `type: "boolean"` → Toggle switch
   - `type: "number"` with `range` → Slider with min/max/step
   - `type: "enum"` with `values` → Dropdown or button group (hide values where `readOnly: true`)
   - `type: "compound"` → Nested panel (e.g., mode selector + value slider)
   - `readOnly: true` on control → Display-only label (for info like serial number)
   - `readOnly: true` on enum value → Value can be reported but not set (e.g., "off", "warming" for power)
3. **Apply constraints dynamically** — gray out controls when conditions are met, show reasons
4. **Poll state for current values** — the schema tells you what to expect

**Example: Rendering a Gain Control**

```typescript
// Capability definition tells you everything needed:
const gainControl = {
  id: 'gain',
  name: 'Gain',
  type: 'compound',
  modes: ['auto', 'manual'],
  properties: {
    mode: { type: 'enum', values: [{ value: 'auto' }, { value: 'manual' }] },
    value: { type: 'number', range: { min: 0, max: 100, unit: 'percent' } }
  }
}

// Your UI renders:
// - Mode toggle: [Auto] [Manual]
// - Value slider: 0 ----[50]---- 100 (disabled when mode=auto)
```

Whether it's a Furuno DRS4D-NXT with 20+ controls or a basic radar with 5 controls, the same client code handles both.

### For Radar Provider Developers (Plugin Authors)

Different manufacturers have vastly different hardware capabilities, control sets, value ranges, and operating modes. Instead of clients hardcoding knowledge about each model, your provider plugin **declares** what the radar can do:

1. **Characteristics** — hardware capabilities (Doppler, dual-range, no-transmit zones, supported ranges)
2. **Controls** — schema for each control (type, valid values, modes, read-only status)
3. **Constraints** — dependencies between controls (e.g., "gain is read-only when preset mode is active")

### Control Categories

| Category       | Description                  | Examples                                                      |
| -------------- | ---------------------------- | ------------------------------------------------------------- |
| `base`         | Available on all radars      | power, range, gain, sea, rain                                 |
| `extended`     | Model-specific features      | dopplerMode, beamSharpening, targetExpansion, noTransmitZones |
| `installation` | Setup/configuration settings | antennaHeight, bearingAlignment                               |

Read-only information (serialNumber, firmwareVersion, operatingHours) is exposed as controls with `readOnly: true`.

_Note: Clients should consider showing `installation` category controls in a separate setup panel, potentially with confirmation dialogs, as these are typically configured once during radar installation._

## API Overview

```
/signalk/v2/api/vessels/self/radars
├── GET                              → List all radar IDs
├── /_providers
│   └── GET                          → List registered providers
└── /{id}
    ├── /capabilities GET            → Get radar schema (characteristics, controls)
    ├── /state GET                   → Get current values for all controls
    ├── /controls
    │   ├── GET                      → Get all control values
    │   ├── PUT                      → Set multiple controls
    │   └── /{controlId}
    │       ├── GET                  → Get single control value
    │       └── PUT                  → Set single control value
    ├── /stream                      → WebSocket (binary spoke data)
    └── /targets                     → ARPA target tracking
        ├── GET                      → List tracked targets with CPA/TCPA
        ├── POST                     → Manual target acquisition
        ├── WS                       → Stream target updates
        └── /{targetId}
            └── DELETE               → Cancel target tracking
```

## Radar Information

### Listing All Radars

Retrieve all available radars with their current info:

```typescript
HTTP GET "/signalk/v2/api/vessels/self/radars"
```

_Response:_

```json
[
  {
    "id": "Furuno-6424",
    "name": "Furuno DRS4D-NXT",
    "brand": "Furuno",
    "model": "DRS4D-NXT",
    "status": "transmit",
    "spokesPerRevolution": 2048,
    "maxSpokeLen": 512,
    "range": 1852,
    "controls": {
      "gain": { "mode": "auto", "value": 50 },
      "sea": { "mode": "auto", "value": 30 },
      "rain": { "mode": "manual", "value": 0 }
    }
  },
  {
    "id": "Navico-HALO",
    "name": "Navico HALO24",
    "brand": "Navico",
    "model": "HALO24",
    "status": "standby",
    "spokesPerRevolution": 2048,
    "maxSpokeLen": 512,
    "range": 3704
  }
]
```

### Getting Radar Capabilities

The capability manifest describes everything a radar can do. Clients should fetch this once and cache it.

```typescript
HTTP GET "/signalk/v2/api/vessels/self/radars/{id}/capabilities"
```

_Response:_

```json
{
  "id": "Furuno-6424",
  "make": "Furuno",
  "model": "DRS4D-NXT",
  "modelFamily": "DRS-NXT",
  "serialNumber": "6424",
  "characteristics": {
    "maxRange": 74080,
    "minRange": 50,
    "supportedRanges": [
      50, 75, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000,
      12000, 16000, 24000, 36000, 48000, 64000, 74080
    ],
    "spokesPerRevolution": 2048,
    "maxSpokeLength": 512,
    "hasDoppler": true,
    "hasDualRange": true,
    "maxDualRange": 22224,
    "noTransmitZoneCount": 2
  },
  "controls": [
    {
      "id": "power",
      "name": "Power",
      "description": "Radar power state",
      "category": "base",
      "type": "enum",
      "values": [
        { "value": "off", "label": "Off", "readOnly": true },
        { "value": "standby", "label": "Standby" },
        { "value": "transmit", "label": "Transmit" },
        { "value": "warming", "label": "Warming Up", "readOnly": true }
      ]
    },
    {
      "id": "range",
      "name": "Range",
      "description": "Detection range in meters",
      "category": "base",
      "type": "enum",
      "values": [
        { "value": 50, "label": "50m" },
        { "value": 1852, "label": "1nm" },
        { "value": 3704, "label": "2nm" }
      ]
    },
    {
      "id": "gain",
      "name": "Gain",
      "description": "Receiver gain adjustment",
      "category": "base",
      "type": "compound",
      "modes": ["auto", "manual"],
      "defaultMode": "auto",
      "properties": {
        "mode": { "type": "string" },
        "value": {
          "type": "number",
          "range": { "min": 0, "max": 100, "unit": "percent" }
        }
      }
    },
    {
      "id": "serialNumber",
      "name": "Serial Number",
      "description": "Radar hardware serial number",
      "category": "base",
      "type": "string",
      "readOnly": true
    },
    {
      "id": "firmwareVersion",
      "name": "Firmware Version",
      "description": "Radar firmware version",
      "category": "base",
      "type": "string",
      "readOnly": true
    },
    {
      "id": "operatingHours",
      "name": "Operating Hours",
      "description": "Total hours of radar operation",
      "category": "base",
      "type": "number",
      "range": { "min": 0, "max": 999999, "step": 0.1, "unit": "hours" },
      "readOnly": true
    },
    {
      "id": "dopplerMode",
      "name": "Doppler Mode",
      "description": "Target velocity color coding",
      "category": "extended",
      "type": "enum",
      "values": [
        { "value": "off", "label": "Off" },
        { "value": "normal", "label": "Normal" },
        { "value": "approaching", "label": "Approaching Only" }
      ]
    }
  ],
  "constraints": [
    {
      "controlId": "gain",
      "condition": {
        "type": "read_only_when",
        "dependsOn": "presetMode",
        "operator": "!=",
        "value": "custom"
      },
      "effect": {
        "readOnly": true,
        "reason": "Controlled by preset mode"
      }
    }
  ],
  "supportedFeatures": ["arpa", "guardZones", "trails"]
}
```

### Getting Radar State

Current values for all controls, plus operational status:

```typescript
HTTP GET "/signalk/v2/api/vessels/self/radars/{id}/state"
```

_Response:_

```json
{
  "id": "Furuno-6424",
  "timestamp": "2025-01-15T10:30:00Z",
  "status": "transmit",
  "controls": {
    "power": "transmit",
    "range": 1852,
    "gain": { "mode": "auto", "value": 50 },
    "sea": { "mode": "auto", "value": 30 },
    "rain": { "mode": "manual", "value": 0 },
    "serialNumber": "6424",
    "firmwareVersion": "01.05",
    "operatingHours": 29410.6,
    "dopplerMode": "normal"
  },
  "disabledControls": []
}
```

## Radar Control

All control operations require appropriate security permissions.

### Setting a Single Control

```typescript
HTTP PUT "/signalk/v2/api/vessels/self/radars/{id}/controls/{controlId}"
```

**Setting power state:**

```typescript
HTTP PUT "/signalk/v2/api/vessels/self/radars/Furuno-6424/controls/power"
```

_Request body:_

```json
{ "value": "transmit" }
```

**Setting range:**

```typescript
HTTP PUT "/signalk/v2/api/vessels/self/radars/Furuno-6424/controls/range"
```

_Request body:_

```json
{ "value": 1852 }
```

**Setting gain (compound control):**

```typescript
HTTP PUT "/signalk/v2/api/vessels/self/radars/Furuno-6424/controls/gain"
```

_Request body:_

```json
{ "value": { "mode": "manual", "value": 75 } }
```

### Setting Multiple Controls

Update multiple controls in a single request:

```typescript
HTTP PUT "/signalk/v2/api/vessels/self/radars/{id}/controls"
```

_Request body:_

```json
{
  "gain": { "mode": "manual", "value": 60 },
  "sea": { "mode": "auto" },
  "rain": { "mode": "manual", "value": 20 }
}
```

## Streaming (WebSocket)

Radar spoke data is streamed via WebSocket as binary frames. The state response includes an optional `streamUrl` field indicating where to connect.

### Connection Logic

```javascript
// Fetch radar state
const state = await fetch(
  '/signalk/v2/api/vessels/self/radars/Furuno-6424/state'
).then((r) => r.json())

// Determine WebSocket URL
const wsUrl =
  state.streamUrl ??
  `ws://${location.host}/signalk/v2/api/vessels/self/radars/${state.id}/stream`

// Connect to stream
const socket = new WebSocket(wsUrl)
socket.binaryType = 'arraybuffer'

socket.onmessage = (event) => {
  const spokeData = new Uint8Array(event.data)
  // Process binary spoke data...
}
```

### Stream URL Patterns

| Scenario          | streamUrl | Description                                |
| ----------------- | --------- | ------------------------------------------ |
| External server   | Present   | High-bandwidth streams bypass Signal K     |
| Integrated plugin | Absent    | Signal K handles everything via `/stream`  |
| WASM plugin       | Present   | Points to dedicated binary stream endpoint |

## ARPA Target Tracking

The Radar API has ARPA (Automatic Radar Plotting Aid) target tracking with CPA/TCPA calculations and SignalK notification integration.

### Listing Tracked Targets

```typescript
HTTP GET "/signalk/v2/api/vessels/self/radars/{id}/targets"
```

_Response:_

```json
{
  "radarId": "Furuno-6424",
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
    },
    {
      "id": 3,
      "status": "tracking",
      "position": {
        "bearing": 270.0,
        "distance": 3500
      },
      "motion": {
        "course": 90.0,
        "speed": 4.2
      },
      "danger": {
        "cpa": 820,
        "tcpa": 450
      },
      "acquisition": "manual",
      "firstSeen": "2025-01-15T10:20:00Z",
      "lastSeen": "2025-01-15T10:30:00Z"
    }
  ]
}
```

### Manual Target Acquisition

Acquire a target at a specific bearing and distance:

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

_Response:_

```json
{
  "success": true,
  "targetId": 5,
  "status": "acquiring"
}
```

### Cancel Target Tracking

```typescript
HTTP DELETE "/signalk/v2/api/vessels/self/radars/{id}/targets/{targetId}"
```

_Response:_

```json
{
  "success": true
}
```

### Target Stream (WebSocket)

Stream real-time target updates:

```typescript
WS "/signalk/v2/api/vessels/self/radars/{id}/targets"
```

_Server sends messages:_

```json
// Target position/motion update
{
  "type": "target_update",
  "target": {
    "id": 1,
    "status": "tracking",
    "position": { "bearing": 45.5, "distance": 1800 },
    "motion": { "course": 180.0, "speed": 6.5 },
    "danger": { "cpa": 140, "tcpa": 310 }
  }
}

// New target acquired
{
  "type": "target_acquired",
  "target": { /* full ArpaTarget */ }
}

// Target tracking lost
{
  "type": "target_lost",
  "targetId": 3,
  "reason": "no_return",
  "lastPosition": { "bearing": 120.5, "distance": 3500 }
}
```

### Target Grace Period

When a target temporarily disappears (behind waves, in rain clutter), the tracker maintains prediction for a configurable grace period before marking it as lost.

Configure via radar state:

```typescript
HTTP PUT "/signalk/v2/api/vessels/self/radars/{id}/state"
```

```json
{
  "arpaSettings": {
    "targetLostTimeout": 45,
    "cpaAlertThreshold": 500,
    "tcpaAlertThreshold": 600
  }
}
```

| Setting              | Default | Description                              |
| -------------------- | ------- | ---------------------------------------- |
| `targetLostTimeout`  | 45      | Seconds before marking target lost       |
| `cpaAlertThreshold`  | 500     | CPA (meters) triggering alert state      |
| `tcpaAlertThreshold` | 600     | TCPA (seconds) within which to check CPA |

## SignalK Notifications

ARPA targets publish collision warnings to SignalK's notification system, enabling chart plotters to display radar-based alerts alongside AIS alerts.

### Notification Paths

```
notifications.navigation.closestApproach.radar:{radarId}:target:{targetId}
notifications.navigation.radarGuardZone.radar:{radarId}:zone:{zoneId}
notifications.navigation.radarTargetLost.radar:{radarId}:target:{targetId}
```

### Closest Approach Alert

Published when a target's CPA crosses a threshold. States follow SignalK conventions:

| State       | CPA Threshold | Description                  |
| ----------- | ------------- | ---------------------------- |
| `normal`    | > 1000m       | Target tracked, no danger    |
| `alert`     | < 1000m       | Approaching, monitor closely |
| `warn`      | < 500m        | Getting close                |
| `alarm`     | < 200m        | Danger, take action          |
| `emergency` | < 100m        | Imminent collision           |

_Example notification:_

```json
{
  "path": "notifications.navigation.closestApproach.radar:Furuno-6424:target:3",
  "value": {
    "state": "warn",
    "method": ["visual", "sound"],
    "message": "ARPA target 3: CPA 320m in 5m 24s",
    "timestamp": "2025-01-15T10:30:00Z",
    "data": {
      "cpa": 320,
      "tcpa": 324,
      "bearing": 45.2,
      "distance": 1852,
      "targetCourse": 180,
      "targetSpeed": 6.5
    }
  }
}
```

### Guard Zone Alert

Published when a target enters a guard zone:

```json
{
  "path": "notifications.navigation.radarGuardZone.radar:Furuno-6424:zone:1",
  "value": {
    "state": "alarm",
    "method": ["visual", "sound"],
    "message": "Target in guard zone 1",
    "timestamp": "2025-01-15T10:30:00Z",
    "data": {
      "zoneId": 1,
      "zoneName": "Starboard sector",
      "targetBearing": 45.2,
      "targetDistance": 500
    }
  }
}
```

### Target Lost Alert

Published when tracking is lost on a **manually-acquired** target. Auto-acquired targets silently drop without notification.

```json
{
  "path": "notifications.navigation.radarTargetLost.radar:Furuno-6424:target:5",
  "value": {
    "state": "warn",
    "method": ["visual"],
    "message": "ARPA target 5 lost",
    "timestamp": "2025-01-15T10:30:00Z",
    "data": {
      "targetId": 5,
      "lastBearing": 120.5,
      "lastDistance": 3500,
      "trackedDuration": 324
    }
  }
}
```

### Subscribing to Radar Notifications

Use standard SignalK delta subscription to receive radar notifications:

```json
{
  "context": "vessels.self",
  "subscribe": [
    {
      "path": "notifications.navigation.closestApproach.radar:*",
      "policy": "instant"
    },
    {
      "path": "notifications.navigation.radarGuardZone.*",
      "policy": "instant"
    },
    {
      "path": "notifications.navigation.radarTargetLost.*",
      "policy": "instant"
    }
  ]
}
```

## Data Types

### SupportedFeature

Optional features a radar provider may implement. This declares what API capabilities are available, NOT hardware capabilities (those are in `characteristics`).

```typescript
type SupportedFeature = 'arpa' | 'guardZones' | 'trails' | 'dualRange'
```

| Feature      | Description                        | Related Endpoints                         |
| ------------ | ---------------------------------- | ----------------------------------------- |
| `arpa`       | ARPA target tracking with CPA/TCPA | `GET/POST/DELETE /targets`, `WS /targets` |
| `guardZones` | Guard zone alerting                | `GET/PUT /guardZones`                     |
| `trails`     | Target history/trail data          | `GET /trails`                             |
| `dualRange`  | Dual-range simultaneous display    | Secondary range controls                  |

**Important distinction:**

- `characteristics.hasDoppler = true` means the hardware supports Doppler
- `supportedFeatures.includes('trails')` means the provider implements the `/trails` endpoint

A radar may have Doppler hardware but the provider might not implement trails. Clients should check both when deciding what UI to show.

**Client usage example:**

```typescript
const caps = await fetch(`/radars/${id}/capabilities`).then((r) => r.json())

// Use optional chaining for backward compatibility
const hasArpa = caps.supportedFeatures?.includes('arpa') ?? false
const hasGuardZones = caps.supportedFeatures?.includes('guardZones') ?? false

if (hasArpa) {
  // Show ARPA target panel, enable target acquisition
}
```

### CapabilityManifest

```typescript
interface CapabilityManifest {
  id: string
  make: string
  model: string
  modelFamily?: string
  serialNumber?: string
  firmwareVersion?: string
  characteristics: Characteristics
  controls: ControlDefinition[]
  constraints?: ControlConstraint[]
  supportedFeatures?: SupportedFeature[] // Optional API features this provider implements
}
```

### Characteristics

```typescript
interface Characteristics {
  maxRange: number // Maximum detection range in meters
  minRange: number // Minimum detection range in meters
  supportedRanges: number[] // Discrete range values in meters
  spokesPerRevolution: number
  maxSpokeLength: number
  hasDoppler: boolean
  hasDualRange: boolean
  maxDualRange?: number // Max range in dual-range mode (meters), omitted if 0
  noTransmitZoneCount: number
}
```

### ControlDefinition

```typescript
interface ControlDefinition {
  id: string // Semantic ID (e.g., "gain", "beamSharpening")
  name: string // Human-readable name
  description: string // Tooltip/help text
  category: 'base' | 'extended' | 'installation'
  type: 'boolean' | 'number' | 'enum' | 'compound' | 'string'
  range?: RangeSpec // For number types
  values?: EnumValue[] // For enum types
  properties?: Record<string, PropertyDefinition> // For compound types
  modes?: string[] // e.g., ["auto", "manual"]
  defaultMode?: string
  readOnly?: boolean // True for info fields
  default?: boolean | number | string | Record<string, unknown>
}

interface RangeSpec {
  min: number
  max: number
  step?: number
  unit?: string // e.g., "percent", "meters", "hours"
}

interface EnumValue {
  value: string | number
  label: string
  description?: string
  readOnly?: boolean // True if this value can be reported but not set by clients
}

interface PropertyDefinition {
  type: string
  description?: string
  range?: RangeSpec
  values?: EnumValue[]
}
```

### RadarState

```typescript
interface RadarState {
  id: string
  timestamp: string // ISO 8601
  status: 'off' | 'standby' | 'transmit' | 'warming'
  controls: Record<string, unknown>
  disabledControls?: DisabledControl[]
  streamUrl?: string // WebSocket URL for spoke data
}

interface DisabledControl {
  controlId: string
  reason: string
}
```

### ControlConstraint

```typescript
interface ControlConstraint {
  controlId: string
  condition: {
    type: 'disabled_when' | 'read_only_when' | 'restricted_when'
    dependsOn: string // Control ID this depends on
    operator: '==' | '!=' | '>' | '<' | '>=' | '<='
    value: string | number | boolean
  }
  effect: {
    disabled?: boolean
    readOnly?: boolean
    allowedValues?: (string | number | boolean)[]
    reason?: string // Human-readable explanation
  }
}
```

### ArpaTarget

```typescript
interface ArpaTarget {
  id: number // Target ID (1-99 typically)
  status: 'tracking' | 'lost' | 'acquiring'
  position: {
    bearing: number // Degrees true from own vessel
    distance: number // Meters from own vessel
    latitude?: number // Calculated lat (if heading available)
    longitude?: number // Calculated lon (if heading available)
  }
  motion: {
    course: number // Computed COG (degrees true)
    speed: number // Computed SOG (m/s)
  }
  danger: {
    cpa: number // Closest Point of Approach (meters)
    tcpa: number // Time to CPA (seconds, negative = past)
  }
  acquisition: 'manual' | 'auto'
  firstSeen: string // ISO 8601 timestamp
  lastSeen: string // ISO 8601 timestamp
}
```

### TargetListResponse

```typescript
interface TargetListResponse {
  radarId: string
  timestamp: string // ISO 8601
  targets: ArpaTarget[]
}
```

### TargetStreamMessage

```typescript
type TargetStreamMessage =
  | { type: 'target_update'; target: ArpaTarget }
  | { type: 'target_acquired'; target: ArpaTarget }
  | {
      type: 'target_lost'
      targetId: number
      reason: 'no_return' | 'manual_cancel'
      lastPosition: { bearing: number; distance: number }
    }
```

### ArpaSettings

```typescript
interface ArpaSettings {
  targetLostTimeout: number // Seconds before marking target lost (default: 45)
  cpaAlertThreshold: number // CPA meters for alert state (default: 500)
  tcpaAlertThreshold: number // TCPA seconds within which to check CPA (default: 600)
}
```

## Providers

The Radar API supports registration of multiple radar provider plugins. All radars from all providers are aggregated under the unified API.

### Listing Available Radar Providers

```typescript
HTTP GET "/signalk/v2/api/vessels/self/radars/_providers"
```

_Response:_

```json
{
  "mayara-radar": {
    "name": "Mayara Radar Plugin"
  },
  "navico-radar": {
    "name": "Navico Radar Provider"
  }
}
```

## Creating a Radar Provider Plugin

To create a radar provider plugin, implement the `RadarProvider` interface:

```typescript
interface RadarProvider {
  name: string
  methods: RadarProviderMethods
}

interface RadarProviderMethods {
  // Required - radar discovery
  getRadars(): Promise<string[]>
  getCapabilities(radarId: string): Promise<CapabilityManifest | null>
  getState(radarId: string): Promise<RadarState | null>

  // Required - control
  setControl(
    radarId: string,
    controlId: string,
    value: unknown
  ): Promise<{ success: boolean; error?: string }>
  setControls(
    radarId: string,
    controls: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }>

  // Optional - streaming (for integrated providers)
  handleStreamConnection?(radarId: string, ws: WebSocket): void

  // Optional - ARPA targets
  getTargets?(radarId: string): Promise<TargetListResponse | null>
  acquireTarget?(
    radarId: string,
    bearing: number,
    distance: number
  ): Promise<{ success: boolean; targetId?: number }>
  cancelTarget?(radarId: string, targetId: number): Promise<boolean>
  handleTargetStreamConnection?(radarId: string, ws: WebSocket): void
}
```

Register with the server:

```typescript
app.radarApi.register(plugin.id, {
  name: 'My Radar Plugin',
  methods: {
    getRadars: async () => ['radar-1'],
    getCapabilities: async (id) => ({
      id,
      make: 'MyBrand',
      model: 'Model-X',
      characteristics: {
        /* ... */
      },
      controls: [
        /* ... */
      ]
    }),
    getState: async (id) => ({
      id,
      timestamp: new Date().toISOString(),
      status: 'transmit',
      controls: { power: 'transmit', gain: { mode: 'auto', value: 50 } }
    }),
    setControl: async (id, controlId, value) => {
      // Send command to radar hardware
      return true
    },
    setControls: async (id, controls) => {
      // Send multiple commands
      return true
    }
  }
})
```

For WASM plugins, use the `radarProvider` capability and implement the corresponding FFI exports.

## Accessing the Radar API from Plugins

Plugins that want to **consume** radar data (rather than provide it) can access the Radar API programmatically using the `getRadarApi()` method on the server app object.

This provides typed, in-process access to the Radar API without going through HTTP:

```typescript
plugin.start = async (settings) => {
  // Check if Radar API is available
  if (app.getRadarApi) {
    try {
      const radarApi = await app.getRadarApi()

      // List all available radars
      const radars = await radarApi.getRadars()
      app.debug(`Found ${radars.length} radars`)

      // Get info for a specific radar
      for (const radar of radars) {
        const info = await radarApi.getRadarInfo(radar.id)
        if (info) {
          app.debug(
            `Radar ${info.name}: status=${info.status}, range=${info.range}m`
          )
        }
      }
    } catch (err) {
      app.debug('Radar API not available:', err.message)
    }
  }
}
```

This pattern follows the same approach as the History API's `getHistoryApi()` method. The property is optional to support older servers that don't have radar API support.

## Naming Conventions

Following consistent naming conventions ensures that clients can work with any radar provider without custom mapping code. When multiple providers use the same control IDs, client UIs "just work" across brands.

### Why This Matters

The Radar API uses **semantic control IDs** that are vendor-neutral. Each vendor's proprietary control names should be mapped to standardized IDs:

```
Vendor-Specific Name     →    Semantic API ID
─────────────────────────────────────────────
Furuno "RezBoost"        →    beamSharpening
Navico "Beam Sharpening" →    beamSharpening
Furuno "Target Analyzer" →    dopplerMode
Navico "VelocityTrack"   →    dopplerMode
```

### Quick Reference

| Element             | Convention     | Example                              |
| ------------------- | -------------- | ------------------------------------ |
| Control IDs         | lowerCamelCase | `beamSharpening`, `dopplerMode`      |
| Property names      | lowerCamelCase | `mode`, `value`, `enabled`           |
| String enum values  | lowercase      | `"auto"`, `"manual"`, `"standby"`    |
| Numeric enum values | integers       | `0`, `1`, `2`, `3`                   |
| Display names       | Title Case     | `"Beam Sharpening"`                  |
| Units               | lowercase      | `"meters"`, `"degrees"`, `"percent"` |

### Control ID Naming

Use **lowerCamelCase** for all control identifiers:

```
✓ beamSharpening
✓ dopplerMode
✓ interferenceRejection
✓ noTransmitZones

✗ beam_sharpening      (no underscores)
✗ BeamSharpening       (no PascalCase)
✗ BEAM_SHARPENING      (no SCREAMING_CASE)
```

Name controls by what they **do**, not what the vendor calls them:

```
✓ beamSharpening     (describes function)
✗ rezBoost           (vendor-specific name)

✓ dopplerMode        (describes technology)
✗ targetAnalyzer     (Furuno marketing name)
✗ velocityTrack      (Navico marketing name)
```

### Standard Control IDs

Providers should use these standard IDs when their radar supports the equivalent functionality:

**Base Controls (All Radars)**

| ID      | Type     | Description                                        |
| ------- | -------- | -------------------------------------------------- |
| `power` | enum     | Operational state: off, standby, transmit, warming |
| `range` | number   | Detection range in meters                          |
| `gain`  | compound | Signal amplification: {mode, value}                |
| `sea`   | compound | Sea clutter suppression: {mode, value}             |
| `rain`  | compound | Rain clutter suppression: {mode, value}            |

**Read-Only Info**

| ID                | Type   | Description              |
| ----------------- | ------ | ------------------------ |
| `serialNumber`    | string | Hardware serial number   |
| `firmwareVersion` | string | Firmware version string  |
| `operatingHours`  | number | Total hours of operation |

**Signal Processing**

| ID                    | Type     | Common Vendor Names                            |
| --------------------- | -------- | ---------------------------------------------- |
| `beamSharpening`      | enum     | Furuno: RezBoost, Navico: Beam Sharpening      |
| `dopplerMode`         | compound | Furuno: Target Analyzer, Navico: VelocityTrack |
| `dopplerSpeed`        | number   | Navico: Doppler Speed                          |
| `birdMode`            | enum     | Furuno: Bird Mode                              |
| `noiseReduction`      | boolean  | Noise Reduction                                |
| `mainBangSuppression` | number   | MBS                                            |

**Interference Filtering**

| ID                           | Type         | Description                            |
| ---------------------------- | ------------ | -------------------------------------- |
| `interferenceRejection`      | boolean/enum | Filters interference from other radars |
| `localInterferenceRejection` | enum         | Navico: Local IR                       |
| `sidelobeSuppression`        | compound     | Navico: SLS                            |

**Target Processing**

| ID                 | Type    | Description                          |
| ------------------ | ------- | ------------------------------------ |
| `targetSeparation` | enum    | Distinguishes closely-spaced targets |
| `targetExpansion`  | enum    | Makes small targets more visible     |
| `targetBoost`      | enum    | Amplifies weak targets               |
| `autoAcquire`      | boolean | Automatic ARPA target acquisition    |

**Operating Modes**

| ID           | Type | Description                                          |
| ------------ | ---- | ---------------------------------------------------- |
| `presetMode` | enum | Pre-configured mode (harbor/offshore/weather/custom) |
| `scanSpeed`  | enum | Antenna rotation speed                               |
| `txChannel`  | enum | TX frequency channel selection                       |

**Receiver Controls**

| ID          | Type     | Description                    |
| ----------- | -------- | ------------------------------ |
| `tune`      | compound | Receiver tuning: {mode, value} |
| `colorGain` | compound | Color intensity: {mode, value} |

**Installation Settings**

| ID                 | Type     | Description                             |
| ------------------ | -------- | --------------------------------------- |
| `bearingAlignment` | number   | Heading offset correction (degrees)     |
| `antennaHeight`    | number   | Antenna height above waterline (meters) |
| `noTransmitZones`  | compound | Sectors where radar won't transmit      |

### Compound Control Patterns

**Mode + Value Pattern** (for controls with auto/manual):

```json
{
  "gain": {
    "mode": "auto",
    "value": 50
  }
}
```

**Enabled + Mode Pattern** (for toggleable features with sub-modes):

```json
{
  "dopplerMode": {
    "enabled": true,
    "mode": "approaching"
  }
}
```

**Array Pattern** (for multi-item controls):

```json
{
  "noTransmitZones": {
    "zones": [
      { "enabled": true, "start": 90, "end": 180 },
      { "enabled": false, "start": 0, "end": 0 }
    ]
  }
}
```

### Adding a New Control

Before creating a new control ID:

1. **Check if a semantic ID already exists** - Don't create `echoBoost` if `targetBoost` covers the same functionality
2. **Use semantic naming** - Name by function, not vendor marketing
3. **Document the vendor mapping** - Help other developers understand the equivalence
4. **Follow the patterns** - Use established compound control structures

## Caching

Radar API responses include `Cache-Control: no-cache` headers. Clients should not cache radar data as it can change at any time:

- **Model identification**: Some radars (e.g., Furuno) identify their model via TCP connection, which happens after initial discovery
- **Status changes**: Radar power state, transmit status can change
- **Control values**: Gain, sea clutter, range, etc. can be modified by the user or other clients

Clients that need to minimize API calls should implement their own caching strategy with appropriate invalidation logic.
