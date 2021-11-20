# Resource Provider plugins

## Overview

This document should be read in conjunction with [SERVERPLUGINS.md](./SERVERPLUGINS.md) as it contains additional information regarding the development of plugins that facilitate the storage and retrieval of resource data (e.g. routes, waypoints, notes, regions and charts).

Resource storage and retrieval is de-coupled from core server function to provide the flexibility to implement the appropriate resource storage solution for specific Signal K implementations.

The Signal K Node server will pass requests made to the following paths  to registered resource providers:
- `/signalk/v1/api/resources`
- `/signalk/v1/api/resources/routes`
- `/signalk/v1/api/resources/waypoints`
- `/signalk/v1/api/resources/notes`
- `/signalk/v1/api/resources/regions`
- `/signalk/v1/api/resources/charts`

Resource providers will receive request data via a `ResourceProvider` interface which they implement. It is the responsibility of the resource provider to persist resource data in storage (PUT, POST), retrieve the requested resources (GET) and remove resource entries (DELETE).

Resource data passed to the resource provider plugin has been validated by the server and can be considered ready for storage.


## Resource Providers

A `resource provider plugin` is responsible for the storage and retrieval of resource data.

It should implement the necessary functions to:
- Persist each resource with its associated id
- Retrieve an individual resource with the supplied id
- Retrieve a list of resources that match the supplied qery criteria.

Data is passed to and from the plugin via the methods defined in the  __resourceProvider__ interface which the plugin must implement.

_Definition: `resourceProvider` interface._
```javascript
resourceProvider: {
  types: [],
  methods: {
    listResources: (type:string, query: {[key:string]:any})=> Promise<any>
    getResource: (type:string, id:string)=> Promise<any>
    setResource: (type:string, id:string, value:{[key:string]:any})=> Promise<any>
    deleteResource: (type:string, id:string)=> Promise<any>
  }
}
```

This interface is used by the server to direct requests to the plugin. 

It contains the following attributes:
- `types`: An array containing the names of the resource types the plugin is a provider for.  Names of the resource types are: `routes, waypoints, notes, regions, charts`.

- `methods`: The methods to which the server dispatches requests. The plugin will implement these methods to perform the necessary save or retrieval operation. Each method returns a promise containing either resource data or `null` if an error is encountered.

_Example: Plugin acting as resource provider for routes & waypoints._
```javascript
module.exports = function (app) {
  let plugin= {
    id: 'mypluginid',
    name: 'My Resource Providerplugin',
    resourceProvider: {
      types: ['routes','waypoints'],
      methods: {
        listResources: (type, params)=> { 
          return Promise.resolve() { ... }; 
        },
        getResource: (type:string, id:string)=> {
          return Promise.resolve() { ... }; 
        } ,
        setResource: (type:string, id:string, value:any)=> { 
          return Promise.resolve() { ... }; 
        },
        deleteResource: (type:string, id:string)=> {
          return Promise.resolve() { ... }; ; 
        }
      }
    },
    start: (options)=> { 
      ... 
      app.resourceApi.register(this.id, this.resourceProvider);
    },
    stop: ()=> { 
      app.resourceApi.unRegister(this.id, this.resourceProvider.types);
      ... 
    }
  }
}
```

---

### Plugin Startup - Registering the Resource Provider:

To register your plugin as a resource provider the server's `resourcesApi.register()` function should be called within the plugin `start()` function passing the `resourceProvider` interface.

This registers the resource types and the methods with the server so they are called when requests to resource paths are made.

_Example:_
```javascript
module.exports = function (app) {
  let plugin= {
    id: 'mypluginid',
    name: 'My Resource Providerplugin',
    resourceProvider: {
      types: ['routes','waypoints'],
      methods: {
        listResources: (type, params)=> { 
          return Promise.resolve() { ... }; 
        },
        getResource: (type:string, id:string)=> {
          return Promise.resolve() { ... }; 
        } ,
        setResource: (type:string, id:string, value:any)=> { 
          return Promise.resolve() { ... }; 
        },
        deleteResource: (type:string, id:string)=> {
          return Promise.resolve() { ... }; ; 
        }
      }
    }
  }

  plugin.start = function(options) {
    ...
    app.resourcesApi.register(plugin.id, plugin.resourceProvider);
  }
}
```
---

