# Autopilot Provider plugins

_This document should be read in conjunction with the [SERVER PLUGINS](./server_plugin.md) document as it contains additional information regarding the development of plugins that implement the Signal K Autopilot API._

---

## Overview

The Signal K Autopilot API defines endpoints under the path `/signalk/v2/api/vessels/self/steering/autopilot` providing a way for all Signal K clients to perform common autopilot operations independent of the autopilot device in use. The API is defined in an [OpenAPI](/doc/openapi/?urls.primaryName=autopilot) document.

Unlike other APIs _(i.e. course, resources)_, Autopilot API operations are implemented by a `plugin`, the Signal K Server provides only the OpenAPI definition and request checking.

Requests made to the Autopilot API are received by the Signal K Server, where they are validated and an authorisation check performed, before being passed on to a **provider plugin** to complete the operation.

This approach enables the server to perform the necessary actions to ensure interoperability and reliabilty, whilst providing flexibility to cater for the specific features of devices without the need for a server update.

The plugin is responsible for ensuring its operation is aligned with both the OpenAPI definition and the [Operation](#operation) section below.


## Autopilot Provider Plugin

Autopilot API request are passed to a **provider plugin** which will process and action the request facilitating communication with the autopilot device.

Additionally the **provider plugin** can provide a Web App to deliver a UI to provide access to specific features of the autopilot device. 

The following diagram provides an overview of the Autopilot API architectue.


<img src="../../img/autopilot_provider.svg" width="600px">

_Autopilot API architecture_


To ensure reliable operation for all Signal K client apps, the Autopilot Provider plugin MUST:
- Implement the Autopilot API in accordance with the OpenAPI definition, including route handlers for ALL Autopilot API endpoints
- Accept requests made to these endpoints including all parameters and values as per the Autopilot API definition
- Provide responses in accordance with the Autopilot API OpenAPI definition
- Facilitate communication on the target autopilot device to send commands and retrieve both status and configuration information
- Ensure the following `steering/autopilot/` sub-path values are maintained: 
    - `active` _(boolean value set to `true` if autopilot is engaged and steering the vessel)_
    - `state` _(text value containing the device state)_
    - `mode` _(text value containing the current device operating mode)_
    - `target` _(number indicating the set target value based on the selected `mode`)_


## Operation

### Autopilot Options

Autopilot device models from differnet manifacturers will likely have different `states` and `modes` of operation. To ensure that a client app can represent the valid states and modes, the **provider plugin** MUST return these values in the response to a `steering/autopilot` endpoint request.

```
HTTP GET "steering/autopilot"
```
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

_**If the client submits a request containing an invalid value an error response should be returned.**_

_Example: Set the autopilot `mode:`_
```
HTTP PUT "steering/autopilot/mode" {value: "compass"}
``` 
_Example: Set the autopilot `state:`_
```
HTTP PUT "steering/autopilot/state" {value: "enabled"}
``` 

### Autopilot State

Autopilot state refers to whether or not the autopilot is actively and steering the vessel.

As autopilot devices and models will have a different number of states and labels, the Autopilot API provides the `steering/autopilot/active` path to insulate a client app from needing specific knowledge about the autopilot device in use. The client app can query the value of this path to determine whether or not the autopilot is engaged.

The **provider plugin** MUST set the value of `steering/autopilot/active` to:
- `true` when the selected state indicates that the autopilot is engaged and actively steering the vessel
- `false` when the selected state indicates that the autopilot is disengaged and not steering the vessel.

_**Note: It is the responsibility of the provider plugin to equate the available `state` options to whether the autopilot is `active` or not and set the path value accordingly.**_

To illustrate the expected behaviour consider an autopilot device with the following states: _off / standby / auto_ where _auto_ is the only state where the autopilot is actively steering the vessel.

#### 1. Engaging the Autopilot

To engage the autopilot and set the value `steering.autopilot.active` to `true`, issue one of the following requests:

1. Specifically set the desired `state` 
```
HTTP PUT "steering/autopilot/state" {value: "auto"}
```

2. The plugin determines `state` value to set
```
HTTP POST "steering/autopilot/engage"
``` 
_Result:_
```JSON
{
    "steering": {
        "autopilot": {
            "active": true,
            "state": "auto"
        }
    }
}
```

#### 2. Disengaging the Autopilot

To disengage the autopilot and set the value `steering.autopilot.active` to `false`, issue one of the following requests:

1. Specifically set the desired `state` 
```
HTTP PUT "steering/autopilot/state" {value: "standby"}
```

2. The plugin determines `state` value to set
```
HTTP POST "steering/autopilot/disengage"
```
_Result:_
```JSON
{
    "steering": {
        "autopilot": {
            "active": false,
            "state": "standby"
        }
    }
}
```

### Maintaining the Signal K Data Model

The Signal K data model is updated by sending `delta` messages to the relevant `steering.autopilot` sub-paths.

Maintaining these paths will help ensure the reliable operation of all connected clients.

It is the responsibility to the **provider plugin** to ensure that, at a minimum, the following paths have valid values:
```
{ 
    "steering": {
        "autopilot": {
            "state": <valid state option>,
            "mode": <valid mode option>,
            "target": <valid numeric value for the selected mode>,
            "active": <true or false>
        }
    }
}
```

### Unhandled Operations

A **provider plugin** MUST handle requests to ALL Autopilot API endpoints, regardless of whether the operation is supported or not.

If a request is submitted for an operation that is not supported by the autopilot device, then the plugin should return a `501 Not Implemented` response.

_Example:_
```JSON
{ 
    "statusCode": 501,
    "state": "COMPLETED",
    "message": "Not Implemented",
}
```
