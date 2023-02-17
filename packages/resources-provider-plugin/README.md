# Signal K Resources Provider Plugin:

__Signal K server plugin that implements the Resource Provider API__.

_Note: This plugin should ONLY be installed on a Signal K server that implements the `Resources API`!_

---

This plugin is a resource provider, facilitating the storage and retrieval of the following resource types defined by the Signal K specification:
- `resources/routes`
- `resources/waypoints`
- `resources/notes`
- `resources/regions`   

as well as providing the capability to serve custom resource types provisioned as additional paths under `/signalk/v1/api/resources`.

- _example:_ `resources/fishingZones`   

Each path is provisioned with `GET`, `PUT`, `POST` and `DELETE` operations enabled.

Operation of all paths is as set out in the Signal K specification.


---
## Installation and Configuration:

1. Install the plugin via the Signal K server __AppStore__

1. Re-start the Signal K server to load the plugin. The plugin will be active with all managed resource types enabled.

1. `(optional)` De-select any resource types you want to disable.

1. `(optional)` Specify any custom resource paths you require.

1. By default resources will be stored under the path `~/.signalk/resources`. You can define an alternative path in the plugin configuration screen. The path will be created if it does not exist.  _(Note: The path you enter is relative to the `~/.signalk` folder.)_

1. Click __Submit__ 

![image](https://user-images.githubusercontent.com/38519157/150449889-5049a624-821c-4f33-ba8b-596b6b643d07.png)

---

## Data Storage:

Resources are stored in the server's filesystem under the path entered in the configuration screen.

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


