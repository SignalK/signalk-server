

# Server API for plugins

SignalK server provides an interface to allow plugins to access / update the full data model, operations and send / receive deltas (updates).

These functions are available via the `app` passed to the plugin when it is invoked.

---

### Accessing the Data Model

#### `app.getPath(path)`

Returns the entry for the provided path starting from the `root` of the full data model.

_Example:_
```javascript
let baseStations = app.getPath('shore.basestations');

// baseStations:
{
  'urn:mrn:imo:mmsi:2766140': {
    url: 'basestations',
    navigation: { position: {latitude: 45.2, longitude: 76.4} },
    mmsi: '2766140'
  },
  'urn:mrn:imo:mmsi:2766160': {
    url: 'basestations',
    navigation: { position: {latitude: 46.9, longitude: 72.22} },
    mmsi: '2766160'
  }
}
```

#### `app.getSelfPath(path)`

Returns the entry for the provided path starting from `vessels.self` in the full data model.

_Example:_
```javascript
let uuid = app.getSelfPath('uuid');
// Note: This is synonymous with app.getPath('vessels.self.uuid')

app.debug(uuid); 
// urn:mrn:signalk:uuid:a9d2c3b1-611b-4b00-8628-0b89d014ed60
```

#### `app.registerPutHandler(context, path, callback, source)`

