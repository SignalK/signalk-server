# Signal K Resources Provider Plugin:

__Signal K server plugin that implements the Resource Provider API__.

_Note: This plugin should ONLY be installed on a Signal K server that implements the `Resources API`!_

---

This plugin is a resource provider, facilitating the storage and retrieval of the following resource types defined by the Signal K specification:
- `resources/routes`
- `resources/waypoints`
- `resources/notes`
- `resources/regions`   

as well as providing the capability to serve custom resource types provisioned as additional paths under `/signalk/v2/api/resources`.

- _example:_ `/signalk/v2/api/resources/fishingZones`   

Each path is provisioned with `GET`, `PUT`, `POST` and `DELETE` operations enabled.

Operation of all paths is as set out in the OpenAPI resources definition available in the Signal K server Admin console.


---
## Installation and Configuration:

Signal K server v2 includes this plugin as part of the installation / upgrade process.

By default the plugin is enabled with all standdard resource types enabled.

1. `(optional)` De-select any resource types you want to disable.

1. `(optional)` Specify any custom resource paths you require.
1. Click __Submit__ 

![image](https://user-images.githubusercontent.com/38519157/227807566-966a5640-87e1-4db8-a7f2-aadf06deb3f3.png)

---

## Data Storage:

Resources are stored in the server's filesystem under the path `~/.signalk/plugin-config-data/resources-provider/resources`.

A separate file is created for each resource with a name that reflects the resources `id`.

Each resource is created within a folder allocated to that specific resource type. 

_Example:_
```
~/.signalk
    /resources
        /routes
            ...
        /waypoints
            ...
        /notes
            ...
        /regions
            ...
        /my_custom_type
            ...
```


---
## Use and Operation:

Once configured, the plugin registers itself as the resource provider for each of the enabled resource types and the Signal K server will pass all _HTTP GET, POST, PUT and DELETE_ requests to the plugin.

---

_For further information about working with resources please refer to the [Signal K specification](https://signalk.org/specification) and  [Signal K Server documentation](https://github.com/SignalK/signalk-server#readme)._


