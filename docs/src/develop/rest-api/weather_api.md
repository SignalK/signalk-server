# Weather API

#### (Under Development)

_Note: This API is currently under development and the information provided here is likely to change._

The Signal K server Weather API will provide a common set of operations for interacting with weather sources and (like the Resources API) will rely on a "provider plugin" to facilitate communication with the weather source.

The Weather API will handle requests to `/signalk/v2/api/weather` paths and pass them to an Weather Provider plugin which will return data fetched from the weather service. 

The following operations are an example of the operations identified for implementation via HTTP `GET` requests:

```javascript
// fetch weather data for the provided location
GET "/signalk/v2/api/weather?lat=5.432&lon=7.334" 
```

```javascript
//  Returns an array of observations for the provided location
GET "/signalk/v2/api/weather/observations?lat=5.432&lon=7.334"
```

```javascript
// Returns an array of forecasts for the provided location
GET "/signalk/v2/api/weather/forecasts?lat=5.432&lon=7.334" 
```

```javascript
// Returnsjavascript an array of warnings for the provided location
GET "/signalk/v2/api/weather/warnings?lat=5.432&lon=7.334"
```

The Weather API supports the registration of multiple weather provider plugins. The first plugin registered is set as the default source for all API requests.

A list of the registered providers can be retrieved using a HTTP `GET` request to `/signalk/v2/api/weather/providers`.

```javascript
GET "/signalk/v2/api/weather/providers"
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
POST "/signalk/v2/api/weather/providers" {
    "id": "providerId2"
}
```
