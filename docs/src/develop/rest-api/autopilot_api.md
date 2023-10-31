# Working with the Autopilot API


## Overview

The SignalK specification defines the `autopilot` path under the `steering` schema group _(e.g. `/signalk/v2/api/vessels/self/steering/autopilot`)_, for representing information from autopilot devices.

The Autopilot API provides a mechanism for applications to issue requests to autopilot devices (via a provider plugin) to perform common operations.

 _Note: You can find autopilot provider plugins in the `App Store` section of the Signal K Server Admin UI._

## Multiple Autopilot Providers

The Autopilot API supports the installation of multiple provider plugins with only the `primary` provider being the target of the requests made.

The primary provider can be set via the API or by the provider plugin at start-up.

### Retrieving Provider Information

To retrieve a list of installed autopilot providers submit an HTTP `GET` request to `/signalk/v2/api/vessels/self/steering/autopilot/providers`.

```typescript
HTTP GET "/signalk/v2/api/vessels/self/steering/autopilot/providers"
```
_Response:_

```JSON
{
  "providers": [
    {"id":"pypilot-provider","pilotType":"PyPilot"},
    {"id":"raymarine-provider","pilotType":"Raymarine SmartPilot"}
  ],
  "primary":"pypilot-provider"
}
```

Where:
- `providers` contains an array of autopilot provider plugin details
- `primary` contains the identifier of the primary provider plugin that will be the target of request made via the API.


### Setting the Primary Provider

To set the primary autopilot provider submit an HTTP `POST` request to `/signalk/v2/api/vessels/self/steering/autopilot/providers/primary` supplying the provider's plugin id.

```typescript
HTTP POST "/signalk/v2/api/vessels/self/steering/autopilot/providers/primary" {
  "value": "raymarine-provider"
}
```

The provider plugin with the supplied id will now be the target of resquests made to the Autopilot API.

## Autopilot Operations

### Retrieving Status

To retrieve the current autopilotconfiguration as well as a list of available options for `state` and `mode` selections, submit an HTTP `GET` request to `/signalk/v2/api/vessels/self/steering/autopilot`.

```typescript
HTTP GET "/signalk/v2/api/vessels/self/steering/autopilot"
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


### Setting the State

Autopilot state can be set by submitting an HTTP `PUT` request to the `state` endpoint containing a value from the list of available states.

```typescript
HTTP PUT "/signalk/v2/api/vessels/self/steering/autopilot/state" {"value": "disabled"}
```

### Getting the current State

The current autopilot state can be retrieved by submitting an HTTP `GET` request to the `state` endpoint.

```typescript
HTTP GET "/signalk/v2/api/vessels/self/steering/autopilot/state"
```

_Response:_

```JSON
{
  "value":"enabled",
}
```

### Setting the Mode

Autopilot mode can be set by submitting an HTTP `PUT` request to the `mode` endpoint containing a value from the list of available modes.

```typescript
HTTP PUT "/signalk/v2/api/vessels/self/steering/autopilot/mode" {"value": "gps"}
```

### Getting the current Mode

The current autopilot mode can be retrieved by submitting an HTTP `GET` request to the `mode` endpoint.

```typescript
HTTP GET "/signalk/v2/api/vessels/self/steering/autopilot/mode"
```

_Response:_

```JSON
{
  "value":"gps",
}
```

### Setting the Target

Autopilot target value can be set by submitting an HTTP `PUT` request to the `target` endpoint containing the desired value in radians.

_Note: The value supplied should be a number within the valid range for the selected `mode`._

```typescript
HTTP PUT "signalk/v2/api/vessels/self/steering/autopilot/target" {"value": 1.1412}
```

The target value can be adjusted a +/- value by submitting an HTTP `PUT` request to the `target/adjust` endpoint with the value to add to the current `target` value in radians.

```typescript
HTTP PUT "signalk/v2/api/vessels/self/steering/autopilot/target/adjust" {"value": -0.1412}
```

### Getting the current Target

The current autopilot target value _(in radians)_ can be retrieved by submitting an HTTP `GET` request to the `target` endpoint.

```typescript
HTTP GET "/signalk/v2/api/vessels/self/steering/autopilot/target"
```

_Response:_

```JSON
{
  "value":"3.14",
}
```

### Engaging / Disengaging the Autopilot

#### Engaging the autopilot 

An autopilot can be engaged by [setting it to a speciifc `state`](#setting-the-state) but it can also be engaged more generically by submitting an HTTP `POST` request to the `engage` endpoint.

```typescript
HTTP POST "/signalk/v2/api/vessels/self/steering/autopilot/engage"
```

_Note: The resultant `state` into which the autopilot is placed will be determined by the **provider plugin** and the autopilot device it is communicating with._

#### Disengaging the autopilot 

An autopilot can be disengaged by [setting it to a speciifc `state`](#setting-the-state) but it can also be disengaged more generically by submitting an HTTP `POST` request to the `disengage` endpoint.

```typescript
HTTP POST "/signalk/v2/api/vessels/self/steering/autopilot/disengage"
```

_Note: The resultant `state` into which the autopilot is placed will be determined by the **provider plugin** and the autopilot device it is communicating with._

### Perform Tack

To send a command to the autopilot to perform a tack in the required direction, submit an HTTP `POST` request to `/tack/{direction}` where _direction_ is either `port` or `starboard`.

_Example: Tack to Port_
```typescript
HTTP POST "/signalk/v2/api/vessels/self/steering/autopilot/tack/port"
```

_Example: Tack to Starboard_
```typescript
HTTP POST "/signalk/v2/api/vessels/self/steering/autopilot/tack/starboard"
```


### Perform Gybe

To send a command to the autopilot to perform a gybe in the required direction, submit an HTTP `POST` request to `/gybe/{direction}` where _direction_ is either `port` or `starboard`.

_Example: Gybe to Port_
```typescript
HTTP POST "/signalk/v2/api/vessels/self/steering/autopilot/gybe/port"
```

_Example: Gybe to Starboard_
```typescript
HTTP POST "/signalk/v2/api/vessels/self/steering/autopilot/gybe/starboard"
```