### Plugin Stop - Un-registering the Resource Provider:

When a resource provider plugin is disabled it should un-register as a provider so resource requests are not directed to it. This is done by calling the server's `resourcesApi.unRegister()` function passing `resourceProvider.types` within the plugin's `stop()` function.

_Example:_
```javascript
module.exports = function (app) {
  let plugin= {
    id: 'mypluginid',
    name: 'My Resource Providerplugin',
    resourceProvider: {
      types: ['routes','waypoints'],
      methods: { ... }
    }
  }

  plugin.stop = function(options) {
    ...
    app.resourcesApi.unRegister(plugin.id, plugin.resourceProvider.types);
  }
}
```
---

### Operation:

The Server will dispatch requests made to `/signalk/v1/api/resources/<resource_type>` to the plugin's `resourceProvider.methods` for each resource type listed in `resourceProvider.types`.

Each method defined in the plugin must have a signature as specified in the interface. Each method returns a `Promise` containing the resource data or `null` if an error occurrred. 


### __List Resources:__

`GET` requests that are not for a specific resource will be dispatched to the `listResources` method passing the resource type and any query data as parameters.

It is the responsibility of the resource provider plugin to filter the resources returned as per the supplied query parameters.

`listResources()` should return a JSON object listing resources by id.

_Example: List all routes._
```javascript
GET /signalk/v1/api/resources/routes

listResources('routes', {})

returns {
  "resource_id1": { ... },
  "resource_id2": { ... },
  ...
  "resource_idn": { ... }
}
```

_Example: List waypoints within the bounded area._
```javascript
GET /signalk/v1/api/resources/waypoints?bbox=5.4,25.7,6.9,31.2

listResources('waypoints', {bbox: '5.4,25.7,6.9,31.2'})

returns {
  "resource_id1": { ... },
  "resource_id2": { ... }
}
```

### __Get specific resource:__

`GET` requests for a specific resource will be dispatched to the `getResource` method passing the resource type and id as parameters.

`getResource()` should returns a JSON object containing the resource data.

_Example: Retrieve route._
```javascript
GET /signalk/v1/api/resources/routes/urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a

getResource('routes', 'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a')

returns {
  "name": "Name of the route",
  "description": "Description of the route",
  "distance": 18345,
  "feature": { ... }
}
```

### __Saving Resources:__

`PUT` requests to a path containing the resource id are used to store data associated with the resource id. These will be dispatched to the `setResource` method passing the resource type, id and data as parameters.

`setResource() ` returns `true` on success and `null` on failure.

_Example: Update / add waypoint with the supplied id._
```javascript
PUT /signalk/v1/api/resources/waypoints/urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a {<resource_data>}

setResource('waypoints', 'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a', <waypoint_data>)

returns true | null 
```

`POST` requests to a resource path that do not contina the resource id will be dispatched to the `setResource` method passing the resource type, an id (generated by the server) and resource data as parameters.

`setResource() ` returns `true` on success and `null` on failure.

_Example: New route record._
```javascript
POST /signalk/v1/api/resources/routes {<resource_data>}

setResource('routes', 'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a', <resource_data>)

returns true | null 
```

### __Deleting Resources:__

`DELETE` requests to a path containing the resource id will be dispatched to the `deleteResource` method passing the resource type and id as parameters.

`deleteResource()` returns `true` on success, `null` on failure.

_Example: Delete region with supplied id._
```javascript
DELETE /signalk/v1/api/resources/regions/urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a

deleteResource('regions', 'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a')

returns true | null 
```

