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

### Preset Files (presets/*.json)
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

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/signalk/v1/unitpreferences/config` | GET | Get active preset config |
| `/signalk/v1/unitpreferences/config` | PUT | Set active preset |
| `/signalk/v1/unitpreferences/categories` | GET | Get category → SI unit mapping |
| `/signalk/v1/unitpreferences/definitions` | GET | Get merged unit definitions |
| `/signalk/v1/unitpreferences/custom-definitions` | PUT | Save custom unit definitions |
| `/signalk/v1/unitpreferences/presets` | GET | List all presets (built-in + custom) |
| `/signalk/v1/unitpreferences/presets/:name` | GET | Get preset details |
| `/signalk/v1/unitpreferences/presets/custom/:name` | PUT | Create/update custom preset |
| `/signalk/v1/unitpreferences/presets/custom/:name` | DELETE | Delete custom preset |

## How It Works

1. **Path metadata** stores `displayUnits.category` (e.g., "temperature")
2. **Active preset** determines target unit for each category (e.g., temperature → "C")
3. **Unit definitions** provide conversion formula from SI unit to target unit
4. **Data Browser / Apps** use the formula to convert and display values

## Path Override Priority

1. **Path-specific override** - `displayUnits.targetUnit` on path metadata
2. **Preset default** - Target unit from active preset for the category
3. **SI unit** - Raw value in base SI unit if no conversion defined
