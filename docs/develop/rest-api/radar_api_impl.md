---
title: Creating a Radar Provider Plugin
---

This document provides implementation requirements and suggestions for radar provider plugins.

## Creating a Radar Provider Plugin

To create a radar provider plugin, implement the `RadarProvider` interface:

```typescript
interface RadarProvider {
  name: string
  methods: RadarProviderMethods
}

interface RadarProviderMethods {
  // Required - radar discovery
  getRadars(): Promise<RadarInfo[]>
  getCapabilities(radarId: string): Promise<Capabilities | null>
  getControlValues(radarId: string): Promise<Record<string, ControlValue> | null>

  // Required - control
  setControl(
    radarId: string,
    controlId: string,
    value: ControlValue
  ): Promise<{ success: boolean; error?: string }>

  // Streaming (for integrated providers)
  handleSpokeConnection?(radarId: string, ws: WebSocket): void
  handleStreamConnection?(ws: WebSocket): void

  // Optional - ARPA targets
  getTargets?(radarId: string): Promise<Target[] | null>
  acquireTarget?(
    radarId: string,
    bearing: number,
    distance: number
  ): Promise<{ success: boolean; targetId?: number }>
  cancelTarget?(radarId: string, targetId: number): Promise<boolean>
}
```

### RadarInfo

Information returned for each detected radar:

```typescript
interface RadarInfo {
  name: string                // User-defined or auto-detected name
  brand: string               // Manufacturer (Navico, Furuno, Raymarine, Garmin)
  model?: string              // Model name if detected
  radarIpAddress: string      // IP address of radar unit
  spokeDataUrl: string        // WebSocket URL for spoke data
  streamUrl: string           // WebSocket URL for control stream
}
```

### Capabilities

Static capabilities returned by `getCapabilities()`:

```typescript
interface Capabilities {
  maxRange: number                    // Maximum range in meters
  minRange: number                    // Minimum range in meters
  supportedRanges: number[]           // All supported range values in meters
  spokesPerRevolution: number         // Spokes per full rotation
  maxSpokeLength: number              // Max samples per spoke
  pixelValues: number                 // Distinct intensity values
  hasDoppler: boolean                 // Supports Doppler detection
  hasDualRadar: boolean               // Part of dual-radar system
  hasDualRange: boolean               // Supports dual-range mode
  noTransmitSectors: number           // Configurable no-transmit sectors
  controls: Record<string, ControlDefinition>
  legend: Legend
}
```

### ControlDefinition

