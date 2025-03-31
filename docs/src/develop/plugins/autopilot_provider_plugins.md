---
title: Autopilot Providers
---

# Autopilot Provider plugins

The Signal K Autopilot API defines endpoints under the path `/signalk/v2/api/vessels/self/autopilots` providing a way for all Signal K clients to perform common autopilot operations independent of the autopilot device in use. The API is defined in an [OpenAPI](/doc/openapi/?urls.primaryName=autopilot) document.

Requests made to the Autopilot API are received by the Signal K Server, where they are validated and an authorisation check performed, before being passed on to a **provider plugin** to action the request on the autopilot device.

This de-coupling of request handling and autopilot communication provides the flexibility to support a variety of autopilot devices and ensures interoperability and reliabilty.

Autopilot API requests are passed to a **provider plugin** which will process and action the request facilitating communication with the autopilot device.

The following diagram provides an overview of the Autopilot API architectue.

<img src="../../img/autopilot_provider.svg" width="600px">

_Autopilot API architecture_


## Provider Plugins:

An autopilot provider plugin is a Signal K server plugin that implements the **Autopilot Provider Interface** which:
- Tells server the autopilot devices provided for by the plugin
- Registers the methods used to action requests passed from the server to perform autopilot operations.

The `AutopilotProvider` interface is defined in _`@signalk/server-api`_

Multiple providers can be registered and each provider can manage one or more autopilot devices.


**Note: An Autopilot Provider plugin MUST:**
- Implement all Autopilot API interface methods.
- Facilitate communication on the target autopilot device to send commands and retrieve both status and configuration information
- Ensure the `engaged` path attribute value is maintained to reflect the operational status of the autopilot.
- Map the `engage` and `disengage` operations to an appropriate autopilot device `state`.
- Set the state as `off-line` if the autopilot device is not connected or unreachable.
- Set the mode as `dodge` when the autopilot device is is in dodge mode.


### Registering as an Autopilot Provider

A provider plugin must register itself with the Autopilot API during start up by calling the `registerAutopilotProvider`.

The function has the following signature:

```typescript
app.registerAutopilotProvider(provider: AutopilotProvider, devices: string[])
```
where:

- `provider`: is a valid **AutopilotProvider** object
- `devices`: is an array of identifiers indicating the autopilot devices managed by the plugin.

_Example: Plugin registering as an autopilot provider._
```javascript
import { AutopilotProvider } from '@signalk/server-api'

module.exports = function (app) {

    const plugin = {
    id: 'mypluginid',
    name: 'My autopilot Provider plugin'
    }

    const autopilotProvider: AutopilotProvider = {
        getData: (deviceId) => { return ... },
        getState: (deviceId) => { return ... },
        setState: (state, deviceId) => { ... },
        getMode: (deviceId) => { return ... },
        setMode: (mode, deviceId) => { ... },
        getTarget: (deviceId) => { return ... },
        setTarget(value, deviceId) => { ... },
        adjustTarget(value, deviceId) => { ... },
        engage: (deviceId) => { ... },
        disengage: (deviceId) => { ... },
        tack:(direction, deviceId) => { ... },
        gybe:(direction, deviceId) => { ... },
        dodge:(value, deviceId) => { ... }
    }

    const pilots = ['pilot1', 'pilot2']

  plugin.start = function(options) {
    ...
    try {
      app.registerAutopilotProvider(autopilotProvider, pilots)
    }
    catch (error) {
      // handle error
    }
  }

  return plugin
}
```

### Sending Updates and Notifications from Autopilot device

The Autopilot API is responsible for sending both update and notification `deltas` to Signal K clients.

Data received from an autopilot device, regardless of the communications protocol (NMEA2000, etc), should be sent to the Autopilot API by calling the `autopilotUpdate` interface method.

This will ensure:
- Default pilot status is correctly maintained
- `steering.autopilot.*` both V1 and V2 deltas are sent

**_Important! The values provided via `autopilotUpdate` will be sent in the relevant delta message, so ensure they are in the correct units (e.g. angles in radians, etc)._**

The function has the following signature:

