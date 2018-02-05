# Server plugins

Signal K Node server plugins are components that run within the server and add some functionality to the server. You can configure them via the admin ui.

Plugins
- are npm modules published in the npm repository with the `signalk-node-server-plugin` keyword 
- are installed, activated/disabled and configured from the server admin UI
- start in disabled state - you need to enable them after install
- can be a webapp as well: a webapp's `/public/` directory is mounted under server's root under module id http://yourserver/moduleid


The module must export a single `function(app)` that must return an object with functions `start(configuration, restartPlugin)` and `stop`, a property named `schema` and an optional property named `uiSchema`. The schema value should be the structure of the plugin's configuration data as [JSON Schema](http://json-schema.org/). The pluging can call `restartPlugin()` to restart itself. The uiSchema value is used by the user interface to provide information on how the configuration form should rendered. [The uiSchema object](https://github.com/mozilla-services/react-jsonschema-form#the-uischema-object)

The schema and/or uiSchema values can be functions so that the values can be generated dynamically.

See [Ais Reporter](https://github.com/SignalK/aisreporter/issues) for an example.

## Plugin configuration files

A plugin's configuration data is saved at `SIGNALK_NODE_CONDFIG_DIR/plugin-config-data/<plugin-name>.json`. You can disable a plugin by removing its configuration file.

## Logging

The plugin configuration form has an option for turning on logging per plugin. Enabling logging will cause any deltas sent by the plugin to be logged in the server's data log.

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
