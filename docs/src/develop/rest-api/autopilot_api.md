# Working with the Autopilot API


## Overview

The SignalK specification defines the `autopilot` path under the `steering` schema group _(e.g. `/signalk/v2/api/vessels/self/steering/autopilot`)_, the majority of which will be populated by data provided by a connected autopilot device.

The Autopilot API provides a mechanism for applications to issue requests via an [Autopilot Provider plugin](../plugins/autopilot_provider_plugins.md) to both send commands and retrieve information from a connected autopilot device. 

 _You can find plugins in the `App Store` section of the server admin UI._

Client applications use `HTTP` requests to the API endpoints to issue commands (`PUT`), retrieve information (`GET`). 

_Note: the ability to issue commands is controlled by the server security settings so client applications may need to authenticate prior to issuing 'PUT' requests._


### Retrieving Configuration
---

Autopilot configuration settings and options are retrived by submitting an HTTP `GET` request to `/signalk/v2/api/vessels/self/steering/autopilot/config`.

```typescript
HTTP GET 'http://hostname:3000/s/signalk/v2/api/vessels/self/steering/autopilot/config'
```

The response will contain:
- The valid option values which should be used when setting either `state` and / or `mode`
- The current values of `state`, `mode` and `target`

_Example:_

```JSON
{
  "options":{
    "state":["enabled","disabled"],
    "mode":["gps","compass","wind"]
  },
  "state":"disabled",
  "mode":"gps",
  "target": 0
}
```

### Setting the State
---

Autopilot state can be set by submitting an HTTP `PUT` request to `/signalk/v2/api/vessels/self/steering/autopilot/state` containing a value from the list of valid states.

```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/steering/autopilot/state {"value": "enabled"}'
```

The response will contain the result of the request.

_Example: success_

```JSON
{
  "state": "COMPLETED",
  "statusCode": 200
}
```

_Example: failure_
```JSON
{
  "state": "FAILED",
  "statusCode": 400,
  "message": "string"
}
```



### Setting the Mode
---

Autopilot mode can be set by submitting an HTTP `PUT` request to `/signalk/v2/api/vessels/self/steering/autopilot/mode` containing a value from the list of valid modes.

```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/steering/autopilot/mode {"value": "gps"}'
```

The response will contain the result of the request.

_Example: success_

```JSON
{
  "state": "COMPLETED",
  "statusCode": 200
}
```

_Example: failure_
```JSON
{
  "state": "FAILED",
  "statusCode": 400,
  "message": "string"
}
```


### Setting the Target value
---

Autopilot target value can be set by submitting an HTTP `PUT` request to `/signalk/v2/api/vessels/self/steering/autopilot/target` containing the desired value in radians.

```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/steering/autopilot/target {"value": 3.1412}'
```

The response will contain the result of the request.

_Example: success_

```JSON
{
  "state": "COMPLETED",
  "statusCode": 200
}
```

_Example: failure_
```JSON
{
  "state": "FAILED",
  "statusCode": 400,
  "message": "string"
}
```

### Adjusting the Target value
---

Autopilot target value can be adjusted a specified +/- value by submitting an HTTP `PUT` request to `/signalk/v2/api/vessels/self/steering/autopilot/target/adjust` containing the desired value in radians.

```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/steering/autopilot/target/adjust {"value": -0.3474}'
```

The response will contain the result of the request.

_Example: success_

```JSON
{
  "state": "COMPLETED",
  "statusCode": 200
}
```

_Example: failure_
```JSON
{
  "state": "FAILED",
  "statusCode": 400,
  "message": "string"
}
```

### Perform Tack
---

To send the command for the autopilot to perform a tack in the required direction, submit an HTTP `PUT` request to `/signalk/v2/api/vessels/self/steering/autopilot/tack/{direction}`.

_Example: Tack to Port_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/steering/autopilot/tack/port'
```

_Example: Tack to Starboard_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/steering/autopilot/tack/starboard'
```

The response will contain the result of the request.

_Example: success_

```JSON
{
  "state": "COMPLETED",
  "statusCode": 200
}
```

_Example: failure_
```JSON
{
  "state": "FAILED",
  "statusCode": 400,
  "message": "string"
}
```
