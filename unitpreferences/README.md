# Unit Preferences System

This directory contains all configuration files for the SignalK unit preferences system.

## Directory Structure

```
unitpreferences/
├── config.json                      # Active preset configuration
├── categories.json                  # Category → SI unit mapping
├── default-categories.json          # Default category assignments for paths
├── standard-units-definitions.json  # Unit conversion formulas
├── custom-units-definitions.json    # Custom unit definitions (created on demand)
└── presets/
    ├── metric.json                  # Built-in: Metric (SI)
    ├── imperial-us.json             # Built-in: Imperial (US)
    ├── imperial-uk.json             # Built-in: Imperial (UK)
    └── custom/                      # Custom presets directory
        └── *.json                   # User-created presets
```

## File Descriptions

### config.json

Stores the currently active preset name.

```json
{
  "activePreset": "metric"
}
```

### categories.json

Maps category names to their base SI units. Used to validate that a path's units match the category.

```json
{
  "temperature": "K",
  "speed": "m/s",
  "distance": "m",
  ...
}
```

### default-categories.json

Maps SignalK path patterns to default categories. Used for auto-suggesting categories for paths.

```json
{
  "environment.*.temperature": "temperature",
  "navigation.speedOverGround": "speed",
  ...
}
```

### standard-units-definitions.json

Defines all unit conversions. Each SI unit has conversion formulas to display units.

```json
{
  "K": {
    "conversions": {
      "C": {
        "formula": "x - 273.15",
        "inverseFormula": "x + 273.15",
        "symbol": "°C"
      },
      "F": {
        "formula": "(x - 273.15) * 9/5 + 32",
        "inverseFormula": "(x - 32) * 5/9 + 273.15",
        "symbol": "°F"
      }
    }
  },
  ...
}
```

### custom-units-definitions.json

User-defined unit conversions that extend or override standard definitions. Created when users add custom conversions via the API.

### Preset Files (presets/\*.json)

Each preset defines target units for all categories:

```json
{
  "name": "metric",
  "displayName": "Metric System",
  "description": "SI units",
  "categories": {
    "temperature": { "targetUnit": "C" },
    "speed": { "targetUnit": "km/h" },
    "distance": { "targetUnit": "kilometer" },
    ...
  }
}
```

## REST API Endpoints

| Endpoint                                              | Method | Description                           |
| ----------------------------------------------------- | ------ | ------------------------------------- |
| `/signalk/v1/unitpreferences/config`                  | GET    | Get active preset config              |
| `/signalk/v1/unitpreferences/config`                  | PUT    | Set active preset                     |
| `/signalk/v1/unitpreferences/categories`              | GET    | Get category → SI unit mapping        |
| `/signalk/v1/unitpreferences/definitions`             | GET    | Get merged unit definitions           |
| `/signalk/v1/unitpreferences/custom-definitions`      | GET    | Get custom unit definitions           |
| `/signalk/v1/unitpreferences/custom-definitions`      | PUT    | Save custom unit definitions          |
| `/signalk/v1/unitpreferences/custom-categories`       | GET    | Get custom categories                 |
| `/signalk/v1/unitpreferences/custom-categories`       | PUT    | Save custom categories                |
| `/signalk/v1/unitpreferences/presets`                 | GET    | List all presets (built-in + custom)  |
| `/signalk/v1/unitpreferences/presets/:name`           | GET    | Get preset details                    |
| `/signalk/v1/unitpreferences/presets/custom/:name`    | PUT    | Create/update custom preset           |
| `/signalk/v1/unitpreferences/presets/custom/:name`    | DELETE | Delete custom preset                  |
| `/signalk/v1/unitpreferences/presets/custom/upload`   | POST   | Upload custom preset file (admin)     |
| `/signalk/v1/unitpreferences/active`                  | GET    | Get fully resolved active preset      |
| `/signalk/v1/unitpreferences/default-categories`      | GET    | Get default category mappings         |
| `/signalk/v1/unitpreferences/default-category/:path`  | GET    | Get default category for a path       |

## WebSocket Stream

When connecting to the WebSocket stream with `sendMeta=all`, metadata includes full `displayUnits` with conversion formulas:

```
ws://localhost:3000/signalk/v1/stream?subscribe=none&sendMeta=all
```

Subscribe to a path:

```json
{
  "context": "vessels.self",
  "subscribe": [{ "path": "environment.wind.speedApparent" }]
}
```

Metadata response includes enhanced `displayUnits`:

```json
{
  "context": "vessels.urn:mrn:imo:mmsi:123456789",
  "updates": [{
    "timestamp": "2024-01-15T12:00:00.000Z",
    "meta": [{
      "path": "environment.wind.speedApparent",
      "value": {
        "units": "m/s",
        "description": "Apparent wind speed",
        "displayUnits": {
          "category": "speed",
          "targetUnit": "kn",
          "formula": "value * 1.94384",
          "inverseFormula": "value * 0.514444",
          "symbol": "kn",
          "displayFormat": "0.0"
        }
      }
    }]
  }]
}
```

The `displayUnits` object provides everything needed to convert and display values:

- **category** - The unit category (e.g., "speed", "temperature")
- **targetUnit** - The display unit from the active preset
- **formula** - Math.js expression to convert from SI to display unit (use `value` as variable)
- **inverseFormula** - Convert from display unit back to SI
- **symbol** - Display symbol (e.g., "kn", "°C")
- **displayFormat** - Optional format string

## How It Works

1. **Path metadata** stores `displayUnits.category` (e.g., "temperature")
2. **Active preset** determines target unit for each category (e.g., temperature → "C")
3. **Unit definitions** provide conversion formula from SI unit to target unit
4. **REST API / WebSocket** enhance metadata with full conversion info
5. **Data Browser / Apps** use the formula to convert and display values

## Path Override Priority

1. **Path-specific override** - `displayUnits.targetUnit` on path metadata
2. **Preset default** - Target unit from active preset for the category
3. **SI unit** - Raw value in base SI unit if no conversion defined
