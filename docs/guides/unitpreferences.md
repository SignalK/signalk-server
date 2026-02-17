# Unit Preferences

This guide describes the unit preferences mechanism in Signal K Server.

## For Client Application Developers

The Unit Preferences system simplifies client development by managing unit preferences centrally, on the server across all unit preferences aware client applications. As a developer, you don't need to maintain user preference settings in your application and can use the settings and conversion formulas provided by the server.

### How it Works

When you fetch metadata for a path (e.g., `vessels.self.navigation.speedOverGround`), the server checks the active unit preferences and includes a `displayUnits` object in the meta data.

### API Usage

Simply request the metadata for any path as you normally would:

`GET /signalk/v1/api/vessels/self/navigation/speedOverGround/meta`

**Response Example:**

```json
{
  "units": "m/s",
  "description": "Speed over ground",
  "displayName": "SOG",
  "displayUnits": {
    "category": "speed",
    "targetUnit": "kn",
    "formula": "value * 1.94384",
    "inverseFormula": "value / 1.94384",
    "symbol": "kn",
    "displayFormat": "%.1f"
  }
}
```

The `displayUnits` object provides everything you need to display the value:

- **targetUnit**: The unit the user wants to see (e.g., "kn" for knots).
- **formula**: A math expression to convert the raw SI value (m/s) to the target unit.
- **symbol**: The symbol to display next to the value.
- **displayFormat**: (Optional) A printf-style format string for consistency.

### Consuming Data

1.  Listen to the stream or poll the API implementation for the raw value (always in SI units).
2.  Fetch the metadata for the path.
3.  If `displayUnits` is present, use the `formula` to convert the value.
4.  Display the converted value with the provided `symbol` and `displayFormat`.

This ensures that if the user changes their preferences (e.g., from "Knots" to "m/s" or "km/h") on the server, your application automatically reflects those changes without any code updates.

---

## For End Users

Signal K Server allows you to define your preferred units for different categories of data (e.g., Speed, Depth, Temperature) centrally. These settings are applied across all compatible apps and dashboards.

### Changing Unit Settings

You can configure your unit preferences in the Signal K Server Admin UI.

1.  Open the **Server Admin** interface.
2.  Navigate to **Server > Configuration > Settings**.
3.  Scroll down to the **Unit Preferences** section.

### Available Settings

#### Active Preset

The simplest way to configure units is to select a **Preset**. A preset is a collection of unit preferences for all standard categories.

Common presets include:

- **Nautical**: Knots for speed, feet or meters for depth, depending on common maritime usage.
- **Metric**: Meters/sec, meters, Celsius.
- **Imperial**: MPH, feet, Fahrenheit.

#### Per-User Settings

Preferences are stored **per user**. If you log in with your user account, your unit settings will follow you across different devices. If no user is logged in (or for anonymous users), the server's global default preset (configured by the administrator) is used.

#### Custom Presets

Advanced users can upload **Custom Presets** to define specific combinations of units that aren't covered by the built-in options.

### Overriding Specific Paths

In addition to category-wide settings (e.g., "All speeds in Knots"), you can override units for specific data paths. For example, you might want _Boat Speed_ in Knots but _Wind Speed_ in Meters/Second.

These overrides are typically managed by editing the server configuration. When a specific path has an override, it takes precedence over the general category setting in your active preset.

---

## Unit Categories

Unit categories are the mechanism that allows the server to apply unit preferences to a wide range of data paths without needing configuration for every single path.

### How Categories Work

1.  **Categorization**: Every numeric Signal K path is assigned to a **Category** (e.g., `speed`, `temperature`, `depth`). This assignment is defined in the server's default configuration but can be customized.
2.  **Base Unit**: The category defines the **Base Unit** (usually the SI unit) that the raw data is expected to be in. For example, the `speed` category expects `m/s`.
3.  **Target Unit**: Your active Preset defines a **Target Unit** for each category. For example, your preset might map the `speed` category to `kn` (knots).
4.  **Conversion**: When data is requested, the server looks up the path's category, finds the target unit from your preset, and provides the conversion formula.

This system means that if you set your `speed` preference to Knots, it applies to _Boat Speeds_, _Wind Speeds_ and any other path assigned to the `speed` category.

### Standard Categories

The following categories are available by default:

- **speed**: Speed measurements (Base: m/s). Examples: `navigation.speedOverGround`, `environment.wind.speedTrue`.
- **distance**: Longer distances (Base: m). Examples: `navigation.log`, `navigation.courseRhumbline.nextPoint.distance`.
- **depth**: Vertical distances/depths (Base: m). Examples: `environment.depth.belowTransducer`, `environment.depth.belowKeel`.
- **length**: Dimensions of the vessel or objects (Base: m). Examples: `design.length.overall`, `design.airHeight`.
- **temperature**: Temperature readings (Base: K). Examples: `environment.outside.temperature`, `propulsion.*.temperature`.
- **pressure**: Pressure readings (Base: Pa). Examples: `environment.outside.pressure`, `propulsion.*.oilPressure`.
- **angle**: Angles (Base: rad). Examples: `environment.wind.angleApparent`, `navigation.headingMagnetic`.
- **angularVelocity**: Rate of turn (Base: rad/s). Examples: `navigation.rateOfTurn`.
- **volume**: Liquid volumes (Base: m³). Examples: `tanks.*.currentLevel`.
- **volumeRate**: Flow rates (Base: m³/s). Examples: `propulsion.*.fuel.rate`.
- **mass**: Weight/Mass (Base: kg).
- **electrical**:
  - **voltage** (Base: V). Examples: `electrical.batteries.*.voltage`.
  - **current** (Base: A). Examples: `electrical.batteries.*.current`.
  - **charge** (Base: C). Examples: `electrical.batteries.*.capacity.stateOfCharge`.
  - **power** (Base: W).
  - **energy** (Base: J).
- **frequency**: (Base: Hz). Examples: `propulsion.*.revolutions`.
- **time**: Durations (Base: s).
- **percentage**: Ratios and levels (Base: ratio 0-1). Examples: `tanks.*.currentLevel`, `electrical.batteries.*.capacity.stateOfCharge`.

Additional categories include `dateTime`, `epoch` for time representations, and `unitless`/`boolean` for data that doesn't require conversion.
