# Unit Preferences

This guide describes the unit preferences mechanism in Signal K Server.

## For Client Application Developers

The Unit Preferences system simplifies client development by managing unit preferences centrally, on the server across all unit preferences aware client applications. As a developer, you don't need to maintain user preference settings in your application and can use the settings and conversion formulas provided by the server.

### How it Works

When you fetch metadata for a path (e.g., `vessels.self.navigation.speedOverGround`), the server checks the active unit preferences and includes a `displayUnits` object in the meta data.

### REST API Usage

Request the metadata for any path:

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
    "displayFormat": "0.0"
  }
}
```

The `displayUnits` object provides everything you need to display the value:

- **category**: The unit category this path belongs to (e.g., "speed", "depth", "temperature").
- **targetUnit**: The unit the user wants to see (e.g., "kn" for knots).
- **formula**: A [Math.js](https://mathjs.org/) expression to convert the raw SI value to the target unit. The variable `value` represents the input.
- **inverseFormula**: A Math.js expression to convert back from the display unit to SI (useful for user input).
- **symbol**: The symbol to display next to the value.
- **displayFormat**: (Optional) A format pattern for consistency (e.g., "0.0" for one decimal place).

### WebSocket Stream

When subscribing to the WebSocket stream, add `sendMeta=all` to receive metadata once for each path (sent with the first delta for that path, and again only if it changes):

```javascript
const ws = new WebSocket('ws://localhost:3000/signalk/v1/stream?subscribe=none')

ws.onopen = () => {
  ws.send(
    JSON.stringify({
      context: 'vessels.self',
      subscribe: [
        {
          path: 'navigation.speedOverGround',
          policy: 'instant',
          sendMeta: 'all'
        }
      ]
    })
  )
}
```

**Delta with Metadata:**

```json
{
  "context": "vessels.urn:mrn:signalk:uuid:...",
  "updates": [
    {
      "values": [
        {
          "path": "navigation.speedOverGround",
          "value": 5.14,
          "meta": {
            "units": "m/s",
            "description": "Speed over ground",
            "displayUnits": {
              "category": "speed",
              "targetUnit": "kn",
              "formula": "value * 1.94384",
              "inverseFormula": "value / 1.94384",
              "symbol": "kn",
              "displayFormat": "0.0"
            }
          }
        }
      ]
    }
  ]
}
```

Using `sendMeta=all` eliminates the need for separate REST calls to fetch metadata.

### Consuming Data

1.  **Get the value and metadata** - Either subscribe to the WebSocket stream with `sendMeta=all` (recommended), or poll the REST API and fetch metadata separately.
2.  **Check for `displayUnits`** - If present, the user has unit preferences configured.
3.  **Convert the value** - Evaluate the `formula` expression with the SI value as `value`.
4.  **Display the result** - Show the converted value with the provided `symbol` and `displayFormat`.

This ensures that if the user changes their preferences (e.g., from "Knots" to "m/s" or "km/h") on the server, your application automatically reflects those changes without any code updates.

### API Endpoints

The unit preferences system exposes the following REST API endpoints:

| Method | Endpoint                                           | Description                                         |
| ------ | -------------------------------------------------- | --------------------------------------------------- |
| GET    | `/signalk/v1/unitpreferences/config`               | Get the current configuration                       |
| PUT    | `/signalk/v1/unitpreferences/config`               | Update the configuration                            |
| GET    | `/signalk/v1/unitpreferences/categories`           | Get all unit categories (merged standard + custom)  |
| GET    | `/signalk/v1/unitpreferences/definitions`          | Get all unit definitions (merged standard + custom) |
| GET    | `/signalk/v1/unitpreferences/custom-definitions`   | Get custom unit definitions only                    |
| PUT    | `/signalk/v1/unitpreferences/custom-definitions`   | Update custom unit definitions                      |
| GET    | `/signalk/v1/unitpreferences/custom-categories`    | Get custom category mappings only                   |
| PUT    | `/signalk/v1/unitpreferences/custom-categories`    | Update custom category mappings                     |
| GET    | `/signalk/v1/unitpreferences/presets`              | List all available presets (built-in and custom)    |
| GET    | `/signalk/v1/unitpreferences/presets/:name`        | Get a specific preset by name                       |
| PUT    | `/signalk/v1/unitpreferences/presets/custom/:name` | Create or update a custom preset                    |
| DELETE | `/signalk/v1/unitpreferences/presets/custom/:name` | Delete a custom preset                              |
| GET    | `/signalk/v1/unitpreferences/active`               | Get the currently active preset                     |
| GET    | `/signalk/v1/unitpreferences/default-categories`   | Get the default category mappings                   |

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

Available presets:

- **Metric**: km/h, kilometers, meters, Celsius, liters.
- **Imperial (US)**: mph, miles, feet, Fahrenheit, US gallons.
- **Imperial (UK)**: mph, miles, feet, Celsius, UK gallons.
- **Nautical (Metric)**: knots, nautical miles, meters, Celsius, liters.
- **Nautical Imperial (US)**: knots, nautical miles, feet, Fahrenheit, US gallons.
- **Nautical Imperial (UK)**: knots, nautical miles, feet, Celsius, UK gallons.

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
