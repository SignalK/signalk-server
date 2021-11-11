# Resource Provider plugins

## Overview

This document should be read in conjunction with [SERVERPLUGINS.md](./SERVERPLUGINS.md) as it contains additional information regarding the development of plugins that facilitate the storage and retrieval of resource data (e.g. routes, waypoints, notes, regions and charts).

The Signal K Node server will handle all requests to the following paths:

`/signalk/v1/api/resources`
`/signalk/v1/api/resources/routes`
`/signalk/v1/api/resources/waypoints`
`/signalk/v1/api/resources/notes`
`/signalk/v1/api/resources/regions`
`/signalk/v1/api/resources/charts`

This means all requests (GET, PUT, POST and DELETE) are captured and any supplied data is validated prior to being dispatched for processing.

The server itself has no built-in functionality to save or retrieve resource data from storage, this is the responsibility of a `resource provider plugin`.

If there are no registered providers for the resource type for which the request is made, then no action is taken.

This architecture de-couples the resource storage from core server function to provide flexibility to implement the appropriate storage solution for the various resource types for your Signal K implementation.

## Resource Providers

A `resource provider plugin` is responsible for the storage and retrieval of resource data.
This allows the method for persisting resource data to be tailored to the Signal K implementation e.g. the local file system,  a database service, cloud service, etc.

It is similar to any other Server Plugin except that it implements the __resourceProvider__ interface.

```JAVASCRIPT
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

This interface exposes the following information to the server enabling it to direct requests to the plugin:
- `types`: The resource types for which requests should be directed to the plugin. These can be one or all of `routes, waypoints, notes, regions, charts`.
- `methods`: The methods to which the server dispatches requests. The plugin will implement these methods to perform the necessary save or retrieval operation. 

_Example: Plugin acting as resource provider for routes & waypoints._
```JAVASCRIPT
let plugin= {
    id: 'mypluginid',
    name: 'My Resource Providerplugin',
    start: (options, restart)=> { ... },
    stop: ()=> { ... },
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
```

### Methods:

The Server will dispatch requests to `/signalk/v1/api/resources/<resource_type>` to the methods defined in the resourceProvider interface.

Each method must have a signature as defined in the interface and return a `Promise` containing the resource data or `null` if the operation was unsuccessful. 

---
`GET` requests that are not for a specific resource will be dispatched to the `listResources` method passing the resource type and query data as parameters.

Returns: Object listing resources by id.

_Example: List all routes._
```JAVASCRIPT
GET /signalk/v1/api/resources/routes

listResources('routes', {})

returns {
  "resource_id1": { ... },
  "resource_id2": { ... },
  ...
  "resource_idn": { ... }
}
```

_Example: List routes within the bounded area._
```JAVASCRIPT
GET /signalk/v1/api/resources/routes?bbox=5.4,25.7,6.9,31.2

listResources('routes', {bbox: '5.4,25.7,6.9,31.2'})

returns {
  "resource_id1": { ... },
  "resource_id2": { ... }
}
```

`GET` requests for a specific resource will be dispatched to the `getResource` method passing the resource type and id as parameters.

Returns: Object containing resourcesdata.

_Example: Retrieve route._
```JAVASCRIPT
GET /signalk/v1/api/resources/routes/urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a

getResource('routes', 'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a')

returns {
  "name": "route name",
  ...
  "feature": { ... }
}
```
---

`PUT` requests for a specific resource will be dispatched to the `setResource` method passing the resource type, id and resource data as parameters.

Returns: `true` on success, `null` on failure.

_Example: Update route data._
```JAVASCRIPT
PUT /signalk/v1/api/resources/routes/urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a {resource data}

setResource('routes', 'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a', <resource_data>)
```

`POST` requests will be dispatched to the `setResource` method passing the resource type, a generated id and resource data as parameters.

Returns: `true` on success, `null` on failure.

_Example: New route._
```JAVASCRIPT
POST /signalk/v1/api/resources/routes/ {resource data}

setResource('routes', 'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a', <resource_data>)
```
---

`DELETE` requests for a specific resource will be dispatched to the `deleteResource` method passing the resource type and id as parameters.

Returns: `true` on success, `null` on failure.

_Example: Delete route._
```JAVASCRIPT
DELETE /signalk/v1/api/resources/routes/urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a {resource data}

deleteResource('routes', 'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a')
```
---

### Plugin Startup:

If your plugin provides the ability for the user to choose which resource types are handled, then the plugin will need to notify the server that the `types` attribute of the `resourceProvider` interface has been modified.

The server exposes `resourcesApi` which has the following method:
```JAVASCRIPT
checkForProviders(rescan:boolean)
```
which can be called within the plugin `start()` function with `rescan= true`.

This will cause the server to `rescan` for resource providers and register the new list of resource types being handled. 

_Example:_
```JAVASCRIPT
module.exports = function (app) {
  let plugin= {
      id: 'mypluginid',
      name: 'My Resource Providerplugin',
      start: (options, restart)=> {
        ...
        setTimeout( ()=> { app.resourcesApi.checkForProviders(true) }, 1000)
        ...
      },
      stop: ()=> { ... },
      ...
  }
}
```

