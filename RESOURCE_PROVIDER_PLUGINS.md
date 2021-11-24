# Resource Provider plugins

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> chore: Updated documentation
_This document should be read in conjunction with [SERVERPLUGINS.md](./SERVERPLUGINS.md) as it contains additional information regarding the development of plugins that facilitate the storage and retrieval of resource data._

---

<<<<<<< HEAD
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
=======
>>>>>>> chore: Updated documentation
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

It is important to understand that the SignalK server handles requests for __Custom__ resource types differently to requests for __Common__ types, please ensure you refer to the relevant section of this document.

---

## Common Resource Type Provider:

<<<<<<< HEAD
_Definition: `resourceProvider` interface._
```javascript
resourceProvider: {
  types: [],
>>>>>>> Added Resource_Provider documentation
=======
As detailed earlier in this document, the __Common__ resource types are:
`routes`, `waypoints`, `notes`, `regions` & `charts`.

For the `/signalk/v1/api/resources` path and the __Common__ resource type sub-paths, the Signal K server will pre-process the request before passing on the request details on to the registered resource provider.

The SignalK server performs the following tasks when pre-processing a request:
- Checks for a registered provider for the resource type
- Checks the validity of the supplied resource id
- For requests to store data, the submitted resource data is validated.

Only when all pre-processing tasks have completed successfully will the request be passed on to the resource provider plugin.

Resource providers for __Common__ resource types need to implement the `ResourceProvider` interface which registers with the SignalK server the:
- Resource types provided for by the plugin
- Methods to use when requests are passed to the plugin. It is these methods that implement the saving / deletion of resource data to storage and the retrieval of requested resources.


### Resource Provider Interface

---
The `ResourceProvider` interface defines the contract between the the Resource Provider plugin and the SignalK server and has the following definition _(which it and other related types can be imported from `@signalk/server-api`)_:

```typescript
import { SignalKResourceType } from '@signalk/server-api'
// SignalKResourceType= 'routes' | 'waypoints' |'notes' |'regions' |'charts'

interface ResourceProvider: {
  types: SignalKResourceType[],
>>>>>>> chore: Updated documentation
  methods: {
    listResources: (type:string, query: {[key:string]:any})=> Promise<any>
    getResource: (type:string, id:string)=> Promise<any>
    setResource: (type:string, id:string, value:{[key:string]:any})=> Promise<any>
    deleteResource: (type:string, id:string)=> Promise<any>
  }
}
```
<<<<<<< HEAD
<<<<<<< HEAD
where:

- `types`: An array containing a list of resource types provided for by the plugin. These can be a mixture of both __Common__ and __Custom__ resource types.
=======
where:

- `types`: An array containing a list of __Common__ resource types provided for by the plugin
>>>>>>> chore: Updated documentation
- `methods`: An object containing the methods resource requests are passed to by the SignalK server. The plugin __MUST__ implement each method, even if that operation is not supported by the plugin!

#### __Method Details:__

---
__`listResources(type, query)`__: This method is called when a request is made for resource entries of a specific resource type that match a specifiec criteria.

_Note: It is the responsibility of the resource provider plugin to filter the resources returned as per the supplied query parameters._

<<<<<<< HEAD
`type:` String containing the type of resource to retrieve.

`query:` Object contining `key | value` pairs repesenting the parameters by which to filter the returned entries. _e.g. {distance,'50000}_
=======
`type:` Array of __Common__ resource types provied for by the plugin _e.g. ['routes','waypoints']_

`query:` Object contining `key | value` pairs repesenting the parameters by which to filter the returned entries _e.g. {distance,'50000}_
>>>>>>> chore: Updated documentation

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

<<<<<<< HEAD
`type:` String containing the type of resource to retrieve.

`id:` String containing the target resource entry id. _e.g. 'urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99'_
=======
`type:` String containing one of the __Common__ resource types _e.g. 'waypoints'_

`id:` String containing the target resource entry id _e.g. 'urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99'_
>>>>>>> chore: Updated documentation

`returns:` 
- Resolved Promise containing the resource entry on completion. 
- Rejected Promise containing an Error if incomplete or not implemented.

_Example resource request:_ 
```
GET /signalk/v1/api/resources/routes/urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99
```
_ResourceProvider method invocation:_
<<<<<<< HEAD

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
=======
>>>>>>> chore: Updated documentation

```javascript
getResource(
  'routes', 
  'urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99'
);
```

---
__`setResource(type, id, value)`__: This method is called when a request is made to save / update a resource entry of the specified resource type, with the supplied id and data.

`type:` Array of __Common__ resource types provied for by the plugin _e.g. ['routes','waypoints']_

`id:` String containing the target resource entry id _e.g. 'urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99'_

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

`type:` String containing one of the __Common__ resource types _e.g. 'waypoints'_

`id:` String containing the target resource entry id _e.g. 'urn:mrn:signalk:uuid:07894aba-f151-4099-aa4f-5e5773734b99'_

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

---

### Example:

_Defintion for Resource Provider plugin providing for the retrieval routes & waypoints._
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


### Registering the Resource Provider:
---

For the plugin to be registered by the SignalK server, it needs to  call the server's `resourcesApi.register()` function during plugin startup.

The server `resourcesApi.register()` function has the following signature:

```typescript
app.resourcesApi.register(pluginId: string, resourceProvider: ResourceProvider)
```
where:
- `pluginId`: is the plugin's id
- `resourceProvider`: is a reference to the plugins ResourceProvider interface.

_Note: A resource type can only have one registered plugin, so if more than one installed plugin attempts to register as a provider for the same resource type, only the first one is registered and it's implemented methods will service requests._

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

When a resource provider plugin is disabled, it should un-register as a provider to ensure resource requests are no longer directed to it by calling the SignalK server's `resourcesApi.unRegister()` function during shutdown.

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
  }
}
```
---

