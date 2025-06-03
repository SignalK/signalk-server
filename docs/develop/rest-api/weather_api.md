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

The first plugin registered is set as the default source for all API requests.

_Note: Any installed provider plugin, can be set as the default provider._

To see a list of registered providers and which is the default, make a HTTP `GET` request to `/signalk/v2/api/weather/_providers`.

_Example:_

```javascript
GET "/signalk/v2/api/weather/_providers"
```

_Example response:_

```JSON
{
    "providerId1": {
        "name":"my-provider-1",
        "isDefault":true
    },
    "providerId2": {
        "name":"my-provider-2",
        "isDefault":false
    }
}
```

To change the default provider, make a HTTP `POST` request supplying the provider identifier in the body of the request.

_Example:_

```javascript
POST "/signalk/v2/api/weather/_providers" {
    "id": "providerId2"
}
```
