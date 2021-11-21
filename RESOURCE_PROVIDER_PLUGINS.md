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
      app.resourceApi.unRegister(this.id);
      ... 
    }
  }
}
```

---

## Plugin Startup - Registering the Resource Provider:

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

## Plugin Stop - Un-registering the Resource Provider:

When a resource provider plugin is disabled it should un-register as a provider so resource requests are not directed to it. This is done by calling the server's `resourcesApi.unRegister()` function passing the `plugin.id` within the plugin's `stop()` function.

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
  }
}
```
---

## Operation:

The Server will dispatch requests made to:
-  `/signalk/v1/api/resources/<resource_type>` 

OR 
- the `resources API` endpoints

to the plugin's `resourceProvider.methods` for each of the resource types listed in `resourceProvider.types`.

Each method defined in `resourceProvider.methods` must have a signature as specified in the __resourceProvider interface__. Each method returns a `Promise` containing the resultant resource data or `null` if an error occurrred or the operation is incomplete. 


### __List Resources:__

`GET` requests that are not for a specific resource will be dispatched to the `listResources` method passing the resource type and any query data as parameters.

Query parameters are passed as an object conatining `key | value` pairs.

_Example: GET /signalk/v1/api/resources/waypoints?bbox=5.4,25.7,6.9,31.2&distance=30000_
```javascript
query= {
  bbox: '5.4,25.7,6.9,31.2',
  distance: 30000
}
```

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

### __Retrieve a specific resource:__

`GET` requests for a specific resource will be dispatched to the `getResource` method passing the resource type and id as parameters.

`getResource()` should returns a JSON object containing the resource data.

_Example: Retrieve route._
```javascript
GET /signalk/v1/api/resources/routes/urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a

getResource(
  'routes', 
  'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a',
  {}
)
```

_Returns the result:_
```json
{
  "name": "Name of the route",
  "description": "Description of the route",
  "distance": 18345,
  "feature": { ... }
}
```

A request for a resource attribute will pass the attibute path as an array in the query object with the key `resAttrib`.

_Example: Get waypoint geometry._
```javascript
GET /signalk/v1/api/resources/waypoints/urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a/feature/geometry

getResource(
  'waypoints',
  'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a',
  { resAttrib: ['feature','geometry'] }
)
```
_Returns the value of `geometry` attribute of the waypoint._
```json
{
  "type": "Point",
  "coordinates": [70.4,6.45] 
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

<<<<<<< HEAD
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
=======
deleteResource('regions', 'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a')

returns true | null 
>>>>>>> Add register / unregister
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
