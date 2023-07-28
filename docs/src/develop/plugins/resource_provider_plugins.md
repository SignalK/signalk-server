# Resource Provider plugins


## Overview

The SignalK server _Resource API_ provides a common set operations for clients to interact with routes, waypoints, charts, etc but it does NOT provide the ability to persist or retrieve resources to / from storage.

This functionality needs to be provided by one or more server plugins that interface with the _Resource API_ to facilitate the storage and retrieval of resource data.

These plugins are called __Provider Plugins__.

_Resource API architecture:_
<img src="../../img/resource_provider.svg" width="275"/>


This de-coupling of request handling and data storage provides the flexibility to persist resource data in a variety of different storage types as well as Internet based services.


_Note: Signal K server comes with the [resources-provider-plugin](https://github.com/SignalK/signalk-server/tree/master/packages/resources-provider-plugin) pre-installed which persists resource data to the local file system._


### Resources API:

The _Resources API_ handles all client requests received via the `/signalk/v2/api/resources` path, before passing on the request to registered provider plugin(s). 

The _Resources API_ performs the following operations when a request is received:
1. Checks for registered provider(s) for the resource type _(i.e. route, waypoint, etc.)_
1. Checks that the required ResourceProvider methods are defined for the requested operation _(i.e. POST, PUT, GET, DELETE)_
1. Performs an access control check
1. `POST` and `PUT` requests for __Standard__ _(Signal K defined)_ resource types are checked for validity of the submitted:
  - `resource id`
  - `resource data` against the OpenAPI definition.

Only after successful completion of all these operations is the request passed on to the registered provider plugin(s).

---

## Provider plugins:

A resource provider plugin is a Signal K server plugin that implements the **Resource Provider Interface** which:
- Tells server the resource type(s) provided for by the plugin _(i.e. route, waypoint, etc.)_
- Registers the methods used to action requests passed from the server and perform the writing, retrieval and deletion of resources from storage.

Note: multiple providers can be registered for a resource type _(e.g. 2 x chart providers)_

The `ResourceProvider` interface is defined as follows in _`@signalk/server-api`_:

```typescript
interface ResourceProvider {
  type: ResourceType
  methods: ResourceProviderMethods
}
```
where:

- `type`: The resource type provided for by the plugin. These can be either __Standard__ _(Signal K defined)_ or __Custom__ _(user defined)_ resource types _(e.g. `'routes'`, `'fishingZones'`)_ 

- `methods`: An object implementing the `ResourceProviderMethods` interface defining the functions to which resource requests are passed by the SignalK server. _Note: The plugin __MUST__ implement each method, even if that operation is NOT supported by the plugin!_

The `ResourceProviderMethods` interface is defined as follows in _`@signalk/server-api`_:

```typescript
interface ResourceProviderMethods {
  listResources: (query: { [key: string]: any }) => Promise<{[id: string]: any}>
  getResource: (id: string, property?: string) => Promise<object>
  setResource: (
    id: string,
    value: { [key: string]: any }
  ) => Promise<void>
  deleteResource: (id: string) => Promise<void>
}
```


_**Note: The Resource Provider is responsible for implementing the methods and returning data in the required format!**_


### Provider Methods:

**`listResources(query)`**: This method is called when a request is made for resource entries that match a specific criteria.

_Note: It is the responsibility of the resource provider plugin to filter the resources returned as per the supplied query parameters._

- `query:` Object contining `key | value` pairs repesenting the parameters by which to filter the returned entries. _e.g. {region: 'fishing_zone'}_

returns: `Promise<{[id: string]: any}>`


_Example: Return waypoints within the bounded area with lower left corner at E5.4 N25.7 & upper right corner E6.9 & N31.2:_ 
```
GET /signalk/v2/api/resources/waypoints?bbox=[5.4,25.7,6.9,31.2]
```
_ResourceProvider method invocation:_
```javascript
listResources(
  {
    bbox: '5.4,25.7,6.9,31.2'
  }
);
```

_Returns:_
```JSON
{
  "07894aba-f151-4099-aa4f-5e5773734b69": {
    "name":"my Point",
    "description":"A Signal K waypoint",
    "distance":124226.65183615577,
    "feature":{
      "type":"Feature",
      "geometry":{
        "type":"Point",
        "coordinates":[5.7,26.4]
      },
      "properties":{}
    },
    "timestamp":"2023-01-01T05:02:54.561Z",
    "$source":"resources-provider"
  },
  "0c894aba-d151-4099-aa4f-be5773734e99": {
    "name":"another point",
    "description":"Another Signal K waypoint",
    "distance":107226.84,
    "feature":{
      "type":"Feature",
      "geometry":{
        "type":"Point",
        "coordinates":[6.1,29.43]
      },
      "properties":{}
    },
    "timestamp":"2023-01-01T05:02:54.561Z",
    "$source":"resources-provider"
  }
}
```

---

**`getResource(id, property?)`**: This method is called when a request is made for a specific resource entry with the supplied `id`. If `property` is supplied then the value of the resource property is returned. If there is no resource associated with the id the call should return Promise.reject.

- `id`: String containing the target resource entry id. _(e.g. '07894aba-f151-4099-aa4f-5e5773734b99')_
- `property` (optional):  Name of resource property for which to return the value (in dot notation). _e.g. feature.geometry.coordinates_

returns: `Promise<object>`

_Example resource request:_ 
```
GET /signalk/v2/api/resources/routes/07894aba-f151-4099-aa4f-5e5773734b99
```
_ResourceProvider method invocation:_
```javascript
getResource(
  '07894aba-f151-4099-aa4f-5e5773734b99'
);
```

_Returns:_
```JSON
{
  "name":"myRoute",
  "description":"A Signal K route",
  "distance":124226.65183615577,
  "feature":{
    "type":"Feature",
    "geometry":{
      "type":"LineString",
      "coordinates":[[-8,-8],[-8.5,-8],[-8.5,-8.4],[-8.7,-8.3]]
    },
    "properties":{}
  },
  "timestamp":"2023-01-01T05:02:54.561Z",
  "$source":"resources-provider"
}
```

_Example resource property value request:_ 
```
GET /signalk/v2/api/resources/routes/07894aba-f151-4099-aa4f-5e5773734b99/feature/geometry/type
```
_ResourceProvider method invocation:_
```javascript
getResource(
  '07894aba-f151-4099-aa4f-5e5773734b99',
  'feature.geometry.type'
);
```

_Returns:_
```JSON
{
  "value": "LineString",
  "timestamp":"2023-01-01T05:02:54.561Z",
  "$source":"resources-provider"
}
```

---

**`setResource(id, value)`**: This method is called when a request is made to save / update a resource entry with the supplied id. The supplied data is a complete resource record.

- `id:` String containing the id of the resource entry created / updated. _e.g. '07894aba-f151-4099-aa4f-5e5773734b99'_

- `value:` Resource data to be stored.

returns: `Promise<void>`

_Example PUT resource request:_ 
```
PUT /signalk/v2/api/resources/routes/07894aba-f151-4099-aa4f-5e5773734b99 {resource_data}
```
_ResourceProvider method invocation:_

```javascript
setResource(
  '07894aba-f151-4099-aa4f-5e5773734b99',
  {
    name: 'test route', 
    distance': 8000, 
    feature: {
      type: 'Feature', 
      geometry: {
        type: 'LineString',
        coordinates: [[138.5, -38.6], [138.7, -38.2], [138.9, -38.0]]
      },
      properties:{}
    }
  }
);
```

_Example POST resource request:_ 
```
POST /signalk/v2/api/resources/routes {resource_data}
```
_ResourceProvider method invocation:_

```javascript
setResource(
  '<server_generated_id>',
  {
    name: 'test route', 
    distance': 8000, 
    feature: {
      type: 'Feature', 
      geometry: {
        type: 'LineString',
        coordinates: [[138.5, -38.6], [138.7, -38.2], [138.9, -38.0]]
      },
      properties:{}
    }
  }
);
```

---

**`deleteResource(id)`**: This method is called when a request is made to remove the specific resource entry with the supplied resource id.

- `id:` String containing the target resource entry id. _e.g. '07894aba-f151-4099-aa4f-5e5773734b99'_

returns: `Promise<void>`

_Example resource request:_ 
```
DELETE /signalk/v2/api/resources/routes/07894aba-f151-4099-aa4f-5e5773734b99
```
_ResourceProvider method invocation:_

```javascript
deleteResource(
  '07894aba-f151-4099-aa4f-5e5773734b99'
);
```

---

### Registering as a Resource Provider:

To register a plugin as a provider for one or more resource types with the SignalK server, it must call the server's `registerResourceProvider` function for each resource type being serviced during plugin startup. 

The function has the following signature:

```typescript
app.registerResourceProvider(resourceProvider: ResourceProvider)
```
where:
- `resourceProvider`: is a reference to a `ResourceProvider` object containing the __resource type__ and __methods__ to receive the requests.

_Note: More than one plugin can be registered as a provider for a resource type._

_Example: Plugin registering as a routes & waypoints provider._
```javascript
import { ResourceProvider } from '@signalk/server-api'

module.exports = function (app) {

  const plugin = {
    id: 'mypluginid',
    name: 'My Resource Providerplugin'
  }

  const routesProvider: ResourceProvider = {
      type: 'routes',
      methods: {
        listResources: (params) => { 
          fetchRoutes(params)
          ... 
        },
        getResource: (id, property?) => { 
          getRoute(id, property)
          ... 
        },
        setResource: (id, value )=> { 
          saveRoute(id, value)
          ... 
        },
        deleteResource: (id) => { 
          deleteRoute(id, value)
          ...
        }
      }
    }

  const waypointsProvider: ResourceProvider = {
      type: 'waypoints',
      methods: {
        listResources: (params) => { 
          fetchWaypoints(params)
          ... 
        },
        getResource: (id, property?) => { 
          getWaypoint(id, property)
          ... 
        },
        setResource: (id, value )=> { 
          saveWaypoint(id, value)
          ... 
        },
        deleteResource: (id) => { 
          deleteWaypoint(id, value)
          ...
        }
      }
    }

  plugin.start = function(options) {
    ...
    try {
      app.registerResourceProvider(routesProvider)
      app.registerResourceProvider(waypointsProvider)
    }
    catch (error) {
      // handle error
    }
  }

  return plugin
}
```

### Methods 

A Resource Provider plugin must implement ALL methods to service the requests passed from the server.

Each method should return a __Promise__ on success and `throw` on error, if a request is not serviced or is not implemented.

_Example:_
```javascript
// SignalK server plugin 
module.exports = function (app) {

  const plugin = {
    id: 'mypluginid',
    name: 'My Resource Providerplugin',
    start: options => { 
      ... 
      app.registerResourceProvider({
        type: 'waypoints',
        methods: {
          listResources: (params) => { 
            return new Promise( (resolve, reject) => {
              ...
              if (ok) {
                resolve(resource_list)
              } else {
                reject( new Error('Error fetching resources!'))
              }
            })
          },
          getResource: (id, property?) => { 
            return new Promise( (resolve, reject) => {
              ...
              if (ok) {
                resolve(resource_list)
              } else {
                reject( new Error('Error fetching resource with supplied id!'))
              }
            })
          },
          setResource: (id, value )=> { 
            throw( new Error('Not implemented!')) 
          },
          deleteResource: (id) => { 
            throw( new Error('Not implemented!')) 
          }
        }
      })
    }

  }
}
```
