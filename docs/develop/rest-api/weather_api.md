---
title: Weather API
---

# Weather API

The Signal K server Weather API provides a common set of operations for viewing information from weather data sources via a "provider plugin". The provider plugin facilitates the interaction with the weather service and transforms the data into the Signal K data schema.

Requests to the Weather API are made to HTTP REST endpoints rooted at `/signalk/v2/api/weather`.

Weather API requests require that a postion be supplied which determines the location from which the weather data is sourced.

The following weather data sets are supported:

- Observations
- Forecasts
- Warnings

Following are examples of the types of requests that can be made.

> [!NOTE]
> The data available is dependent on the weather service API and provider-plugin.

_Example 1: Return the latest observation data for the provided location_

```javascript
GET "/signalk/v2/api/weather/observations?lat=5.432&lon=7.334"
```

_Example 2: Return the last 5 observations for the provided location_

```javascript
GET "/signalk/v2/api/weather/observations?lat=5.432&lon=7.334&count=5"
```

_Example 3: Return the daily forecast for the next seven days for the provided location_

```javascript
GET "/signalk/v2/api/weather/forecasts/daily?lat=5.432&lon=7.334&count=7"
```

_Example 4: Return point forecasts for the next 12 periods (service provider dependant) for the provided location_

```javascript
GET "/signalk/v2/api/weather/forecasts/point?lat=5.432&lon=7.334&count=12"
```

_Example 5: Return current warnings for the provided location_

```javascript
GET "/signalk/v2/api/weather/warnings?lat=5.432&lon=7.334"
```

## Providers

The Weather API supports the registration of multiple weather provider plugins.

The first plugin registered is set as the _default_ provider and all requests will be directed to it.

Requests can be directed to a specific provider by using the `provider` parameter in the request with the _id_ of the provider plugin.

_Example:_

```javascript
GET "/signalk/v2/api/weather/warnings?lat=5.432&lon=7.334?provider=my-weather-plugin"
```

> [!NOTE] Any installed weather provider can be set as the default. _See [Setting the Default provider](#setting-a-provider-as-the-default)_

### Listing the available Weather Providers

To retrieve a list of installed weather provider plugins, submit an HTTP `GET` request to `/signalk/v2/api/weather/_providers`.

The response will be an object containing all the registered weather providers, keyed by their identifier, detailing the service `name` and whether it is assigned as the _default_.

```typescript
HTTP GET "/signalk/v2/api/weather/_providers"
```

_Example: List of registered weather providers showing that `open-meteo` is assigned as the default._

```JSON
{
  "open-meteo": {
    "provider":"OpenMeteo",
    "isDefault": true
  },
  "openweather": {
    "provider":"OpenWeather",
    "isDefault": false
  }
}
```

### Getting the Default Provider identifier

To get the id of the _default_ provider, submit an HTTP `GET` request to `/signalk/v2/api/weather/_providers/_default`.

_Example:_

```typescript
HTTP GET "//signalk/v2/api/weather/_providers"
```

_Response:_

```JSON
{
  "id":"open-meteo"
}
```

### Setting a Provider as the Default

To set / change the weather provider that requests will be directed, submit an HTTP `POST` request to `/signalk/v2/api/weather/_providers/_default/{id}` where `{id}` is the identifier of the weather provider to use as the _default_.

_Example:_

```typescript
HTTP POST "/signalk/v2/api/weather/_providers/_default/openweather"
```
