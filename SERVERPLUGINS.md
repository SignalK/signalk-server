# Server plugins

![image](https://user-images.githubusercontent.com/1049678/35973231-5d89ad56-0cdd-11e8-9d89-42313b468520.png)
![image](https://user-images.githubusercontent.com/1049678/35973284-7e1c319c-0cdd-11e8-918f-53bad7a3b706.png)


Signal K Node server plugins are components that run within the server and add some functionality to the server. You can configure them via the admin ui.

Plugins
- are npm modules published in the npm repository with the `signalk-node-server-plugin` keyword 
- are installed, activated/disabled and configured from the server admin UI
- start in disabled state - you need to enable them after install
- can be a webapp as well: a webapp's `/public/` directory is mounted under server's root under module id http://yourserver/moduleid


The module must export a single `function(app)` that must return an object with functions
- function `start(configuration, restartPlugin)`
- function `stop()`
- (optional, depricated) function `statusMessage()`
- property or function `schema`
- (optional) property or function  `uiSchema`.

The schema and uiSchema values can be functions so that the values can be generated dynamically.

The schema value should be the structure of the plugin's configuration data as [JSON Schema](http://json-schema.org/). The plugin can call `restartPlugin()` to restart itself. The uiSchema value is used by the user interface to provide information on how the configuration form should rendered. [The uiSchema object](https://github.com/mozilla-services/react-jsonschema-form#the-uischema-object)

(depricated, see setProviderStatus and setProviderError below)
`statusMessage` should return a shortish textual message describing the current status of the plugin, to be displayed in the plugin configuration UI.

See [Ais Reporter](https://github.com/SignalK/aisreporter/issues) for an example.

You can make sections of your schema collapsible.

For example, to make all data in an object called 'myObject' collapsible:
```
uiSchema['myObject'] = {
  'ui:field': 'collapsible',
  collapse: {
  field: 'ObjectField',
  wrapClassName: 'panel-group'
}
```

For more information, see [react-jsonschema-form-extras](https://github.com/RxNT/react-jsonschema-form-extras#collapsible-fields-collapsible)

## Making a plugin enabled by default

If your plugin does not require any initial configuration, you can make so that it is enabled by default. Add the following property to your package.json:

```json
  "signalk-plugin-enabled-by-default": true
```

## Plugin configuration files

A plugin's configuration data is saved at `SIGNALK_NODE_CONDFIG_DIR/plugin-config-data/<plugin-name>.json`. You can disable a plugin by removing its configuration file.

## Logging

The plugin configuration form has an option for turning on logging per plugin. Enabling logging will cause any deltas sent by the plugin to be logged in the server's data log.

## Getting Started with Plugin Development

- Initialise a new module with `npm init`
- Add `signalk-node-server-plugin` keyword to `package.json`
- Run `npm link` in your plugin directory to register it for linking
- Run `npm link <your-plugin-id>` in your SK server's configuration directory (default is $HOME/.signalk/) to link to your plugin as it were installed by the server
- Restart the server (with environment variable DEBUG=signalk:interfaces:plugins to get debug log output about the plugin loading process)
- Discover the stuff you need to implement from the server's error logging or read from below or use an existing plugin like [set-system-time](https://github.com/SignalK/set-system-time/blob/master/index.js) as an example
- Enable the plugin in server's admin UI 

## SERVER API FOR PLUGINS

Plugins can acces the server's delta stream and full model and provide additional data as deltas.

### app.handleMessage(pluginId, delta)

Allows the plugin to publish deltas into the server, that will handle them as any incoming deltas.

### app.getSelfPath(path)

Get a Signal K path for the self vessel's full data model.

### app.getPath(path)

Get a Signal K path starting from the root of the full data model.

### app.streambundle.getSelfStream(path)

Get a Bacon JS stream for self vessel's Signal K path. Stream values are the value properties from incoming deltas.

### app.streambundle.getSelfBus(path)

Get a Bacon JS stream for self vessel's Signal K path. Stream values are objects with structure

```
  {
    path: ...,
    value: ...,
    context: ...,
    source: ...,
    $source: ...,
    timestamp: ...
  }
```

### app.streambundle.getBus(path)

Get a Bacon JS stream for Signal K path that will stream values from any context. Stream values are objects as in getSelfBus.

### app.streambundle.getAvailablePaths()

Get a list of paths currently available in the server

```
["navigation.speedOverGround","navigation.courseOverGroundTrue","navigation.courseGreatCircle.nextPoint.position","navigation.position","navigation.gnss.antennaAltitude","navigation.gnss.satellites","navigation.gnss.horizontalDilution","navigation.gnss.positionDilution","navigation.gnss.geoidalSeparation","navigation.gnss.type","navigation.gnss.methodQuality","navigation.gnss.integrity","navigation.magneticVariation"]
```

### app.error(message)

Report errors with a human-oriented message. Currently just logs the message, but in the future error messages hopefully will show up in the admin UI.

### app.debug(...)

Log debug messages. This is the debug method from the [debug module](https://www.npmjs.com/package/debug). The npm module name is used for the debug name.

### app.savePluginOptions(options, callback)

If the plugin needs to make and save changes to its options

### app.readPluginOptions()

If the plugin needs to read plugin options from disk

### app.registerPutHandler (context, path, source, callback)

If the plugin wants to respond to PUT requests for a specific path, it should register an action handler.

The action handler can handle the request synchronously or asynchronously.

The passed callback should be a funtion taking the following arguments: (context, path, value, callback)

For synchronous actions the handler must return a value describing the response of the request: for example `{ state: 'COMPLETED', result:200 }` or `{ state:'COMPLETED', result:400, message:'Some Error Message' }`. The result value can be any valid http response code.

For asynchronous actions that may take considerable time and the requester should not be kept waiting for the result
the handler must return `{ state: 'PENDING' }`. When the action is finished the handler
 should call the `callback` function with the result with  `callback({ state: 'COMPLETED', statusCode:200 })` or
`callback({ state:'COMPLETED', statusCode:400, message:'Some Error Message' })`.

### app.registerDeltaInputHandler ((delta, next) => ...)

If the plugin wants to intercept all delta messages before they are processed by the server. The plugin callback should call
`next(delta)` with a modified delta if it wants to alter the incoming delta in some way or call `next` with the original delta
to process it normally. Not calling `next` will drop the incoming delta, it will only show in delta statistics.
Other, non delta events produced by provider pipe elements are emitted normally.

### app.setProviderStatus(msg)

msg should be a shortish textual message describing the current status of the plugin, to be displayed in the plugin configuration UI and the Dashboard.

### app.setProviderError(msg)

msg should be a shortish textual message describing an error from the plugin, to be displayed in the plugin configuration UI and the Dashboard.

## SENDING NMEA MESSAGES FROM A PLUGIN

### NMEA 2000

#### In actisense serial format

```
  app.emit('nmea2000out', '2017-04-15T14:57:58.468Z,0,262384,0,0,14,01,0e,00,88,b6,02,00,00,00,00,00,a2,08,00')
```

#### In canboat JSON format

```
  app.emit('nmea2000JsonOut', {
    pgn: 130306,
    'Wind Speed': speed,
    'Wind Angle': angle < 0 ? angle + Math.PI*2 : angle,
    'Reference': "Apparent"
  }
```

### If you need to send an N2K message out at startup, for exmaple, to get current state from a device:

```
  app.on('nmea2000OutAvailable', () => {
     app.emit('nmea2000out', 2017-04-15T14:57:58.468Z,2,6,126720,%s,%s,4,a3,99,01,00
  })
```


## PLUGIN CONFIG HTTP API

### `GET /plugins/`

List of installed plugins with their configuration data.

### `GET /plugins/<pluginid`

```
{
	"enabled": false,
	"id": "marinetrafficreporter",
	"name": "Marine Traffic Reporter"
}
```

### `POST /plugins/<pluginid/configure`

Save configuration data for a plugin. Stops and starts the plugin as a side effect.