## Custom Resource Type Provider:

Custom resource types are collections of resource entries residing within a sub-path with a user defined name under `/signalk/v1/api/resources`.

_Example:_
```
/signalk/v1/api/resources/fishingZones
```

_Note: A custom resource path name __CANNOT__ be one of the __Common__ resource types i.e. `routes`, `waypoints`, `notes`, `regions` or `charts`.__

Unlike the __Common Resource Type Providers__:
- The plugin __DOES NOT__ implement the `ResourceProvider` interface
- Requests to __Custom__ resource type sub-paths and any submitted data __WILL NOT__ be pre-processed or validated by the Signal K server
- The plugin __WILL__ need to implement a route handler for the necessary path(s)
- The plugin __WILL__ need to implement any necessary data validation.


### Router Path Handlers
--- 

To set up a router path handler, you use the reference to the SignalK server `app` passed to the plugin to register the paths for which requests will be passed to the plugin.

This should be done during plugin startup within the plugin `start()` function.

_Note: To ensure that your resource path is listed when a request to `/signalk/v1/api/resources` is made ensure you use the full path as outlined in the example below._

_Example:_
```javascript

module.exports = function (app) {

  let plugin= {
    id: 'mypluginid',
    name: 'My Resource Providerplugin',
    start: (options) => {
      // setup router path handlers
      initPathHandlers(app);
      ...
    }
  }  
  
  function initPathHandlers(app) {
    app.get(
      `/signalk/v1/api/resources/myResType`, 
      (request, response)=> {
        // retrieve resource(s)
        let result= getMyResources();
        response.status(200).json(result);
      }
    );
    app.post(
      `/signalk/v1/api/resources/myResType`, 
      (request, response)=> {
        // create new resource
        ...
      }
    );
    router.put(
      `/signalk/v1/api/resources/myResType/:id`, 
      (request, response)=> {
        // create / update resource with supplied id
        ...
      }
    );                               
    router.delete(
      `/signalk/v1/api/resources/myResType/:id`, 
      (request, response)=> {
        // delete the resource with supplied id
        ...
      }
    );
  }

```

Once registered requests to `/signalk/v1/api/resources/myResType` will be passed to the respective handler based on the request type _(i.e. GET, PUT, POST, DELETE)_ and the request details are available in the `request` parameter.

For more information regarding the `request` and `response` parameters see the [Express Routing](https://expressjs.com/en/guide/routing.html) documentation.

### Data Validation
--- 

When providing for resource data to be persisted to storage (PUT, POST) it is recommended that data validation implemented within the `app.put()` and `app.post()` route handlers and that the appropriate `status` is returned.

_Example:_
```javascript
app.post(
  `/signalk/v1/api/resources/myResType`, 
  (request, response)=> {
    // validate submitted data
    let ok= validate(request.body);
    if (ok) { //valid data
      if (saveResource(request.body)) {
        response.status(200).send('OK');
      } else {
        response.status(404).send('ERROR svaing resource!');
      }
    } else {
      response.status(406).send('ERROR: Invalid data!');
    }
  }
)

```
---

<<<<<<< HEAD
`POST` requests to a resource path that do not contina the resource id will be dispatched to the `setResource` method passing the resource type, an id (generated by the server) and resource data as parameters.

`setResource()` returns `true` on success and `null` on failure.

_Example: New route record._
```typescript
POST /signalk/v1/api/resources/routes {<resource_data>}

setResource('routes', 'urn:mrn:signalk:uuid:ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a', <resource_data>)

returns Promise<true | null>
```

### __Deleting Resources:__

`DELETE` requests to a path containing the resource id will be dispatched to the `deleteResource` method passing the resource type and id as parameters.

`deleteResource()` returns `true` on success and `null` on failure.

_Example: Delete region with supplied id._
```typescript
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

<<<<<<< HEAD
returns true | null 
>>>>>>> Add register / unregister
=======
returns Promise<true | null>
>>>>>>> chore: return value descriptions to show a Promise
```
=======
>>>>>>> chore: Updated documentation

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
