---
title: Weather Providers
---

# Weather Provider Plugins

The Signal K server [Weather API](../rest-api/weather_api.md) provides a common set of operations for retrieving meteorological data via a "provider plugin" to facilitate communication with a weather service provider.

---

## Provider plugins:

A weather provider plugin is a Signal K server plugin that brokers communication with a weather provider and implements the **Weather Provider Interface** which:

- Tells server that the plugin is a weather data source
- Registers the methods the plugin will use to action requests passed from the server to retrieve data from the weather provider.

_Note: Multiple weather providers can be registered to enable meteorogical data retrieval from multiple sources._

The `WeatherProvider` interface is defined as follows in _`@signalk/server-api`_:

```typescript
interface WeatherProvider {
  name: string
  methods: WeatherProviderMethods
}
```

where:

- `name`: The weather ssource name. _(e.g. `'OpenWeather'`, `'Open-Meteo'`)_

- `methods`: An object implementing the `WeatherProviderMethods` interface defining the functions to which requests are passed by the SignalK server. _Note: The plugin **MUST** implement each method, even if that operation is NOT supported by the plugin!_

The `WeatherProviderMethods` interface is defined as follows in _`@signalk/server-api`_:

```typescript
interface WeatherProviderMethods {
  getObservations: (position: Position) => Promise<WeatherData[]>
  getForecasts: (position: Position) => Promise<WeatherData[]>
  getWarnings: (position: Position) => Promise<WeatherWarning[]>
}
```

> [!NOTE]
> The Weather Provider is responsible for implementing the methods and returning data in the required format!

## Registering as a Weather Provider

To register a plugin as a weather provider with the SignalK server, it must call the server's {@link @signalk/server-api!WeatherProviderRegistry.registerWeatherProvider | `registerWeatherProvider`} function during plugin startup.

_Example: Plugin registering as a weather provider._

```javascript
import { WeatherProvider } from '@signalk/server-api'

module.exports = function (app) {

  const plugin = {
    id: 'mypluginid',
    name: 'My Weather Provider plugin'
  }

  const weatherProvider: WeatherProvider = {
      name: 'MyWeatherService',
        methods: {
          getObservations: (
            position: Position, 
            options?: WeatherReqParams
          ) => {
            return getObservationData(position, options)
          },
          getForecasts: (
            position: Position, 
            type: WeatherForecastType,
            options?: WeatherReqParams
          ) => {
            return getForecastData(position, type, options)
          },
          getWarnings: () => {
            throw new Error('Not supported!')
          }
        }
    }
```

### {@link @signalk/server-api!WeatherProviderMethods | `WeatherProviderMethods`}:

**{@link @signalk/server-api!WeatherProviderMethods.getObservations | `getObservations(position, options)`}**: This method is called when a request to retrieve observation data for the provided position is made.

Response returned by the plugin should be an array of forecast entries where the first entry is the most current. _(i.e. descending time order)_

- `position:` {@link @signalk/server-api!Position | `Position`} object indicating the location of interest.

- `options:` _Optional_ object containing the location of interest. {@link @signalk/server-api!WeatherReqParams | `WeatherReqParams`}

returns: `Promise<WeatherData[]>`

_Example: Return observations for location {latitude: 16.34765, longitude: 12.5432}:_

```
GET /signalk/v2/api/weather/observations?lat=6.34765&lon=12.5432
```

_WeatherProvider method invocation:_

```javascript
getObservations({ latitude: 16.34765, longitude: 12.5432 })
```

_Returns:_

```JSON
[
    {
        "date": "2024-05-03T05:00:00.259Z",
        "type": "observation",
        "outside": { ... }
    },
    {
        "date": "2024-05-03T04:00:00.259Z",
        "type": "observation",
        "outside": { ... }
    }
]
```

---

**{@link @signalk/server-api!WeatherProviderMethods.getForecasts | `getForecasts(position, type, options)`}**: This method is called when a request to retrieve observation data for the provided position is made.

Response returned by the plugin should be an array of forecast entries where the first entry is most current. _(i.e. ascending time order)_

- `position:` {@link @signalk/server-api!Position | `Position`} object indicating the location of interest.

- `type:` Forecast type: **daily | point**. 

- `options:` _Optional_ object containing the location of interest. {@link @signalk/server-api!WeatherReqParams | `WeatherReqParams`}

returns: `Promise<WeatherData[]>`

_Example: Return point forecast for next 2 periods for location {latitude: 16.34765, longitude: 12.5432}:_

```
GET /signalk/v2/api/weather/forecasts/point?lat=6.34765&lon=12.5432&count=2
```

_WeatherProvider method invocation:_

```javascript
getForecasts({ latitude: 16.34765, longitude: 12.5432 }, 'point', { maxCount: 2 })
```

_Returns:_

```JSON
[
    {
        "date": "2024-05-03T05:00:00.259Z",
        "type": "point",
        "outside": { ... }
    },
    {
        "date": "2024-05-03T06:00:00.259Z",
        "type": "point",
        "outside": { ... }
    }
]
```

---

**{@link @signalk/server-api!WeatherProviderMethods.getWarnings | `getWarnings(position)`}**: This method is called when a request to retrieve warning data for the provided position is made.

Response returned by the plugin should be an array of warning entries where the first entry is the most recent warning. _(i.e. ascending time order)_

- `position:` {@link @signalk/server-api!Position | `Position`} object indicating the location of interest.

returns: `Promise<WeatherWarning[]>`

_Example: Return warnings for location {latitude: 16.34765, longitude: 12.5432}:_

```
GET /signalk/v2/api/weather/warnings?lat=6.34765&lon=12.5432
```

_WeatherProvider method invocation:_

```javascript
getWarnings({ latitude: 16.34765, longitude: 12.5432 })
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
