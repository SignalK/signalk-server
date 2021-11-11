# Resource Provider plugins

<<<<<<< HEAD
_This document should be read in conjunction with [SERVERPLUGINS.md](./SERVERPLUGINS.md) as it contains additional information regarding the development of plugins that facilitate the storage and retrieval of resource data._

---

## Overview

The SignalK specification defines the path `/signalk/v1/api/resources` for accessing resources to aid in navigation and operation of the vessel.

It also defines the schema for the following __Common__ resource types:
- routes
- waypoints
- notes
- regions
- charts

each of with its own path under the root `resources` path _(e.g. `/signalk/v1/api/resources/routes`)_.

It should also be noted that the `/signalk/v1/api/resources` path can also host other types of resource data which can be grouped within a __Custom__ path name _(e.g. `/signalk/v1/api/resources/fishingZones`)_.

The SignalK server does not natively provide the ability to store or retrieve resource data for either __Common__ and __Custom__ resource types.
This functionality needs to be provided by one or more server plugins that handle the data for specific resource types.

These plugins are called __Resource Providers__.

This de-coupling of resource request handling and storage / retrieval provides great flexibility to ensure that an appropriate resource storage solution can be configured for your SignalK implementation.

SignalK server handles requests for both __Common__ and __Custom__ resource types in a similar manner, the only difference being that it does not perform any validation on __Custom__ resource data, so a plugin can act a s a provider for both types.

---
## Server Operation:

The Signal K server handles all requests to `/signalk/v1/api/resources` and all sub-paths, before passing on the request to the registered resource provider plugin.

The following operations are performed by the server when a request is received:
- Checks for a registered provider for the resource type
- Checks that ResourceProvider methods are defined
- For __Common__ resource types, checks the validity of the: 
  - Resource id
  - Submitted resource data.

Upon successful completion of these operations the request will then be passed to the registered resource provider plugin.

---
## Resource Provider plugin:

For a plugin to be considered a Resource Provider it needs to implement the `ResourceProvider` interface.

By implementing this interface the plugin is able to register with the SignalK server the:
- Resource types provided for by the plugin
- Methods to used to action requests. 

It is these methods that perform the retrival, saving and deletion of resources from storage.


### Resource Provider Interface

---
The `ResourceProvider` interface defines the contract between the the Resource Provider plugin and the SignalK server and has the following definition _(which it and other related types can be imported from `@signalk/server-api`)_:

```typescript
interface ResourceProvider: {
  types: string[],
=======
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
>>>>>>> Added Resource_Provider documentation
  methods: {
    listResources: (type:string, query: {[key:string]:any})=> Promise<any>
    getResource: (type:string, id:string)=> Promise<any>
    setResource: (type:string, id:string, value:{[key:string]:any})=> Promise<any>
    deleteResource: (type:string, id:string)=> Promise<any>
  }
}
```
<<<<<<< HEAD
where:

- `types`: An array containing a list of resource types provided for by the plugin. These can be a mixture of both __Common__ and __Custom__ resource types.
- `methods`: An object containing the methods resource requests are passed to by the SignalK server. The plugin __MUST__ implement each method, even if that operation is not supported by the plugin!

#### __Method Details:__

---
__`listResources(type, query)`__: This method is called when a request is made for resource entries of a specific resource type that match a specifiec criteria.

_Note: It is the responsibility of the resource provider plugin to filter the resources returned as per the supplied query parameters._

`type:` String containing the type of resource to retrieve.