```typescript
app.autopilotUpdate(deviceID: string, apInfo: {[key:string]: Value})
```
where:

- `deviceId`: is the autopilot device identifier
- `appInfo`: object containing values keyed by <AutopilotInfo> attributes _(as defined in @signalk/server-api)_

_Example Update:_
```javascript
app.autopilotUpdate('my-pilot', {
  target: 1.52789,
  mode: 'compass'
})
```

Notifications / Alarms are sent using one of the normalised alarm names below as the path and a `Notification` as the value.

- waypointAdvance
- waypointArrival
- routeComplete
- xte
- heading
- wind

_Example Notification:_
```javascript
app.autopilotUpdate('my-pilot', {
  alarm: {
    path: 'waypointAdvance',
    value: {
      state: 'alert'
      method: ['sound']
      message: 'Waypoint Advance'
    }
  }
})
```


### Provider Methods:

**`getData(deviceId)`**: This method returns an AutopilotInfo object containing the current data values and valid options for the supplied autopilot device identifier.

- `deviceId:` identifier of the autopilot device to query.

returns: `Promise<{AutopilotInfo}>`

_Note: It is the responsibility of the autopilot provider plugin to map the value of `engaged` to the current `state`._


_Example:_
```javascript
// API request
GET /signalk/v2/api/vessels/self/autopilots/mypilot1

// AutopilotProvider method invocation
getData('mypilot1');

// Returns:
{
  options: {
    states: [
        {
            name: 'auto' // autopilot state name
            engaged: true // actively steering
        },
        {
            name: 'standby' // autopilot state name
            engaged: false // not actively steering
        }
    ]
    modes: ['compass', 'gps', 'wind']
},
  target: 0.326
  mode: 'compass'
  state: 'auto'
  engaged: true
}
```

---
**`getState(deviceId)`**: This method returns the current state of the supplied autopilot device identifier. If the autopilot device is not connected or unreachable then `off-line` should be returned.

- `deviceId:` identifier of the autopilot device to query.

returns: `Promise<{string}>`

_Example:_
```javascript
// API request
GET /signalk/v2/api/vessels/self/autopilots/mypilot1/state

// AutopilotProvider method invocation
getState('mypilot1');

// Returns:
'auto'
```

---
**`setState(state, deviceId?)`**: This method sets the autopilot device with the supplied identifier to the supplied state value.

- `state:` state value to set. Must be a valid state value.
- `deviceId:` identifier of the autopilot device to query.

returns: `Promise<{void}>`

throws on error or if supplied state value is invalid.

_Example:_
```javascript
// API request
PUT /signalk/v2/api/vessels/self/autopilots/mypilot1/state {value: "standby"}

// AutopilotProvider method invocation
setState('standby', 'mypilot1');
```

---
**`getMode(deviceId)`**: This method returns the current mode of the supplied autopilot device identifier.

- `deviceId:` identifier of the autopilot device to query.

returns: `Promise<{string}>`

_Example:_
```javascript
// API request
GET /signalk/v2/api/vessels/self/autopilots/mypilot1/mode

// AutopilotProvider method invocation
getMode('mypilot1');

// Returns:
'compass'
```

---
**`setMode(mode, deviceId)`**: This method sets the autopilot device with the supplied identifier to the supplied mode value.

- `mode:` mode value to set. Must be a valid mode value.
- `deviceId:` identifier of the autopilot device to query.

returns: `Promise<{void}>`

throws on error or if supplied mode value is invalid.

_Example:_
```javascript
// API request
PUT /signalk/v2/api/vessels/self/autopilots/mypilot1/mode {value: "gps"}

// AutopilotProvider method invocation
setMode('gps', 'mypilot1');
```

---
**`setTarget(value, deviceId)`**: This method sets target for the autopilot device with the supplied identifier to the supplied value.

- `value:` target value in radians.
- `deviceId:` identifier of the autopilot device to query.

returns: `Promise<{void}>`

throws on error or if supplied target value is outside the valid range.

