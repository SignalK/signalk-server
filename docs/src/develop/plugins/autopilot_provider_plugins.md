# Autopilot Provider plugins

_This document should be read in conjunction with the [SERVER PLUGINS](./server_plugin.md) document as it contains additional information regarding the development of plugins that implement the Signal K Autopilot API._

---

## Overview

The Signal K Autopilot API defines endpoints under the path `/signalk/v2/api/vessels/self/steering/autopilot` providing a way for all Signal K clients to perform common autopilot operations independent of the autopilot device in use. The API is defined in an [OpenAPI](/doc/openapi/?urls.primaryName=autopilot) document.

Requests made to the Autopilot API are received by the Signal K Server, where they are validated and an authorisation check performed, before being passed on to a **provider plugin** to action the request on the autopilot device.

This de-coupling of request handling and autopilot communication provides the flexibility to support a variety of autopilot devices and ensures interoperability and reliabilty.


## Autopilot Provider Plugin

Autopilot API requests are passed to a **provider plugin** which will process and action the request facilitating communication with the autopilot device.

The following diagram provides an overview of the Autopilot API architectue.


<img src="../../img/autopilot_provider.svg" width="600px">

_Autopilot API architecture_


To ensure reliable operation for all Signal K client apps, the Autopilot Provider plugin MUST:
- Implement all Autopilot API interface methods.
- Facilitate communication on the target autopilot device to send commands and retrieve both status and configuration information
- Map autopilot states to support `engage` and `disengage` operations and maintain the `engaged` path attribute. 


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
    "state":[
        {"name":"enabled","engaged":true}, 
        {"name":"disabled","engaged":false}
    ],
    "mode":["gps","compass","wind"]
  },
  "state":"disabled",
  "mode":"gps",
  "target": 0,
  "engaged": false
}
```
As per the example above, the `options` attribute contains the available values that can be supplied for both `state` and `mode`.

The listed `state` options also indicate whether the autopilot is `engaged` and activley steering the vessel when in that state.

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

As autopilot devices and models will have a different number of states and labels, the available state options indicate whether the autopilot is `enaged` when in that state.

To illustrate the expected behaviour consider an autopilot device with the following states: _off / standby / auto_ where _auto_ is the only state where the autopilot is actively steering the vessel.

#### 1. Engaging the Autopilot

To engage the autopilot, issue one of the following requests:

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
            "engaged": true,
            "state": "auto",
            ...
        }
    }
}
```

#### 2. Disengaging the Autopilot

To disengage the autopilot and set the value `steering.autopilot.engaged` to `false`, issue one of the following requests:

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
            "engaged": false,
            "state": "standby"
            ...
        }
    }
}
```

### Unhandled Operations

A **provider plugin** MUST implement ALL Autopilot API interface methods, regardless of whether the operation is supported or not.

For an operation that is not supported by the autopilot device, then the plugin should `throw` an exception.

_Example:_
```typescript
{ 
    // unsupported operation method definition
    gybe: async (d) => {
        throw new Error('Unsupprted operation!)
    }
}
```
