# Server plugins

Signal K Node server plugins are components that run within the server and add some functionality to the server. You can configure them via the admin ui.

Plugins
- are npm modules published in the npm repository with the `signalk-node-server-plugin` keyword 
- are installed, activated/disabled and configured from the server admin UI
- start in disabled state - you need to enable them after install
- can be a webapp as well: a webapp's `/public/` directory is mounted under server's root under module id http://yourserver/moduleid


The module must export a single `function(app)` that must return an object with functions `start(configuration, restartPlugin)` and `stop` and a property named `schema`. The schema value should be the structure of the plugin's configuration data as [JSON Schema](http://json-schema.org/). The pluging can call `restartPlugin()` to restart itself.

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
