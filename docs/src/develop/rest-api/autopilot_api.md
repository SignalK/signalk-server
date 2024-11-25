# Working with the Autopilot API


## Overview

The Autopilot API defines the `autopilots` path under `self` _(e.g. `/signalk/v2/api/vessels/self/autopilots`)_ for representing information from one or more autopilot devices.

The Autopilot API provides a mechanism for applications to issue requests to autopilot devices to perform common operations. Additionally, when multiple autopilot devices are present, each autopilot device is individually addressable.

 _Note: Autopilot provider plugins are required to enable the API operation and provide communication with autopilot devices. See [Autopilot Provider Plugins](../plugins/autopilot_provider_plugins.md) for details._


## Common Operations

The following operations are supported:
- Setting the operating mode
- Engaging / Disengaging the pilot
- Setting / adjusting the course
- Dodging port / starboard
- Tacking / Gybing


## The _Default_ Autopilot

To ensure a consistent API calling profile and to simplify client operations, the Autopilot API will assign a _default_ autopilot device which is accessible using the path `/signalk/v2/api/vessels/self/autopilots/_default`.

- When only one autopilot is present, it will be automatically assigned as the _default_.

- When multiple autopilots are present, and a _default_ is yet to be assigned, one will be assigned when:
  - An update is received from a provider plugin, the autopilot which is the source of the update will be assigned as the _default_.
  - An API request is received, the first autopilot device registered, is assigned as the _default_.
  - A request is sent to the `/_providers/_default` API endpoint _(see [Setting the Default Autopilot](#setting-the-default-provider))_.


### Getting the Default Autopilot Identifier

To get the id of the _default_ autopilot, submit an HTTP `GET` request to `/signalk/v2/api/vessels/self/autopilots/_providers/_default`.

_Example:_
```typescript
HTTP GET "/signalk/v2/api/vessels/self/autopilots/_providers/_default"
```

_Response:_
```JSON
{
  "id":"raymarine-id"
}
```

### Setting an Autopilot as the Default

To set / change the _default_ autopilot, submit an HTTP `POST` request to `/signalk/v2/api/vessels/self/autopilots/_providers/_default/{id}` where `{id}` is the identifier of the autopilot to use as the _default_.

_Example:_
```typescript
HTTP POST "/signalk/v2/api/vessels/self/autopilots/_providers/_default/raymarine-id"
```

The autopilot with the supplied id will now be the target of requests made to `/signalk/v2/api/vessels/self/autopilots/_default/*`.


## Listing the available Autopilots

To retrieve a list of installed autopilot devices, submit an HTTP `GET` request to `/signalk/v2/api/vessels/self/autopilots`.

The response will be an object containing all the registered autopilot devices, keyed by their identifier, detailing the `provider` it is registered by and whether it is assigned as the _default_.

```typescript
HTTP GET "/signalk/v2/api/vessels/self/autopilots"
```
_Example: List of registered autopilots showing that `pypilot-id` is assigned as the default._

```JSON
{
  "pypilot-id": {
    "provider":"pypilot-provider",
    "isDefault": true
  },
  "raymarine-id": {
    "provider":"raymarine-provider",
    "isDefault": false
  }
}
```

## Autopilot Deltas

Deltas emitted by the Autopilot API will have the base path `steering.autopilot` with the `$source` containing the autopilot device identifier.

_Example: Deltas for `autopilot.engaged` from two autopilots (`raymarine-id`)._
```JSON
{
  "context":"vessels.self",
  "updates":[
    {
      "$source":"pypilot-id",
      "timestamp":"2023-11-19T06:12:47.820Z",
      "values":[
        {"path":"steering.autopilot.engaged","value":false}
      ]
    },
    {
      "$source":"raymarine-id",
      "timestamp":"2023-11-19T06:12:47.820Z",
      "values":[
        {"path":"steering.autopilot.engaged","value":true}
      ]
    }
  ]
}
```


## Autopilot Notifications

The Autopilot API will provide notifications under the path `notifications.steering.autopilot` with the `$source` containing the autopilot device identifier.

A set of normalised notification paths are defined to provide a consistant way for client apps to receive and process alarm messages.

- `waypointAdvance`
- `waypointArrival`
- `routeComplete`
- `xte`
- `heading`
- `wind`

_Example:_
```JSON
{
  "context":"vessels.self",
  "updates":[
    {
      "$source":"pypilot-id",
      "timestamp":"2023-11-19T06:12:47.820Z",
      "values":[
        {
          "path": "notifications.steering.autopilot.waypointAdvance",
          "value": {
            "state": "alert",
            "method": ["sound"],
            "message": "Waypoint Advance"
          }
        }
      ]
    }
  ]
}

```

## Autopilot offline / unreachable

If an autopilot device is not connected or unreachable, the provider for that autopilot device will set the `state` of the device to `off-line`.


## Autopilot Operations

All API operations are invoked by issuing requests to:
1. `/signalk/v2/api/vessels/self/autopilots/_default/*`

Targets the default autopilot device.

OR

2. `/signalk/v2/api/vessels/self/autopilots/{id}/*`

Target the autopilot with the supplied `{id}`

_Example:_
```typescript
HTTP GET "/signalk/v2/api/vessels/self/autopilots/_default/state"

HTTP GET "/signalk/v2/api/vessels/self/autopilots/pypilot-id/mode"
```

### Retrieving Autopilot Status

To retrieve the current autopilot configuration as well as a list of available options for `state` and `mode` selections, submit an HTTP `GET` request to `/signalk/v2/api/vessels/self/autopilots/{id}`.

```typescript
HTTP GET "/signalk/v2/api/vessels/self/autopilots/{id}"
```
_Response:_

```JSON
{
  "options":{
    "state":["enabled","disabled"],
    "mode":["gps","compass","wind"]
  },
  "state":"disabled",
  "mode":"gps",
  "target": 0,
  "engaged": false
}
```

Where:
- `options` contains arrays of valid `state` and `mode` selection options
- `state` represents the current state of the device
- `mode` represents the current mode of the device
- `target` represents the current target value with respect to the selected `mode`
- `engaged` will be true when the autopilot is actively steering the vessel.


### Setting the Autopilot State

Autopilot state can be set by submitting an HTTP `PUT` request to the `/signalk/v2/api/vessels/self/autopilots/{id}/state` endpoint containing a value from the list of available states.

```typescript
HTTP PUT "/signalk/v2/api/vessels/self/autopilots/{id}/state" {"value": "disabled"}
```

### Getting the Autopilot State

The current autopilot state can be retrieved by submitting an HTTP `GET` request to the `/signalk/v2/api/vessels/self/autopilots/{id}/state` endpoint.

```typescript
HTTP GET "/signalk/v2/api/vessels/self/autopilots/{id}/state"
```

_Response:_

```JSON
{
  "value":"enabled",
}
```

### Setting the Autopilot Mode

Autopilot mode can be set by submitting an HTTP `PUT` request to the `/signalk/v2/api/vessels/self/autopilots/{id}/mode` endpoint containing a value from the list of available modes.

```typescript
HTTP PUT "/signalk/v2/api/vessels/self/autopilots/{id}/mode" {"value": "gps"}
```

### Getting the Autopilot Mode

The current autopilot mode can be retrieved by submitting an HTTP `GET` request to the `mode` endpoint.

```typescript
HTTP GET "/signalk/v2/api/vessels/self/autopilots/{id}/mode"
```

_Response:_

```JSON
{
  "value":"gps",
}
```

### Setting the Target value

Autopilot target value can be set by submitting an HTTP `PUT` request to the `/signalk/v2/api/vessels/self/autopilots/{id}/target` endpoint containing the desired value in degrees.

_Note: The value supplied should be a number within the valid range for the selected `mode`._

```typescript
HTTP PUT "signalk/v2/api/vessels/self/autopilots/{id}/target" {"value": 129}
```

The target value can be adjusted a +/- value by submitting an HTTP `PUT` request to the `/signalk/v2/api/vessels/self/autopilots/{id}/target/adjust` endpoint with the value to add to the current `target` value in degrees.

```typescript
HTTP PUT "signalk/v2/api/vessels/self/autopilots/{id}/target/adjust" {"value": -2}
```

### Getting the current Target value

The current autopilot target value _(in degrees)_ can be retrieved by submitting an HTTP `GET` request to the `target` endpoint.

```typescript
HTTP GET "/signalk/v2/api/vessels/self/autopilots/{id}/target"
```

_Response:_

```JSON
{
  "value":"3.14",
}
```

### Engaging / Disengaging the Autopilot

#### Engaging the autopilot 

An autopilot can be engaged by [setting it to a speciifc `state`](#setting-the-state) but it can also be engaged more generically by submitting an HTTP `POST` request to the `/signalk/v2/api/vessels/self/autopilots/{id}/engage` endpoint.

```typescript
HTTP POST "/signalk/v2/api/vessels/self/autopilots/{id}/engage"
```

_Note: The resultant `state` into which the autopilot is placed will be determined by the **provider plugin** and the autopilot device it is communicating with._

#### Disengaging the autopilot 

An autopilot can be disengaged by [setting it to a speciifc `state`](#setting-the-state) but it can also be disengaged more generically by submitting an HTTP `POST` request to the `/signalk/v2/api/vessels/self/autopilots/{id}/disengage` endpoint.

```typescript
HTTP POST "/signalk/v2/api/vessels/self/autopilots/{id}/disengage"
```

_Note: The resultant `state` into which the autopilot is placed will be determined by the **provider plugin** and the autopilot device it is communicating with._

### Perform a Tack

To send a command to the autopilot to perform a tack in the required direction, submit an HTTP `POST` request to `./autopilots/{id}/tack/{direction}` where _direction_ is either `port` or `starboard`.

_Example: Tack to Port_
```typescript
HTTP POST "/signalk/v2/api/vessels/self/autopilots/{id}/tack/port"
```

_Example: Tack to Starboard_
```typescript
HTTP POST "/signalk/v2/api/vessels/self/autopilots/{id}/tack/starboard"
```


### Perform a Gybe

To send a command to the autopilot to perform a gybe in the required direction, submit an HTTP `POST` request to `/signalk/v2/api/vessels/self/autopilots/{id}/gybe/{direction}` where _direction_ is either `port` or `starboard`.

_Example: Gybe to Port_
```typescript
HTTP POST "/signalk/v2/api/vessels/self/autopilots/{id}/gybe/port"
```

_Example: Gybe to Starboard_
```typescript
HTTP POST "/signalk/v2/api/vessels/self/autopilots/{id}/gybe/starboard"
```



### Dodging Obstacles

To address the various methods that the `dodge` function could be invoked on pilot devices, the API provides the following endpoints to provide the widest coverage possible:


**To enter dodge mode at the current course**
```javascript
POST /signalk/v2/api/vessels/self/autopilots/{id}/dodge
```

**To enter dodge mode and change course by 5 degrees starboard**
```javascript
PUT /signalk/v2/api/vessels/self/autopilots/{id}/dodge {"value": 5}
```

**To enter dodge mode and change course by 5 degrees port**
```javascript
PUT /signalk/v2/api/vessels/self/autopilots/{id}/dodge {"value": -5}
```

**To cancel dodge mode**
```javascript
DELETE /signalk/v2/api/vessels/self/autopilots/{id}/dodge
```