---
title: Weather Providers
---

# Weather Providers

The Signal K server [Weather API](../rest-api/weather_api.md) provides a common set of operations for retrieving meteorological data via a "provider plugin" to facilitate communication with a weather service provider.

A weather provider plugin is a Signal K server plugin that brokers communication with a weather provider.

---

## Weather Provider Interface

For a plugin to be a weather provider it must implement the {@link @signalk/server-api!WeatherProvider | `WeatherProvider`} Interface which provides the Signal K server with methods to pass the details contained in API requests.

> [!NOTE]
> Multiple weather providers can be registered with the Signal K server to enable meteorogical data retrieval from multiple sources.

## Weather Provider Interface Methods

Weather API requests made to the Signal K server will result in the plugin's {@link @signalk/server-api!WeatherProviderMethods | `WeatherProviderMethods`} being called.

A weather provider plugin MUST implement ALL of the {@link @signalk/server-api!WeatherProviderMethods | `WeatherProviderMethods`}:

- {@link @signalk/server-api!WeatherProviderMethods.getObservations | `getObservations(position, options)`}

- {@link @signalk/server-api!WeatherProviderMethods.getForecasts | `getForecasts(position, type, options)`}

- {@link @signalk/server-api!WeatherProviderMethods.getWarnings | `getWarnings(position)`}

> [!NOTE]
> The Weather Provider is responsible for implementing the methods and returning data in the required format!

---

## Registering a Weather Provider

Now that the plugin has implemented the required interface and methods, it can be registered as a weather provider with the SignalK server.

The plugin registers itself as a weather provider by calling the server's {@link @signalk/server-api!WeatherProviderRegistry.registerWeatherProvider | `registerWeatherProvider`} function during startup.

Do this within the plugin `start()` method.

_Example._

```javascript
import { WeatherProvider } from '@signalk/server-api'

module.exports = function (app) {

  const weatherProvider: WeatherProvider = {
    name: 'MyWeatherService',
    methods: {
      getObservations: (
        position: Position,
        options?: WeatherReqParams
      ) => {
        // fetch observation data from weather service
        return observations
      },
      getForecasts: (
        position: Position,
        type: WeatherForecastType,
        options?: WeatherReqParams
      ) => {
        // fetch forecasts data from weather service
        return forecasts
      },
      getWarnings: () => {
        // Service does not provide weather warnings.
        throw new Error('Not supported!')
      }
    }
  }

  const plugin = {
    id: 'mypluginid',
    name: 'My Weather Provider plugin'
    start: (settings: any) => {
      app.registerWeatherProvider(weatherProvider)
    }
  }

  return plugin
```
