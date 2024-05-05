# Weather Provider Plugins

#### (Under Development)

_Note: This API is currently under development and the information provided here is likely to change._


The Signal K server [Weather API](../rest-api/autopilot_api.md) will provide a common set of operations for retrieving meteorological data and (like the Resources API) will rely on a "provider plugin" to facilitate communication with the autopilot device.

---

## Provider plugins:

A weather provider plugin is a Signal K server plugin that implements the **Weather Provider Interface** which:
- Tells server that the plugin is a weather data source
- Registers the methods used to action requests passed from the server to retrieve data from the weather provider.

_Note: multiple weather providers can be registered._

The `WeatherProvider` interface is defined as follows in _`@signalk/server-api`_:

```typescript
interface WeatherProvider {
  name: string
  methods: WeatherProviderMethods
}
```
where:

- `name`: The weather ssource name. _(e.g. `'OpenWeather'`, `'Open-Meteo'`)_ 

- `methods`: An object implementing the `WeatherProviderMethods` interface defining the functions to which requests are passed by the SignalK server. _Note: The plugin __MUST__ implement each method, even if that operation is NOT supported by the plugin!_

The `WeatherProviderMethods` interface is defined as follows in _`@signalk/server-api`_:

```typescript
interface WeatherProviderMethods {
  getData: (position: Position) => Promise<WeatherProviderData>
  getObservations: (
    position: Position
  ) => Promise<WeatherData[]>
  getForecasts: (position: Position) => Promise<WeatherData[]>
  getWarnings: (position: Position) => Promise<WeatherWarning[]>
}
```

_**Note: The Weather Provider is responsible for implementing the methods and returning data in the required format!**_



### Provider Methods:

**`getData(position)`**: This method is called when a request to retrieve weather data for the provided position is made.


- `position:` Object containing the location of interest. _e.g. {latitude: 16.34765, longitude: 12.5432}_

returns: `Promise<WeatherProviderData>`

_Example: Return weather information for location {latitude: 16.34765, longitude: 12.5432}:_ 
```
GET /signalk/v2/api/weather?lat=6.34765&lon=12.5432
```
_WeatherProvider method invocation:_
```javascript
getData({latitude: 16.34765, longitude: 12.5432});
```

_Returns:_
```JSON
{
  "id": "df85kfo",
  "position": {"latitude": 16.34765, "longitude": 12.5432},
  "observations": [...],
  "forecasts": [...],
  "warnings": [...]
}
```

---

**`getObservations(position)`**: This method is called when a request to retrieve observation data for the provided position is made.


- `position:` Object containing the location of interest. _e.g. {latitude: 16.34765, longitude: 12.5432}_


returns: `Promise<WeatherData[]>`


_Example: Return observations for location {latitude: 16.34765, longitude: 12.5432}:_ 
```
GET /signalk/v2/api/weather/observations?lat=6.34765&lon=12.5432
```

_WeatherProvider method invocation:_
```javascript
getObservations({latitude: 16.34765, longitude: 12.5432});
```

_Returns:_
```JSON
[
    {
        "date": "2024-05-03T06:00:00.259Z",
        "type": "observation",
        "outside": { ... }
    },
    {
        "date": "2024-05-03T05:00:00.259Z",
        "type": "observation",
        "outside": { ... }
    }
]
```

---

**`getForecasts(position)`**: This method is called when a request to retrieve observation data for the provided position is made.


- `position:` Object containing the location of interest. _e.g. {latitude: 16.34765, longitude: 12.5432}_

returns: `Promise<WeatherData[]>`


_Example: Return forecasts for location {latitude: 16.34765, longitude: 12.5432}:_ 
```
GET /signalk/v2/api/weather/forecasts?lat=6.34765&lon=12.5432
```

_WeatherProvider method invocation:_
```javascript
getForecasts({latitude: 16.34765, longitude: 12.5432});
```

_Returns:_
```JSON
[
    {
        "date": "2024-05-03T06:00:00.259Z",
        "type": "point",
        "outside": { ... }
    },
    {
        "date": "2024-05-03T05:00:00.259Z",
        "type": "point",
        "outside": { ... }
    }
]
```

---

**`getWarnings(position)`**: This method is called when a request to retrieve warning data for the provided position is made.

- `position:` Object containing the location of interest. _e.g. {latitude: 16.34765, longitude: 12.5432}_

returns: `Promise<WeatherWarning[]>`


_Example: Return warnings for location {latitude: 16.34765, longitude: 12.5432}:_ 
```
GET /signalk/v2/api/weather/warnings?lat=6.34765&lon=12.5432
```
_WeatherProvider method invocation:_
```javascript
getWarnings({latitude: 16.34765, longitude: 12.5432});
```

_Returns:_
```JSON
[
  {
    "startTime": "2024-05-03T05:00:00.259Z",
    "endTime": "2024-05-03T08:00:00.702Z",
    "details": "Strong wind warning.",
    "source": "OpenWeather",
    "type": "Warning"
  }
]
```