`query:` Object contining `key | value` pairs repesenting the parameters by which to filter the returned entries. _e.g. {distance,'50000}_

`returns:` 
- Resolved Promise containing a list of resource entries on completion. 
- Rejected Promise containing an Error if incomplete or not implemented.


_Example resource request:_ 
```
GET /signalk/v1/api/resources/waypoints?bbox=5.4,25.7,6.9,31.2&distance=30000
```
_ResourceProvider method invocation:_

```javascript
listResources(
  'waypoints', 
  {
    bbox: '5.4,25.7,6.9,31.2',
    distance: 30000
  }
);
```

---
__`getResource(type, id)`__: This method is called when a request is made for a specific resource entry of the supplied resource type and id.

`type:` String containing the type of resource to retrieve.

`id:` String containing the target resource entry id. _e.g. 'urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99'_

`returns:` 
- Resolved Promise containing the resource entry on completion. 
- Rejected Promise containing an Error if incomplete or not implemented.

_Example resource request:_ 
```
GET /signalk/v1/api/resources/routes/urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99
```
_ResourceProvider method invocation:_

```javascript
getResource(
  'routes', 
  'urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99'
);
```

---
__`setResource(type, id, value)`__: This method is called when a request is made to save / update a resource entry of the specified resource type, with the supplied id and data.

`type:` String containing the type of resource to store.

`id:` String containing the target resource entry id. _e.g. 'urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99'_

`value:` Resource data to be stored.

`returns:` 
- Resolved Promise containing a list of resource entries on completion.
- Rejected Promise containing an Error if incomplete or not implemented.

_Example PUT resource request:_ 
```
PUT /signalk/v1/api/resources/routes/urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99 {resource_data}
```
_ResourceProvider method invocation:_

```javascript
setResource(
  'routes', 
  'urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99',
  {<resource_data>}
);
```

_Example POST resource request:_ 
```
POST /signalk/v1/api/resources/routes {resource_data}
```
_ResourceProvider method invocation:_

```javascript
setResource(
  'routes', 
  '<server_generated_id>',
  {<resource_data>}
);
```

---
__`deleteResource(type, id)`__: This method is called when a request is made to remove the specific resource entry of the supplied resource type and id.

`type:` String containing the type of resource to delete.

`id:` String containing the target resource entry id. _e.g. 'urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99'_

`returns:`
- Resolved Promise on completion. 
- Rejected Promise containing an Error if incomplete or not implemented.

_Example resource request:_ 
```
DELETE /signalk/v1/api/resources/routes/urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99
```
_ResourceProvider method invocation:_

```javascript
deleteResource(
  'routes', 
  'urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99'
);
```

### Registering a Resource Provider:
---

To register the resource provider plugin with the SignalK server, the server's `resourcesApi.register()` function should be called during plugin startup.

The server `resourcesApi.register()` function has the following signature:

```typescript
app.resourcesApi.register(pluginId: string, resourceProvider: ResourceProvider)
```
where:
- `pluginId`: is the plugin's id
- `resourceProvider`: is a reference to the plugins ResourceProvider interface.

_Note: A resource type can only have one registered plugin, so if more than one plugin attempts to register as a provider for the same resource type, the first plugin to call the `register()` function will be registered by the server for the resource types defined in the ResourceProvider interface!_

_Example:_
```javascript
module.exports = function (app) {

  let plugin= {
    id: 'mypluginid',
    name: 'My Resource Providerplugin',
    resourceProvider: {
      types: ['routes','waypoints'],
      methods: {
        listResources: (type, params)=> { ... },
        getResource: (type:string, id:string)=> { ... } ,
        setResource: (type:string, id:string, value:any)=> { ... },
        deleteResource: (type:string, id:string)=> { ... }
      }
    }
  }

  plugin.start = function(options) {
    ...
    app.resourcesApi.register(plugin.id, plugin.resourceProvider);
  }
}
```

### Un-registering the Resource Provider:
---

When a resource provider plugin is disabled, it should un-register itself to ensure resource requests are no longer directed to it by calling the SignalK server. This should be done by calling the server's  `resourcesApi.unRegister()` function during shutdown.

The server `resourcesApi.unRegister()` function has the following signature:

```typescript
app.resourcesApi.unRegister(pluginId: string)
```
where:
- `pluginId`: is the plugin's id


_Example:_
```javascript
module.exports = function (app) {

  let plugin= {
    id: 'mypluginid',
    name: 'My Resource Providerplugin',
    resourceProvider: {
      types: [ ... ],
      methods: { ... }
    }
  }

  plugin.stop = function(options) {
    app.resourcesApi.unRegister(plugin.id);
    ...
=======

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
>>>>>>> Added Resource_Provider documentation
  }
}
```

<<<<<<< HEAD
---

### __Example:__ 

Resource Provider plugin providing for the retrieval of routes & waypoints.

```javascript
// SignalK server plugin 
module.exports = function (app) {

  let plugin= {
    id: 'mypluginid',
    name: 'My Resource Providerplugin',
    // ResourceProvider interface
    resourceProvider: {
      types: ['routes','waypoints'],
      methods: {
        listResources: (type, params)=> { 
          return new Promise( (resolve, reject) => { 
            // fetch resource entries from storage
            ....
            if(ok) { // success
              resolve({
                'id1': { ... },
                'id2': { ... },
              });
            } else { // error
              reject(new Error('Error encountered!')
            }
          }
        },
        getResource: (type, id)=> {
          // fetch resource entries from storage
          ....
          if(ok) { // success
            return Promise.resolve({
              ...
            }); 
          } else { // error
            reject(new Error('Error encountered!')
          }
        },
        setResource: (type, id, value)=> { 
          // not implemented
          return Promise.reject(new Error('NOT IMPLEMENTED!')); 
        },
        deleteResource: (type, id)=> {
          // not implemented
          return Promise.reject(new Error('NOT IMPLEMENTED!'));  
        }
      }
    },

    start: (options)=> { 
      ... 
      app.resourceApi.register(this.id, this.resourceProvider);
    },

    stop: ()=> { 
      app.resourceApi.unRegister(this.id);
      ... 
    }
  }
}
```
=======
>>>>>>> Added Resource_Provider documentation
