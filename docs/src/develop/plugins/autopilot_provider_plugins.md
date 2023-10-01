# Autopilot Provider plugins

_This document should be read in conjunction with the [SERVER PLUGINS](./server_plugin.md) document as it contains additional information regarding the development of plugins that implement the Signal K Autopilot API._

---

## Overview

The Signal K Autopilot API defines endpoints under the path `/signalk/v2/api/vessels/self/steering/autopilot` to provide a means for all Signal K clients to perform common autopilot operations independent of the autopilot device in use. The API is defined in an OpenAPI document.

Unlike other APIs _(i.e. course, resources)_ the Autopilot API implemented by a `plugin` and not by the Signal K Server.

Requests made to the Autopilot API pass through the Signal K Server, where they are validated and an authorisation check performed, before being passed through to a **provider plugin** to complete the operation.

This approach enables the server to perform the necessary actions to ensure interoperability and reliabilty, whilst providing flexibility to cater for the specific features of devices without the need for a server update.

The plugin takes on the responsibility for aligning its operation with the OpenAPI definition and operational specification.


## Autopilot Provider Plugin

A **provider plugin** manages communication with the autopilot device and MUST implement the Autopilot API in accordance with its definition. It also is responsible for emitting deltas to ensure the Signal K data model is populated so that autopilot related paths remain consistent.

<img src="../../img/autopilot_provider.svg" width="600px">


An Autopilot Provider  plugin MUST:
- Implement route handlers for ALL Autopilot API endpoints uder `/signalk/v2/api/vessels/self/steering/autopilot`
- Accept requests made to these endpoints including all parameters and values as per the Autopilot API definition
- Facilitate operations on the target autopilot device, including communication with the device, sending commands and retrieving information.
- Provide responses in accordance with the Autopilot API definition
- Ensure the following Signal K data model path values are maintained: `steering/autopilot/`
    - `active` (boolean value set to `true` if autopilot is engaged and steering the vessel)
    - `state` (text value containing the device state)
    - `mode` (text value containing the current device operating mode)
    - `target` (number indicating the set target value based on the selected `mode`)


### Operation

#### Autopilot State

Autopilot state refers to the operational state of the device which indicates whether the autopilot is `active` (steering the vessel) or not.

Different autopilot devices will have a varied number of states and associated labels. For example:
- enabled / disabled
- off / standby / auto

To insulate a Signal K client from having to know about the autopilot device in use, the Autopilot API requires that the plugin set `steering/autopilot/active` value to `true` when the selected state indicates that the autopilot is engaged. The value should be set to `false` when the autopilot is disengaged and not steering the vessel.

The value of `active` can be directly related to the `steering/autopilot/engage` and `steering/autopilot/disengage` operations. 

_**It is the responsibility of the provider plugin to equate the available `state` options to whether the autopilot is engaged or not and set the value of `active` accordingly.**_

To illustrate the expected behaviour consider an autopilot device with the following states: _off / standby / auto_ where _auto_ is the only state where the autopilot is actively steering the vessel.

The following API requests should set `steering.autopilot.active` to `true`.
```
POST "steering/autopilot/engage"
OR
PUT "steering/autopilot/state" {value: "auto"}
``` 
_Result:_
```
steering.autopilot.active: {value: true}
```

The following API requests should set `steering.autopilot.active` to `false`.
```
POST "steering/autopilot/disengage"
OR
PUT "steering/autopilot/state" {value: "standby"}
```
_Result:_
```
steering.autopilot.active: {value: false}
```

#### Options

As stated previously, different autopilot devices will make available different `states` and `modes` of operation. To ensure that the client app can represent the valid states and modes, the provider plugin must return these values in the response to a request to the `steering/autopilot` endpoint.

_Example response:_
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
As per the example above, the `options` attribute contains the available values that can be supplied for both `state` and `mode`.

The client app can then use these values when making a request to the associated API endpoint.

_**If the client supplies a request containing and invalid value and error response should be returned.**_

_Example: Set the autopilot `mode:`_
```
PUT "steering/autopilot/mode" {value: "compass"}
``` 
_Example: Set the autopilot `state:`_
```
PUT "steering/autopilot/state" {value: "enabled"}
``` 

#### Maintaining the Signal K Data Model

The Signal K data model is updated by sending delta messages to the relevant paths.
It is the responsibility to the provider plugin to ensure that, at a minimum, the following paths have valid values:
```JSON
{ 
    "steering": {
        "autopilot": {
            "state": "disabled",
            "mode": "gps",
            "target": 0.65723456,
            "active": false
        }
    }
}
```

Maintaining these paths will ensure reliable operation of all connected clients.


#### Unhandled Operations

A provider plugin MUST handle requests to ALL Autopilot API endpoints regardless of whether the operation is supported or not.

If an operation is not supported by the autopilot device then the plugin should return a response with a status of `501 Not Implemented`.

_Example:_
```JSON
{ 
    "statusCode": 501,
    "state": "COMPLETED",
    "message": "Not Implemented",
    }
}
```
