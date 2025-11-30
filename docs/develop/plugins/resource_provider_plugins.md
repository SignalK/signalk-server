---
title: Resource Providers
---

# Resource Provider plugins

The Signal K server _Resource API_ provides a common set operations for clients to interact with routes, waypoints, charts, etc but it does NOT provide the ability to persist or retrieve resources to / from storage.

This functionality needs to be provided by one or more server plugins that interface with the _Resource API_ to facilitate the storage and retrieval of resource data.

These plugins are called **Provider Plugins**.

_Resource API architecture:_

<img src="../../img/resource_provider.svg" width="275"/>

This de-coupling of request handling and data storage provides the flexibility to persist resource data in a variety of different storage types as well as Internet based services.

> [!NOTE]
> Signal K server comes with the [resources-provider-plugin](https://github.com/SignalK/signalk-server/tree/master/packages/resources-provider-plugin) pre-installed which persists resource data to the local file system.

## Resources API

The _[Resources API](../rest-api/resources_api.md)_ handles all client requests received via the `/signalk/v2/api/resources` path, before passing on the request to registered provider plugin(s).

The _Resources API_ performs the following operations when a request is received:

1. Checks for registered provider(s) for the resource type _(i.e. route, waypoint, etc.)_
1. Checks that the required ResourceProvider methods are defined for the requested operation _(i.e. POST, PUT, GET, DELETE)_
1. Performs an access control check
1. `POST` and `PUT` requests for **Standard** _(Signal K defined)_ resource types are checked for validity of the submitted:
   - `resource id`
   - `resource data` against the OpenAPI definition.

Only after successful completion of all these operations is the request passed on to the registered provider plugin(s).

---

## Provider plugins

A resource provider plugin is a Signal K server plugin that implements the {@link @signalk/server-api!ResourceProvider | ResourceProvider } interface which:

- Tells server the resource type(s) provided for by the plugin _(i.e. route, waypoint, etc.)_
- Registers the methods used to action requests passed from the server and perform the writing, retrieval and deletion of resources from storage. _Note: The plugin **MUST** implement each method, even if that operation is NOT supported by the plugin!_

> [!NOTE]
> Multiple providers can be registered for a resource type _(e.g. 2 x chart providers)_

_**Note: The Resource Provider is responsible for implementing the methods and returning data in the required format!**_

## Registering as a Resource Provider

To register a plugin as a provider for one or more resource types with the SignalK server, it must call the server's {@link @signalk/server-api!ResourceProviderRegistry.registerResourceProvider | `registerResourceProvider`} function for each resource type being serviced during plugin startup.

_Example: Plugin registering as a routes & waypoints provider._

```javascript
import { ResourceProvider } from '@signalk/server-api'

module.exports = function (app) {

  const plugin = {
    id: 'mypluginid',
    name: 'My Resource Provider plugin'
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

## Resource Provider Methods

A Resource Provider plugin must implement ALL methods in {@link @signalk/server-api!ResourceProviderMethods | `ResourceProviderMethods`} to service the requests passed from the server.

Each method should return a **Promise** on success and `throw` on error, if a request is not serviced or is not implemented.

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

## Delta Notifications for Internal Resource Changes

While the built-in Resources API automatically emits deltas for standard operations (`POST`, `PUT`, `DELETE`), custom provider endpoints must manually emit deltas when resources are modified through custom endpoints to keep clients synchronized in real-time.

Emit delta notifications after:
1. **Create** - New resource added (via upload, file copy, download, etc.)
2. **Update** - Resource modified (rename, move, enable/disable, etc.)
3. **Delete** - Resource removed

### Delta Message Format

Resource deltas use the standard Signal K delta format with the resource path.
**Target version 2 data structure**.

```javascript
app.handleMessage(
  'my-provider-plugin-id',
  {
    updates: [{
      values: [{
        path: 'resources.<resourceType>.<resourceId>',
        value: resourceData  // or null for deletions
      }]
    }]
  },
  2  // Signal K v2 - resources should not be in full model cache
)
```


### Example: Complete Implementation

This example shows a chart provider plugin that emits deltas for all operations:

```javascript
module.exports = function (app) {
  let chartCache = {}

  const plugin = {
    id: 'my-charts-provider',
    name: 'My Charts Provider',

    start: (options) => {
      // Register as resource provider
      app.registerResourceProvider({
        type: 'charts',
        methods: {
          listResources: () => Promise.resolve(chartCache),
          getResource: (id) => {
            if (chartCache[id]) {
              return Promise.resolve(chartCache[id])
            }
            throw new Error('Chart not found')
          },
          setResource: (id, value) => {
            throw new Error('Not implemented')
          },
          deleteResource: (id) => {
            throw new Error('Not implemented')
          }
        }
      })

      // Register custom endpoints
      registerCustomEndpoints()

      // Initial load
      refreshCharts()
    },

    registerWithRouter: (router) => {
      router.post('/charts/upload', async (req, res) => {
        try {
          const chartId = await saveUploadedChart(req)

          await refreshCharts()

          if (chartCache[chartId]) {
            emitChartDelta(chartId, chartCache[chartId])
          }

          res.json({ success: true, id: chartId })
        } catch (error) {
          res.status(500).json({ error: error.message })
        }
      })

      // Delete endpoint
      router.delete('/charts/:id', async (req, res) => {
        try {
          await deleteChartFromDisk(req.params.id)

          await refreshCharts()

          emitChartDelta(req.params.id, null)

          res.send('Chart deleted successfully')
        } catch (error) {
          res.status(500).send(error.message)
        }
      })
    }
  }

  const emitChartDelta = (chartId, chartValue) => {
    try {
      app.handleMessage(
        plugin.id,
        {
          updates: [{
            values: [{
              path: `resources.charts.${chartId}`,
              value: chartValue
            }]
          }]
        },
        2  // Signal K v2 - resources should not be in full model cache
      )
      app.debug(`Delta emitted for chart: ${chartId}`)
    } catch (error) {
      app.error(`Failed to emit delta: ${error.message}`)
    }
  }

  const refreshCharts = async () => {
    try {
      const charts = await loadChartsFromDisk()
      chartCache = charts
      app.debug(`Charts refreshed: ${Object.keys(chartCache).length} charts`)
    } catch (error) {
      app.error(`Failed to refresh charts: ${error.message}`)
    }
  }

  return plugin
}
```

### Client Subscription

Clients can subscribe to resource changes via WebSocket:

```javascript
{
  "context": "resources.*",
  "subscribe": [
    {
      "path": "charts.*",
      "policy": "instant"
    }
  ]
}
```

When resources change, clients receive delta messages:

```json
{
  "context": "resources",
  "updates": [{
    "values": [{
      "path": "charts.myChart",
      "value": {
        "name": "My Chart",
        "description": "Chart description",
        ...
      }
    }]
  }]
}
```

For deletions, `value` is `null`:

```json
{
  "context": "resources",
  "updates": [{
    "values": [{
      "path": "charts.myChart",
      "value": null
    }]
  }]
}
```

### Best Practices

1. **Always refresh in-memory state** - Delta notifications work with WebSocket clients, but REST API clients still poll endpoints. Keep your cache current.

2. **Use simple resource IDs** - Resource identifiers should be simple strings (e.g., filename without extension), not full paths.

3. **Emit null for deletions** - Clients interpret `value: null` as resource removal.

4. **Fire-and-forget deltas** - No need to wait for delta emission; it's asynchronous.

5. **Handle errors gracefully** - Wrap delta emission in try-catch to prevent failures from affecting the main operation.

### Reference Implementation

The [signalk-charts-provider-simple](https://github.com/dirkwa/signalk-charts-provider-simple) plugin provides a complete working example of this pattern, including:

- Delta emission for create, update, and delete operations
- In-memory cache refresh after all modifications
- Event-based delta emission (download completion)
- Real-time updates for Freeboard SK and other clients

This implementation demonstrates best practices and has been verified to work in production.
