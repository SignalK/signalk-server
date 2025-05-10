---
title: Weather API
---

# Weather API

The Signal K server Weather API will provide a common set of operations for interacting with weather sources and (like the Resources API) will rely on a "provider plugin" to facilitate communication with the weather source.

The Weather API will handle requests to `/signalk/v2/api/weather` paths and pass them to an Weather Provider plugin which will return data fetched from the weather service.

The following operations are an example of the operations identified for implementation via HTTP `GET` requests:

```javascript
// Returns an array of observations for the provided location
GET "/signalk/v2/api/weather/observations?lat=5.432&lon=7.334"
```

```javascript
// Returns an array of daily forecasts for the provided location
GET "/signalk/v2/api/weather/forecasts/daily?lat=5.432&lon=7.334"
```

```javascript
// Returns an array of point forecasts for the provided location
GET "/signalk/v2/api/weather/forecasts/point?lat=5.432&lon=7.334"
```

```javascript
// Limit the returned array of point forecasts to 5
GET "/signalk/v2/api/weather/forecasts/point?lat=5.432&lon=7.334&count=5"
```

```javascript
// Returnsjavascript an array of warnings for the provided location
GET "/signalk/v2/api/weather/warnings?lat=5.432&lon=7.334"
```

The Weather API supports the registration of multiple weather provider plugins. The first plugin registered is set as the default source for all API requests.

A list of the registered providers can be retrieved using a HTTP `GET` request to `/signalk/v2/api/weather/_providers`.

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

The provider can be changed to another of those listed by using a HTTP `POST` request and supplying the provider identifier in the body of the request:

```javascript
POST "/signalk/v2/api/weather/_providers" {
    "id": "providerId2"
}
```