Register a handler to action [`PUT`](http://signalk.org/specification/1.3.0/doc/put.html) requests for a specific path.
 
The action handler can handle the request synchronously or asynchronously.

The `callback` parameter should be a function which accepts the following arguments: 
- `context`
- `path`
- `value`
- `callback`

For synchronous actions, the handler must return a value describing the response of the request:

```javascript
{
  state: 'COMPLETED',
  statusCode: 200
}
```

 or

 ```javascript
{
  state:'COMPLETED',
  statusCode: 400,
  message:'Some Error Message'
}
 ```

 The `statusCode` value can be any valid HTTP response code.

For asynchronous actions, that may take considerable time to complete and the requester should not be kept waiting for the result, the handler must return:

```javascript
{ state: 'PENDING' }
```

When the action has completed the handler should call the `callback` function with the result:

```javascript
callback({ state: 'COMPLETED', statusCode: 200 })
```
or

```javascript
callback({
  state:'COMPLETED',
  statusCode: 400,
  message:'Some Error Message'
})
```

_Example: Synchronous response:_
```javascript
function myActionHandler(context, path, value, callback) {
  if(doSomething(context, path, value)){
    return { state: 'COMPLETED', statusCode: 200 };
  } else {
    return { state: 'COMPLETED', statusCode: 400 };
  }
}

plugin.start = (options) => {
  app.registerPutHandler('vessels.self', 'some.path', myActionHandler, 'somesource.1');
}
```

_Example: Asynchronous response:_
```javascript
function myActionHandler(context, path, value, callback) {

  doSomethingAsync(context, path, value, (result) =>{
    if(result) {
      callback({ state: 'COMPLETED', result: 200 })
    } else {
      callback({ state: 'COMPLETED', result: 400 })
    }
  });

  return { state: 'PENDING' };
}

plugin.start = (options) => {
  app.registerPutHandler('vessels.self', 'some.path', myActionHandler);
}
```
---

### Working with Deltas

#### `app.handleMessage(pluginId, delta, skVersion = 'v1')`

Emit a delta message. 

_Note: These deltas are handled by the server in the same way as any other incoming deltas._

_Example:_
```javascript
app.handleMessage('my-signalk-plugin', {
  updates: [
    {
      values: [
        {
          path: 'navigation.courseOverGroundTrue',
          value: 1.0476934
        }
      ]
    }
  ]
});
```

Plugins emitting deltas that use Signal K v2 paths (like the [Course API](http://localhost:3000/admin/openapi/?urls.primaryName=course) paths) should call `handleMessage` with the optional `skVersion` parameter set to `v2`. This prevents v2 API data getting mixed in v1 paths' data in full data model & the v1 http API. 

Omitting the `skVersion` parameter will cause the delta to be sent as `v1`.


#### `app.streambundle.getBus(path)`

Get a [Bacon JS](https://baconjs.github.io/) stream for a Signal K path that will stream values from any context. 

The `path` parameter is optional. If it is not provided the returned stream produces values for all paths.

Stream values are objects with the following structure:
```javascript
  {
    path: ...,
    value: ...,
    context: ...,
    source: ...,
    $source: ...,
    timestamp: ...
  }
```

_Example:_
```javascript
app.streambundle
  .getBus('navigation.position')
  .forEach(pos => app.debug(pos));
  
// output
{
  path: 'navigation.position',
  value: { longitude: 24.7366117, latitude: 59.72493 },
  context: 'vessels.urn:mrn:imo:mmsi:2766160',
  source: {
    label: 'n2k-sample-data',
    type: 'NMEA2000',
    pgn: 129039,
    src: '43'
  },
  '$source': 'n2k-sample-data.43',
  timestamp: '2014-08-15T19:00:02.392Z'
}
{
  path: 'navigation.position',
  value: { longitude: 24.82365, latitude: 58.159598 },
  context: 'vessels.urn:mrn:imo:mmsi:2766140',
  source: {
    label: 'n2k-sample-data',
    type: 'NMEA2000',
    pgn: 129025,
    src: '160'
  },
  '$source': 'n2k-sample-data.160',
  timestamp: '2014-08-15T19:00:02.544Z'
}
```

#### `app.streambundle.getSelfBus(path)`

Get a [Bacon JS](https://baconjs.github.io/) stream for path from the `vessels.self` context. 

The `path` parameter is optional. If it is not provided the returned stream contains values for all paths. 

_Example:_
```javascript
app.streambundle
  .getSelfBus('navigation.position')
  .forEach(pos => app.debug(pos));

// output
{
  path: 'navigation.position',
  value: { longitude: 24.7366117, latitude: 59.72493 },
  context: 'vessels.urn:mrn:signalk:uuid:a9d2c3b1-611b-4b00-8628-0b89d014ed60',
  source: {
    label: 'n2k-sample-data',
    type: 'NMEA2000',
    pgn: 129039,
    src: '43'
  },
  '$source': 'n2k-sample-data.43',
  timestamp: '2014-08-15T19:00:02.392Z'
}
{
  path: 'navigation.position',
  value: { longitude: 24.7366208, latitude: 59.7249198 },
  context: 'vessels.urn:mrn:signalk:uuid:a9d2c3b1-611b-4b00-8628-0b89d014ed60',
  source: {
    label: 'n2k-sample-data',
    type: 'NMEA2000',
    pgn: 129025,
    src: '160'
  },
  '$source': 'n2k-sample-data.160',
  timestamp: '2014-08-15T19:00:02.544Z'
}
```

#### `app.streambundle.getSelfStream(path)`

Get a [Bacon JS](https://baconjs.github.io/) stream for a path in the `vessels.self` context. 

The `path` argument is optional. If it is not provided the returned stream produces values for all paths.

_Note: This is similar to `app.streambundle.getSelfBus(path)`, except that the stream values contain only the `value` property from the incoming deltas._

_Example:_
```javascript
app.streambundle
  .getSelfStream('navigation.position')
  .forEach(pos => app.debug(pos));

// output

  my-signalk-plugin { longitude: 24.736677, latitude: 59.7250108 } +600ms
  my-signalk-plugin { longitude: 24.736645, latitude: 59.7249883 } +321ms
  my-signalk-plugin { longitude: 24.7366563, latitude: 59.7249807 } +174ms
  my-signalk-plugin { longitude: 24.7366563, latitude: 59.724980699999996 } +503ms
```


#### `app.streambundle.getAvailablePaths()`

Get a list of available full data model paths maintained by the server.

_Example:_
```javascript
app.streambundle.getAvailablePaths();

// returns
[
  "navigation.speedOverGround",
  "navigation.courseOverGroundTrue",
  "navigation.courseGreatCircle.nextPoint.position",
  "navigation.position",
  "navigation.gnss.antennaAltitude",
  "navigation.gnss.satellites",
  "navigation.gnss.horizontalDilution",
  "navigation.gnss.positionDilution",
  "navigation.gnss.geoidalSeparation",
  "navigation.gnss.type","navigation.gnss.methodQuality",
  "navigation.gnss.integrity",
  "navigation.magneticVariation",
]
```

#### `app.registerDeltaInputHandler ((delta, next) => {} )`

Register a function to intercept all delta messages _before_ they are processed by the server. 

The callback function should call `next(delta)` with either:
- A modified delta (if it wants to alter the incoming delta) 
- With the original delta to process it normally. 

_Note: Not calling `next(delta)` will cause the incoming delta to be dropped and will only show in delta statistics._

Other, non-delta messages produced by provider pipe elements are emitted normally.

```javascript
app.registerDeltaInputHandler((delta, next) => {
  delta.updates.forEach(update => {
    update.values.forEach(pathValue => {
      if(pathValue.startsWith("foo")) {
        pathValue.path = "bar"
      }
    })
  })
  next(delta)
});
```

---

### Configuration

#### `app.savePluginOptions(options, callback)`

Save changes to the plugin's configuration options.

_Example:_
```javascript
let options = {
  myConfigValue = 'Something the plugin calculated'
};

app.savePluginOptions(options, () => {app.debug('Plugin options saved')});
```

#### `app.readPluginOptions()`

Read the stored plugin configuration options.

_Example:_
```javascript
let options = app.readPluginOptions();
```

#### `app.getDataDirPath()`

Returns the full path of the directory where the plugin can persist its internal data, e.g. data files, etc.

_Example:_
```javascript
let myDataFile = require('path').join( app.getDataDirPath(), 'somedatafile.ext')
```
---

### Messages and Debugging

#### `app.setPluginStatus(msg)`

Set the current status of the plugin that is displayed in the plugin configuration UI and the Dashboard. 

The `msg` parameter should be a short text message describing the current status of the plugin.

_Example:_
```javascript
app.setPluginStatus('Initializing');
// Do something
app.setPluginStatus('Done initializing');
```

_Note: Replaces deprecated `setProviderStatus()`_

#### `app.setPluginError(msg)`

Set the current error status of the plugin that is displayed in the plugin configuration UI and the Dashboard.

The `msg` parameter should be a short text message describing the current status of the plugin.

_Example:_
```javascript
app.setPluginError('Error connecting to database');
```

_Note: Replaces deprecated `setProviderError()`_


#### `app.debug(...)`

Log debug messages. 

This function exposes the `debug` method from the [debug module](https://www.npmjs.com/package/debug).
The npm module name is used as the debug name.

`app.debug()` can take any type and will serialize it before outputting.

_Note: Do not use `debug` from the debug module directly! Using `app.debug()`provided by the server ensures that the plugin taps into the server's debug logging system, including the helper switches in Admin UI's Server Log page.

#### `app.error(message)`

Report errors in a human-oriented message. Currently just logs the message, but in the future error messages hopefully will show up in the admin UI.


#### `reportOutputMessages(count)`

Report to the server that the plugin has sent data to other hosts so it can be displayed on the Dashboard.

_Note: This function is for use when the plugin is sending data to hosts other than the Signal K server (e.g.
network packets, http requests or messages sent to a broker)._

_**This function should NOT be used for deltas that the plugin sends with `handleMessage()`!**_

The `count` parameter is _optional_ and represents the number of messages sent between this call the previous
call. If omitted the call will count as one output message.

_Example:_
```javascript
app.reportOutputMessages(54);
```

---


### Serial Port

#### `app.getSerialPorts() => Promise<Ports>`

This returns a Promise which will resolve to a Ports object which contains information about the serial ports available on the machine.

---

### Resources API Interface

#### `app.registerResourceProvider(ResourceProvider)`

Used by _Resource Provider plugins_ to register each resource type it handles.

See [`Resource Provider Plugins`](../plugins/resource_provider_plugins.md#registering-as-a-resource-provider) for details.


#### `app.resourcesApi.setResource(resource_type, resource_id, resource_data, provider_id?)`

Create / update value of the resource with the supplied SignalK resource_type and resource_id.

_Note: Requires a registered Resource Provider for the supplied `resource_type`._

  - `resource_type`: Any Signal K _(i.e. `routes`,`waypoints`, `notes`, `regions` & `charts`)_
 or user defined resource types.

  - `resource_id`: The resource identifier. _(e.g. `ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a`)_

  - `resource_data`: A complete and valid resource record.

  - `provider_id` (optional): The id of the Resource Provider plugin to use to complete the request. Most commonly used for creating a new resource entry when more than one provider is registered for the specified resource type.

- returns:  `Promise<void>` 

_Example:_
```javascript
app.resourcesApi.setResource(
  'waypoints',
  'ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a',
  {
    "position": {"longitude": 138.5, "latitude": -38.6}, 
    "feature": {
      "type":"Feature", 
      "geometry": {
        "type": "Point", 
        "coordinates": [138.5, -38.6] 
      }, 
      "properties":{} 
    }
  }
).then ( () => {
  // success
  ...
}).catch (error) { 
  // handle error
  console.log(error.message);
  ...
}
```

#### `app.resourcesApi.deleteResource(resource_type, resource_id, provider_id?)`

Delete the resource with the supplied SignalK resource_type and resource_id.

_Note: Requires a registered Resource Provider for the supplied `resource_type`._

- `resource_type`: Any Signal K _(i.e. `routes`,`waypoints`, `notes`, `regions` & `charts`)_
or user defined resource types.

- `resource_id`: The resource identifier. _(e.g. `ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a`)_

- `provider_id` (optional): The id of the Resource Provider plugin to use to complete the request.

- returns: `Promise<void>` 

_Example:_
```javascript
app.resourcesApi.deleteResource(
  'notes', 
  'ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'
).then ( () => {
  // success
  ...
}).catch (error) { 
  // handle error
  console.log(error.message);
  ...
}
```

#### `app.resourcesApi.listResources(resource_type, params, provider_id?)`

Retrieve collection of resource entries of the supplied resource_type matching the provided criteria.

_Note: Requires a registered Resource Provider for the supplied `resource_type`._

  - `resource_type`: Any Signal K _(i.e. `routes`,`waypoints`, `notes`, `regions` & `charts`)_
 or user defined resource types.

  - `params`: Object contining `key | value` pairs repesenting the crteria by which to filter the returned entries.

  - `provider_id` (optional): The id of the Resource Provider plugin to use to complete the request.
  
  __Note: The registered Resource Provider must support the supplied parameters for results to be filtered.__

- returns:  `Promise<{[key: string]: any}>` 

_Example:_
```javascript
app.resourcesApi.listResources(
  'waypoints', 
  {region: 'fishing_zone'}
).then (data => {
  // success
  console.log(data);
  ...
}).catch (error) { 
  // handle error
  console.log(error.message);
  ...
}
```
---

### Course API Interface

The [`Course API`](../rest-api/course_api.md) provides the following functions for use by plugins.


#### `app.getCourse()`

Retrieves the current course information. 

- returns: Resolved Promise on success containing the same course information returned by the [`/course`](/doc/openapi/?urls.primaryName=course#/course/get_course) API endpoint.


#### `app.clearDestination()`

Cancels navigation to the current point or route being followed.

- returns: Resolved Promise on success.


#### `app.setDestination(dest)`

Set course to a specified position / waypoint. 

- `dest`: Object containing destination position information as per [`/course/destination`](/doc/openapi/?urls.primaryName=course#/destination/put_course_destination).

- returns: Resolved Promise on success.


#### `app.activateRoute(rte)`

Follow a route.
in the specified direction and starting at the specified point.

- `rte`: Object containing route information as per [`/course/activeRoute`](/doc/openapi/?urls.primaryName=course#/activeRoute/put_course_activeRoute).

- returns: Resolved Promise on success.

---

### Notifications API _(proposed)_

#### `app.notify(path, value, pluginId)`

Notifications API interface method for raising, updating and clearing notifications.

  - `path`: Signal K path of the notification

  - `value`: A valid `Notification` object or `null` if clearing a notification.

  - `pluginId` The plugin identifier.
  

To raise or update a for a specified path, call the method with a valid `Notification` object as the `value`.

- returns:  `string` value containing the `id` of the new / updated notification.

_Example:_
```javascript
const alarmId = app.notify(
  'myalarm', 
  {
	message: 'My cutom alarm text',
	state: 'alert'
  },
  'myAlarmPlugin'
)

// alarmId = "ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a"
```

To clear (cancel) a notification call the method with `null` as the `value`.

- returns:  `void`.

_Example: Clear notification_
```javascript
const alarmId = app.notify(
  'myalarm', 
  null,
  'myAlarmPlugin'
)
```

---

### PropertyValues

The _PropertyValues_ mechanism provides a means for passing configuration type values between different components running in the server process such as plugins and input connections.

A plugin can both *emit* values and *listen* for values emitted by others. 

The difference between the _PropertyValues_ mechanism and _Event Emitters_ in NodeJs is that when  `onPropertyValues` is called, the `callback()` function will be invoked and passed an array containing all of the previous values for that _property name_, starting with the initial value of `undefined`. If no values have been emitted for that _property name_ the callback will be invoked with a value of `undefined`.

```typescript
app.emitPropertyValue: (name: string, value: any) => void

onPropertyValues: (
  name: string,
  callback: (propValuesHistory: PropertyValue[]) => void
) => Unsubscribe
```

**PropertyValue** has the following structure:
```typescript
interface PropertyValue {
  timestamp: number // millis
  setter: string // plugin id, server, provider id
  name: string
  value: any
}
```

_Note that the value can be also a function._

This mechanism allows plugins to _offer_ extensions via _"Well Known Properties"_, for example 
- additional [NMEA0183 sentence parsers for custom sentences](https://github.com/SignalK/nmea0183-signalk/pull/193) via `nmea0183sentenceParser`
- additional PGN definitions for propietary or custom PGNs

Code handling incoming _PropertyValues_ should be fully reactive due to:
- Plugins being able to emit _PropertyValues_ when they activated and / or started
- There being no defined load / startup order for plugins / connections.

So even if all plugins / connections emit during their startup, you cannot depend on a specific _PropertyValue_ being available. It may be present when your code starts or it may arrive after your code has started.


**Note: The _PropertyValues_ mechanism is not intended to be used for data passing on a regular basis, as the total history makes it a potential memory leak.**

To safeguard against a component accidentally emitting regularly, via a fixed upper bound is enforced for the value array per _property name_. New values will be ignored if the upper bound is reached and are logged as errors.

---

### Exposing custom HTTP paths & OpenApi

Plugins are able to provide an API via a function called `registerWithRouter(router)`, which like the plugin's `start` and `stop` functions, will be called during plugin startup with an _Express_ router as the parameter. 

The router will be mounted at `/plugins/<pluginId>` and you can use standard _Express_ _(`.get()` `.post()` `.use()`, etc)_ methods to add HTTP path handlers. 

_Note: `GET /plugins/<pluginid>` and `POST /plugins/<pluginid>/configure` are reserved by server (see below)._

It should be noted that _Express_ does not have a public API for deregistering subrouters, so `stop` does not do anything to the router.

If a plugin does provide an API, it is strongly recommended that it provide an **OpenApi description** to document its operation.

Doing so promotes interoperability with other plugins / webapps by making it easy to find and use the functionality built into plugins. It is also a means to avoid duplication, promote reuse and the possibility of including them in the Signal K specification.

See [Server Plugins](server_plugin.md#add-an-openapi-definition) for details.

---

### Plugin configuration HTTP API

#### `GET /plugins/`

Get a list of installed plugins and their configuration data.

#### `GET /plugins/<pluginid>`

Get information from an installed plugin.

Example result:
```json
{
  "enabled": false,
  "id": "marinetrafficreporter",
  "name": "Marine Traffic Reporter"
}
```

#### `POST /plugins/<pluginid>/configure`

Save configuration data for a plugin. Stops and starts the plugin as a side effect.
