# Resource Provider plugins

_This document should be read in conjunction with [SERVERPLUGINS.md](./SERVERPLUGINS.md) as it contains additional information regarding the development of plugins that facilitate the storage and retrieval of resource data._

To see an example of a resource provider plugin see [resources-provider-plugin](https://github.com/SignalK/resources-provider-plugin/)

---

## Overview

The SignalK specification defines the path `/signalk/v1/api/resources` for accessing resources to aid in navigation and operation of the vessel.

It also defines the schema for the following __Common__ resource types:
- routes
- waypoints
- notes
- regions
- charts

each with its own path under the root `resources` path _(e.g. `/signalk/v1/api/resources/routes`)_.

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
- Performs access control check
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
  methods: {
    listResources: (type:string, query: {[key:string]:any})=> Promise<any>
    getResource: (type:string, id:string)=> Promise<any>
    setResource: (type:string, id:string, value:{[key:string]:any})=> Promise<any>
    deleteResource: (type:string, id:string)=> Promise<any>
  }
}
```
where:

- `types`: An array containing a list of resource types provided for by the plugin. These can be a mixture of both __Common__ and __Custom__ resource types.
- `methods`: An object containing the methods resource requests are passed to by the SignalK server. The plugin __MUST__ implement each method, even if that operation is not supported by the plugin!

#### __Method Details:__

---
__`listResources(type, query)`__: This method is called when a request is made for resource entries of a specific resource type that match a specifiec criteria.

_Note: It is the responsibility of the resource provider plugin to filter the resources returned as per the supplied query parameters._

`type:` String containing the type of resource to retrieve.

`query:` Object contining `key | value` pairs repesenting the parameters by which to filter the returned entries. _e.g. {distance,'50000}_

returns: `Promise<{[id: string]: any}>`


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

returns: `Promise<{[key: string]: any}>`

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

returns: `Promise<void>`

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

returns: `Promise<void>`

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

To register the resource provider plugin with the SignalK servert the plugin must call the server's `registerResourceProvider` function during plugin startup. The function has the following signature:

```typescript
app.registerResourceProvider(resourceProvider: ResourceProvider)
```
where:
- `resourceProvider`: is a reference to the plugins ResourceProvider interface.

_Note: If a plugin has already registered as a provider for a resource type, the method throws with an `Error`._

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
    app.registerResourceProvider(plugin.resourceProvider);
  }
}
```

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
      app.registerResourceProvider(this.resourceProvider);
    }

  }
}
```
