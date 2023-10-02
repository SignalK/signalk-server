# Working with the Autopilot API


## Overview

The SignalK specification defines the `autopilot` path under the `steering` schema group _(e.g. `/signalk/v2/api/vessels/self/steering/autopilot`)_, for representing information from autopilot devices.

The Autopilot API provides a mechanism for applications to issue requests to autopilot devices (via a provider plugin) to perform common operations.

 _Note: You can find autopilot provider plugins in the `App Store` section of the Signal K Server Admin UI._


### Retrieving Configuration

To retrieve the current configuration as well as a list of available options for `state` and `mode` selections, submit an HTTP `GET` request to `/signalk/v2/api/vessels/self/steering/autopilot`.

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
  "active": false
}
```

Where:
- `options` contains arrays of valid `state` and `mode` selection options
- `state` represents the current state of the device
- `mode` represents the current mode of the device
- `target` represents the current target value with respect to the selected `mode`
- `active` will be true when the selected `state` indicates that the autopilot is engaged and steering the vessel.


### Setting the Mode

Autopilot mode can be set by submitting an HTTP `PUT` request to the `mode` endpoint containing a value from the list of available modes.

```
HTTP PUT "/signalk/v2/api/vessels/self/steering/autopilot/mode" {"value": "gps"}
```

### Setting the Target

Autopilot target value can be set by submitting an HTTP `PUT` request to the `target` endpoint containing the desired value in radians.

_Note: The value supplied should be a number within the valid range for the selected `mode`._

```
HTTP PUT "signalk/v2/api/vessels/self/steering/autopilot/target" {"value": 1.1412}
```

The target value can be adjusted a +/- value by submitting an HTTP `PUT` request to the `target/adjust` endpoint with the value to add to the current `target` value in radians.

```
HTTP PUT "signalk/v2/api/vessels/self/steering/autopilot/target/adjust" {"value": -0.1412}
```

### Engaging / Disengaging the Autopilot

#### Engaging the autopilot 

An autopilot can be engaged by issuing one of the following requests:

1. Submit an HTTP `POST` request to the `engage` endpoint

  _Note: This will set the autopilot to a `state` as determined by the **provider plugin**._

```
HTTP PUT "/signalk/v2/api/vessels/self/steering/autopilot/engage"
```

2. Submit an HTTP `PUT` request to the `state` endpoint supplying the desired a value from the list of available states.

  Use this method to set the autopilot to a desired `state`.
  
```
HTTP PUT "/signalk/v2/api/vessels/self/steering/autopilot/state" {"value": "enabled"}
```

#### Disengaging the autopilot 

An autopilot can be disengaged by issuing one of the following requests:

1. Submit an HTTP `POST` request to the `disengage` endpoint

  _Note: This will set the autopilot to a `state` as determined by the **provider plugin**._

```
HTTP PUT "/signalk/v2/api/vessels/self/steering/autopilot/disengage"
```

2. Submit an HTTP `PUT` request to the `state` endpoint supplying the desired value from the list of available states.

  Use this method to set the autopilot to a desired `state`.
  
```
HTTP PUT "/signalk/v2/api/vessels/self/steering/autopilot/state" {"value": "disabled"}
```

### Perform Tack

To send a command to the autopilot to perform a tack in the required direction, submit an HTTP `POST` request to `/tack/{direction}` where _direction_ is either `port` or `starboard`.

_Example: Tack to Port_
```
HTTP POST "/signalk/v2/api/vessels/self/steering/autopilot/tack/port"
```

_Example: Tack to Starboard_
```
HTTP POST "/signalk/v2/api/vessels/self/steering/autopilot/tack/starboard"
```


### Perform Gybe

To send a command to the autopilot to perform a gybe in the required direction, submit an HTTP `POST` request to `/gybe/{direction}` where _direction_ is either `port` or `starboard`.

_Example: Gybe to Port_
```
HTTP POST "/signalk/v2/api/vessels/self/steering/autopilot/gybe/port"
```

_Example: Gybe to Starboard_
```
HTTP POST "/signalk/v2/api/vessels/self/steering/autopilot/gybe/starboard"
```