_Example:_
```javascript
// API request
PUT /signalk/v2/api/vessels/self/autopilots/mypilot1/target {value: 129}

// AutopilotProvider method invocation
setTarget(129, 'mypilot1');
```

---
**`adjustTarget(value, deviceId)`**: This method adjusts target for the autopilot device with the supplied identifier by the supplied value.

- `value:` value in radians to add to current target value.
- `deviceId:` identifier of the autopilot device to query.

returns: `Promise<{void}>`

throws on error or if supplied target value is outside the valid range.

_Example:_
```javascript
// API request
PUT /signalk/v2/api/vessels/self/autopilots/mypilot1/target {value: 2}

// AutopilotProvider method invocation
adjustTarget(2, 'mypilot1');
```

---
**`engage(deviceId)`**: This method sets the state of the autopilot device with the supplied identifier to a state that is actively steering the vessel.

- `deviceId:` identifier of the autopilot device to query.

returns: `Promise<{void}>`

throws on error.

_Example:_
```javascript
// API request
POST /signalk/v2/api/vessels/self/autopilots/mypilot1/engage

// AutopilotProvider method invocation
engage('mypilot1');
```

---
**`disengage(deviceId)`**: This method sets the state of the autopilot device with the supplied identifier to a state that is NOT actively steering the vessel.

- `deviceId:` identifier of the autopilot device to query.

returns: `Promise<{void}>`

throws on error.

_Example:_
```javascript
// API request
POST /signalk/v2/api/vessels/self/autopilots/mypilot1/disengage

// AutopilotProvider method invocation
disengage('mypilot1');
```

---
**`tack(direction, deviceId)`**: This method instructs the autopilot device with the supplied identifier to perform a tack in the supplied direction.

- `direction`: 'port' or 'starboard'
- `deviceId:` identifier of the autopilot device to query.

returns: `Promise<{void}>`

throws on error.

_Example:_
```javascript
// API request
POST /signalk/v2/api/vessels/self/autopilots/mypilot1/tack/port

// AutopilotProvider method invocation
tack('port', 'mypilot1');
```

---
**`gybe(direction, deviceId)`**: This method instructs the autopilot device with the supplied identifier to perform a gybe in the supplied direction.

- `direction`: 'port' or 'starboard'
- `deviceId:` identifier of the autopilot device to query.

returns: `Promise<{void}>`

throws on error.

_Example:_
```javascript
// API request
POST /signalk/v2/api/vessels/self/autopilots/mypilot1/gybe/starboard

// AutopilotProvider method invocation
gybe('starboard', 'mypilot1');
```

---
**`dodge(value, deviceId)`**: This method instructs the autopilot device with the supplied identifier to enter / exit dodge mode and alter the current course by the supplied value (radians) direction.

- `value`: +/- value in radians 'port (-ive)' or 'starboard' to change direction. _Setting the value to `null` indicates exit of dodge mode._
- `deviceId:` identifier of the autopilot device to query.

returns: `Promise<{void}>`

throws on error.


To address different pilot behaviour, the `dodge` function can be used in the following ways:



**1. Enter dodge mode at the current course**
```javascript
// API request
POST /signalk/v2/api/vessels/self/autopilots/mypilot1/dodge

// _AutopilotProvider method invocation
dodge(0, 'mypilot1');
```

**2. Enter dodge mode and change course**
```javascript
// API request
PUT /signalk/v2/api/vessels/self/autopilots/mypilot1/dodge {"value": 5}

// AutopilotProvider method invocation
dodge(5, 'mypilot1');
```

**3. Cancel dodge mode**
```javascript
// API request
DELETE /signalk/v2/api/vessels/self/autopilots/mypilot1/dodge

// AutopilotProvider method invocation
dodge(null, 'mypilot1');
```

---

### Unhandled Operations

A provider plugin **MUST** implement **ALL** Autopilot API interface methods, regardless of whether the operation is supported or not.

For an operation that is not supported by the autopilot device, then the plugin should `throw` an exception.

_Example:_
```typescript
{
    // unsupported operation method definition
    gybe: async (d, id) => {
        throw new Error('Unsupprted operation!)
    }
}
```