Schema for each control:

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
  maxDistance?: number                // For zone types
  units?: 'Meters' | 'KiloMeters' | 'NauticalMiles' | 'MetersPerSecond' | 'Knots' | 'Degrees' | 'Radians' | 'RadiansPerSecond' | 'RotationsPerMinute' | 'Seconds' | 'Minutes' | 'Hours'
  descriptions?: Record<string, string>  // For enum types: value -> label
  validValues?: number[]                 // For enum types: settable values
  hasAuto?: boolean
  hasAutoAdjustable?: boolean
  autoAdjustMinValue?: number
  autoAdjustMaxValue?: number
}
```

### ControlValue

Values for reading and writing controls:

```typescript
interface ControlValue {
  value?: number | string      // The control value
  auto?: boolean               // Auto mode enabled
  autoValue?: number           // Adjustment when auto=true
  enabled?: boolean            // Control enabled (sectors, zones)
  endValue?: number            // End angle for sectors/zones (radians)
  startDistance?: number       // Inner radius for zones (meters)
  endDistance?: number         // Outer radius for zones (meters)
}
```

### Legend

Color mapping for spoke data interpretation:

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

### Registration Example

```typescript
app.radarApi.register(plugin.id, {
  name: 'My Radar Plugin',
  methods: {
    getRadars: async () => [{
      name: 'HALO 034A',
      brand: 'Navico',
      model: 'HALO',
      radarIpAddress: '192.168.1.50',
      spokeDataUrl: 'ws://192.168.1.100:8080/signalk/v2/api/vessels/self/radars/nav1034A/spokes',
      streamUrl: 'ws://192.168.1.100:8080/signalk/v2/api/vessels/self/radars/stream'
    }],
    getCapabilities: async (id) => ({
      maxRange: 74080,
      minRange: 50,
      supportedRanges: [50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 74080],
      spokesPerRevolution: 2048,
      maxSpokeLength: 1024,
      pixelValues: 16,
      hasDoppler: true,
      hasDualRadar: true,
      hasDualRange: false,
      noTransmitSectors: 4,
      controls: {
        gain: {
          id: 4,
          name: 'Gain',
          description: 'How sensitive the radar is to returning echoes',
          category: 'base',
          dataType: 'number',
          minValue: 0,
          maxValue: 100,
          stepValue: 1,
          hasAuto: true,
          hasAutoAdjustable: false
        }
      },
      legend: {
        lowReturn: 1,
        mediumReturn: 8,
        strongReturn: 13,
        targetBorder: 17,
        historyStart: 20,
        pixelColors: 16,
        pixels: [
          { type: 'normal', color: { r: 0, g: 0, b: 0, a: 0 } },
          { type: 'normal', color: { r: 0, g: 0, b: 51, a: 255 } }
        ]
      }
    }),
    getControlValues: async (id) => ({
      power: { value: 2 },
      gain: { auto: false, value: 50 },
      range: { value: 3000 }
    }),
    setControl: async (id, controlId, value) => {
      // Send command to radar hardware
      return { success: true }
    }
  }
})
```

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
| Property names      | lowerCamelCase | `auto`, `value`, `enabled`           |
| Numeric enum values | integers       | `0`, `1`, `2`, `3`                   |
| Display names       | Title Case     | `"Beam Sharpening"`                  |
| Units               | PascalCase     | `"Meters"`, `"Radians"`, `"Seconds"` |

### Control Categories

| Category       | Description                  | Examples                                         |
| -------------- | ---------------------------- | ------------------------------------------------ |
| `base`         | Available on all radars      | power, range, gain, sea, rain                    |
| `targets`      | Target tracking settings     | targetExpansion, targetTrails                    |
| `guardZones`   | Guard zone configuration     | guardZone1, guardZone2                           |
| `trails`       | Trail display settings       | trailsTime, clearTrails                          |
| `advanced`     | Model-specific features      | dopplerMode, beamSharpening, interferenceRejection |
| `installation` | Setup/configuration settings | antennaHeight, bearingAlignment, noTransmitSector1 |
| `info`         | Read-only information        | serialNumber, firmwareVersion, transmitTime      |

### Standard Control IDs

Providers should use these standard IDs when their radar supports the equivalent functionality:

**Base Controls (All Radars)**

| ID      | dataType | Description                                        |
| ------- | -------- | -------------------------------------------------- |
| `power` | enum     | Operational state: 0=Off, 1=Standby, 2=Transmit, 3=Preparing |
| `range` | number   | Detection range in meters                          |
| `gain`  | number   | Signal amplification (0-100), supports auto        |
| `sea`   | number   | Sea clutter suppression (0-100), supports auto     |
| `rain`  | number   | Rain clutter suppression (0-100), supports auto    |

**Read-Only Info**

| ID              | dataType | Description                |
| --------------- | -------- | -------------------------- |
| `serialNumber`  | string   | Hardware serial number     |
| `firmwareVersion` | string | Firmware version string    |
| `transmitTime`  | number   | Total transmission time (seconds) |

**Signal Processing**

| ID                    | dataType | Common Vendor Names                            |
| --------------------- | -------- | ---------------------------------------------- |
| `mode`                | enum     | Navico: Mode (custom, harbour, offshore, bird) |
| `beamSharpening`      | enum     | Furuno: RezBoost, Navico: Beam Sharpening      |
| `dopplerMode`         | enum     | Furuno: Target Analyzer, Navico: VelocityTrack |
| `dopplerSpeed`        | number   | Navico: Doppler Speed                          |
| `noiseReduction`      | enum     | Noise Reduction level                          |
| `mainBangSuppression` | number   | MBS                                            |

**Interference Filtering**

| ID                           | dataType | Description                            |
| ---------------------------- | -------- | -------------------------------------- |
| `interferenceRejection`      | enum     | Filters interference from other radars |
| `localInterferenceRejection` | enum     | Navico: Local IR                       |
| `sidelobeSuppression`        | number   | Navico: SLS                            |

**Target Processing**

| ID                 | dataType | Description                          |
| ------------------ | -------- | ------------------------------------ |
| `targetSeparation` | enum     | Distinguishes closely-spaced targets |
| `targetExpansion`  | enum     | Makes small targets more visible     |
| `targetBoost`      | enum     | Amplifies weak targets               |

**Installation Settings**

| ID                   | dataType | Description                             |
| -------------------- | -------- | --------------------------------------- |
| `bearingAlignment`   | number   | Heading offset correction (radians)     |
| `antennaHeight`      | number   | Antenna height above waterline (meters) |
| `noTransmitSector1`  | sector   | First no-transmit sector                |
| `noTransmitSector2`  | sector   | Second no-transmit sector               |

**Guard Zones**

| ID           | dataType | Description                      |
| ------------ | -------- | -------------------------------- |
| `guardZone1` | zone     | First guard zone for detection   |
| `guardZone2` | zone     | Second guard zone for detection  |

### Control Value Patterns

**Simple numeric control:**

```json
{ "value": 75 }
```

**Control with auto mode:**

```json
{ "auto": true, "value": 50 }
```

**Control with auto adjustment (e.g., Sea on HALO):**

```json
{ "auto": true, "autoValue": -20, "value": 50 }
```

**Sector control (no-transmit zone):**

```json
{ "enabled": true, "value": -1.5533, "endValue": -1.2217 }
```

**Zone control (guard zone):**

```json
{
  "enabled": true,
  "value": -0.5585,
  "endValue": 1.7104,
  "startDistance": 100.0,
  "endDistance": 500.0
}
```

### Adding a New Control

Before creating a new control ID:

1. **Check if a semantic ID already exists** - Don't create `echoBoost` if `targetBoost` covers the same functionality
2. **Use semantic naming** - Name by function, not vendor marketing
3. **Document the vendor mapping** - Help other developers understand the equivalence
4. **Follow the patterns** - Use established control value structures

## Caching

Radar API responses include `Cache-Control: no-cache` headers. Clients should not cache radar data as it can change at any time:

- **Model identification**: Some radars (e.g., Furuno) identify their model via TCP connection, which happens after initial discovery
- **Status changes**: Radar power state, transmit status can change
- **Control values**: Gain, sea clutter, range, etc. can be modified by the user or other clients

Clients that need to minimize API calls should implement their own caching strategy with appropriate invalidation logic.
