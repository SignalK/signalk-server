

# Server API for plugins

Internally, SignalK server builds a full data model. Plugins can access the server's delta stream (updates) and full model and provide additional data as deltas using the following functions.

### `app.handleMessage(pluginId, delta, skVersion = 'v1')`

Allows the plugin to publish deltas to the server. These deltas are handled as any incoming deltas.

```javascript
app.handleMessage('my-signalk-plugin', {
  updates: [
    {
      values: [
        {
          path: 'navigation.courseOverGroundTrue',
          value: Math.PI
        }
      ]
    }
  ]
})
```

Deltas that use Signal K V2 paths (like the [Course API](http://localhost:3000/admin/openapi/?urls.primaryName=course) paths) should call `handleMessage` with the optional 3rd parameter set to `v2`. This prevents V2 API data getting mixed in V1 paths' data in Full model & the v1 http API. If you don't know that your data is V2 API data you can omit the third parameter, as the default is V1.

### `app.getSelfPath(path)`

Get a Signal K path for the `vessels.self`'s full data model.

```javascript
let uuid = app.getSelfPath('uuid');
app.debug(uuid); // Should output something like urn:mrn:signalk:uuid:a9d2c3b1-611b-4b00-8628-0b89d014ed60
```

### `app.getPath(path)`

Get a Signal K path starting from the root of the full data model.

```javascript
let baseStations = app.getPath('shore.basestations');

// baseStations:

{
  'urn:mrn:imo:mmsi:2766140': {
    url: 'basestations',
    navigation: { position: [Object] },
    mmsi: '2766140'
  },
  'urn:mrn:imo:mmsi:2766160': {
    url: 'basestations',
    navigation: { position: [Object] },
    mmsi: '2766160'
  },
  ...
}
```

### `app.streambundle.getSelfBus(path)`

Get a [Bacon JS](https://baconjs.github.io/) stream for `vessels.self`'s Signal K path. `path` argument is optional. If it is not provided the returned stream
produces values for all paths. Stream values are objects with structure

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

For example:
```javascript
app.streambundle
  .getSelfBus('navigation.position')
  .forEach(pos => app.debug(pos));
```

Outputs:
```javascript
...
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
...
```

### `app.streambundle.getSelfStream(path)`

Get a [Bacon JS](https://baconjs.github.io/) stream for `vessels.self`'s Signal K path. `path` argument is optional. If it is not provided the returned stream
produces values for all paths. This is similar to `app.streambundle.getSelfBus(path)`, but the stream values are the `value` properties from incoming deltas.

```javascript
app.streambundle
  .getSelfStream('navigation.position')
  .forEach(pos => app.debug(pos));
```

Outputs:
```
  my-signalk-plugin { longitude: 24.736677, latitude: 59.7250108 } +600ms
  my-signalk-plugin { longitude: 24.736645, latitude: 59.7249883 } +321ms
  my-signalk-plugin { longitude: 24.7366563, latitude: 59.7249807 } +174ms
  my-signalk-plugin { longitude: 24.7366563, latitude: 59.724980699999996 } +503ms
```

### `app.streambundle.getBus(path)`

Get a [Bacon JS](https://baconjs.github.io/) stream for a Signal K path that will stream values from any context. `path` argument is optional. If it is not provided the returned stream
produces values for all paths. Stream values are objects as in `app.streambundle.getSelfBus(path)`.

### `app.streambundle.getAvailablePaths()`

Get a list of paths currently available in the server

```javascript
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
  ...
]
```

### `app.error(message)`

Report errors in a human-oriented message. Currently just logs the message, but in the future error messages hopefully will show up in the admin UI.

### `app.debug(...)`

Log debug messages. This is the debug method from the [debug module](https://www.npmjs.com/package/debug). The npm module name is used as the debug name.

`app.debug()` can take any type and will serialize it before outputting.

*Do not use `debug` directly*. Using the debug function provided by the server makes sure that the plugin taps into the server's debug logging system, including the helper switches in Admin UI's Server Log page.

### `app.savePluginOptions(options, callback)`

Save changes to the plugin's options.

```javascript
var options = {
  myConfigValue = 'Something the plugin calculated'
};

app.savePluginOptions(options, () => {app.debug('Plugin options saved')});

```

### `app.readPluginOptions()`

Read plugin options from disk.

```javascript
var options = app.readPluginOptions();
```

### `app.getDataDirPath()`

Returns the full path of the directory where the plugin can persist its internal data, like data files.

Example use:
```javascript
var myFile = require('path').join(app.getDataDirPath(), 'somefile.ext')
```

### `app.registerPutHandler(context, path, callback, source)`

If a plugin wants to respond to [`PUT`](http://signalk.org/specification/1.3.0/doc/put.html) requests for a specific path, it can register an action handler.

The action handler can handle the request synchronously or asynchronously.

The passed callback should be a function taking the following arguments: `(context, path, value, callback)`

For synchronous actions the handler must return a value describing the response of the request: for example

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

For asynchronous actions that may take considerable time and where the requester should not be kept waiting for the result the handler must return

```javascript
{ state: 'PENDING' }
```

When the action is finished the handler should call the `callback` function with the result with

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

Synchronous example:
```javascript
function myActionHandler(context, path, value, callback) {
  if(doSomething(context, path, value)){
    return { state: 'COMPLETED', statusCode: 200 };
  } else {
    return { state: 'COMPLETED', statusCode: 400 };
  }
}

plugin.start = function(options) {
  app.registerPutHandler('vessels.self', 'some.path', myActionHandler, 'somesource.1');
}
```

Asynchronous example:
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

plugin.start = function(options) {
  app.registerPutHandler('vessels.self', 'some.path', myActionHandler);
}
```

### `app.registerDeltaInputHandler ((delta, next) => ...)`

Register a function to intercept all delta messages *before* they are processed by the server. The plugin callback should call `next(delta)` with a modified delta if it wants to alter the incoming delta or call `next` with the original delta to process it normally. Not calling `next` will drop the incoming delta and will only show in delta statistics.
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
})
```

### `app.notify(path, value, pluginId)`

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


### `app.registerResourceProvider(resourceProvider)`

See [`RESOURCE_PROVIDER_PLUGINS`](./RESOURCE_PROVIDER_PLUGINS.md) for details.

---
### `app.resourcesApi.getResource(resource_type, resource_id, provider_id?)`

Retrieve data for the supplied SignalK resource_type and resource_id.

_Note: Requires a registered Resource Provider for the supplied `resource_type`._

  - `resource_type`: Any Signal K _(i.e. `routes`,`waypoints`, `notes`, `regions` & `charts`)_
 or user defined resource types.

  - `resource_id`: The id of the resource to retrieve _(e.g. `ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a`)_

  - `provider_id` (optional): The id of the Resource Provider plugin to specifically use. Can be specified when more than one provider has been registered for a reource type._(e.g. `resources-provider`)_

- returns:  `Promise<{[key: string]: any}>` 

_Example:_
```javascript
app.resourcesApi.getResource(
  'routes', 
  'ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'
).then (data => {
  // route data
  console.log(data);
  ...
}).catch (error) { 
  // handle error
  console.log(error.message);
  ...
}
```

### `app.resourcesApi.setResource(resource_type, resource_id, resource_data, provider_id?)`

Create / update value of the resource with the supplied SignalK resource_type and resource_id.

_Note: Requires a registered Resource Provider for the supplied `resource_type`._

  - `resource_type`: Any Signal K _(i.e. `routes`,`waypoints`, `notes`, `regions` & `charts`)_
 or user defined resource types.

  - `resource_id`: The id of the resource to retrieve _(e.g. `ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a`)_

  - `resource_data`: A complete and valid resource record.

  - `provider_id` (optional): The id of the Resource Provider plugin to specifically use. Can be specified when more than one provider has been registered for a reource type._(e.g. `resources-provider`)_

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

### `app.resourcesApi.deleteResource(resource_type, resource_id, provider_id?)`

Delete the resource with the supplied SignalK resource_type and resource_id.

_Note: Requires a registered Resource Provider for the supplied `resource_type`._

- `resource_type`: Any Signal K _(i.e. `routes`,`waypoints`, `notes`, `regions` & `charts`)_
or user defined resource types.

- `resource_id`: The id of the resource to retrieve _(e.g. `ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a`)_

- `provider_id` (optional): The id of the Resource Provider plugin to specifically use. Can be specified when more than one provider has been registered for a reource type._(e.g. `resources-provider`)_

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

### `app.resourcesApi.listResources(resource_type, params, provider_id?)`

Retrieve data for the supplied SignalK resource_type and resource_id.

_Note: Requires a registered Resource Provider for the supplied `resource_type`._

  - `resource_type`: Any Signal K _(i.e. `routes`,`waypoints`, `notes`, `regions` & `charts`)_
 or user defined resource types.

  - `params`: Object contining `key | value` pairs repesenting the parameters by which to filter the returned entries.

  - `provider_id` (optional): The id of the Resource Provider plugin to specifically use. Can be specified when more than one provider has been registered for a reource type._(e.g. `resources-provider`)_
  
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
### `app.setPluginStatus(msg)`

Set the current status of the plugin. The `msg` should be a short message describing the current status of the plugin and will be displayed in the plugin configuration UI and the Dashboard.

```javascript
app.setPluginStatus('Initializing');
// Do something
app.setPluginStatus('Done initializing');
```

Use this instead of deprecated `setProviderStatus`

### `app.setPluginError(msg)`

Set the current error status of the plugin. The `msg` should be a short message describing the current status of the plugin and will be displayed in the plugin configuration UI and the Dashboard.

```javascript
app.setPluginError('Error connecting to database');
```

Use this instead of deprecated `setProviderError`

### `app.getSerialPorts() => Promise<Ports>`

This returs a Promise which will resolve to a [Ports](src/serialports.ts#21) object which contains information about the serial ports available on the machine.


### PropertyValues
```
app.emitPropertyValue: (name: string, value: any) => void
onPropertyValues: (
  name: string,
  callback: (propValuesHistory: PropertyValue[]) => void
) => Unsubscribe
```
PropertyValues are a mechanism for passing configuration type values between different parties such as plugins and input connections running in the server process.

A plugin can *emit*  values and register to listen for others emitting them. The difference between the PropertyValues mechanism and Event Emitters in NodeJs is that when you call `onPropertyValues` the callback will get immdediately called with an array of all previous values for the property name, starting with the initial value of `undefined`. If nothing has emitted any values for the property name the callback will be called with a value of `undefined`.

A PropertyValue has the following structure:
```
interface PropertyValue {
  timestamp: number // millis
  setter: string // plugin id, server, provider id
  name: string
  value: any
}
```

Note that the value can be also a function.

This mechanism allows plugins to _offer_ extensions via _"Well Known Properties"_, for example 
- additional [NMEA0183 sentence parsers for custom sentences](https://github.com/SignalK/nmea0183-signalk/pull/193) via `nmea0183sentenceParser`
- additional PGN definitions for propietary or custom PGNs

Code handling incoming PropertyValues should be fully reactive: even if all emitters emit during their startup there is no defined load / startup order and plugins may emit when activated and started. This means that depending on a PropertyValue being there when your code starts or arriving after your code has started is not possible.

PropertyValues is not meant for data passing on a regular basis, as the total history makes it a potential memory leak. There is a safeguard against accidentally emitting regularly with an upper bound for values per property name. New values will be ignored if it is reached and emits logged as errors.


### Exposing custom HTTP paths & OpenApi

If a plugin has a function called `registerWithRouter(router)` (like the plugin's `start` and `stop` functions) it will be called with an Express router as the parameter during plugin startup. The router will be mounted at `/plugins/<pluginId>` and you can use standard Express `.get` `.post` `.use` etc to add HTTP path handlers. Note that `GET /plugins/<pluginid>` and `POST /plugins/<pluginid>/configure` are reserved by server (see below).

Express does not have a public API for deregistering subrouters, so `stop` does not do anything to the router.

**Consider seriously providing an OpenApi description** for your plugin's API. This promotes further cooperation with other plugin/webapp authors. One way we can work together is by fleshing out new APIs within a plugin and then merge them in the Signal K specification for more cooperation.

Implement `getOpenApi` in your plugin to expose your OpenApi to be included in the server's OpenApi UI tooling. The plugin's OpenApi description either not include `servers` property at all or specify only the path in the url. The server will provide servers if it is missing and relative, path only server urls work best in different environments. See [testplugin](https://github.com/SignalK/signalk-server/tree/b82477e63ebdc14878164ce1ed3aedd80c5a8b0c/test/plugin-test-config/node_modules/testplugin) for an example.

## Plugin configuration HTTP API

### `GET /plugins/`

Get a list of installed plugins and their configuration data.

### `GET /plugins/<pluginid>`

Get information from an installed plugin.

Example result:
```json
{
  "enabled": false,
  "id": "marinetrafficreporter",
  "name": "Marine Traffic Reporter"
}
```

### `POST /plugins/<pluginid>/configure`

Save configuration data for a plugin. Stops and starts the plugin as a side effect.
