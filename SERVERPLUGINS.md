# Server plugins

![image](https://user-images.githubusercontent.com/1049678/35973231-5d89ad56-0cdd-11e8-9d89-42313b468520.png)
![image](https://user-images.githubusercontent.com/1049678/35973284-7e1c319c-0cdd-11e8-918f-53bad7a3b706.png)

## Overview

Signal K Node server plugins are components that run within the server and add some functionality to the server. You can configure them via the admin UI.

Plugins
- are installed, activated/disabled and configured from the server admin UI
- start in disabled state - you need to enable them after install
- can be webapps as well: a webapp's `/public/` directory is mounted under server's root under module id http://yourserver/moduleid
- are npm modules that become available to the server when they are published to the npm repository with the `signalk-node-server-plugin` keyword


The plugin module must export a single `function(app)` that must return an object with the following:
- function `start(configuration, restartPlugin)`: This function will be called when the plugin is activated or when the server starts and the plugin is activated. Here you'll setup your plugin, subscribe to streams, connect to devices or start async loops to fetch data.
- function `stop()`: This function is called when the plugin is deactivated. Here you typically unsubscribe from streams, stop loops that fetch data or close devices.
- property or function `schema`: The structure returned from this property or function defines the configuration of the plugin and is exposed in the UI.
- (optional) property or function  `uiSchema`: The returned structure defines additional UI components or effects.

## Getting Started with Plugin Development

To get started with SignalK plugin development, you can follow the following guide.

### Project setup

First, create a new directory and initialize a new module:

```
$ mkdir my-signalk-plugin
$ cd my-signalk-plugin
$ npm init
```

Then, add `signalk-node-server-plugin` keyword to `package.json`, so it looks something like this:

```javascript
{
  "name": "my-signalk-plugin",
  "version": "1.0.0",
  "description": "My great signalk plugin",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "author": "",
  "license": "ISC",
  "keywords": [
    "signalk-node-server-plugin"
  ]
}
```

Plugins are normally installed in `node_modules` inside SignalK server's configuration directory (`$HOME/.signalk` by default). For development we can use `npm link` to link your module into the modules directory of the server. This way you can develop outside of the source tree of the server and publish your plugin separately.

First, prepare your plugin for linking:
```
$ npm link
...

/usr/local/lib/node_modules/my-signalk-plugin -> /home/me/dev/my-signalk-plugin
```

Then from your SignalK server's configuration directory (`$HOME/.signalk/` by default), you link your plugin.

```
$ cd ~/.signalk
$ npm link my-signalk-plugin
...

/home/me/.signalk/node_modules/my-signalk-plugin -> /usr/local/lib/node_modules/my-signalk-plugin -> /home/me/dev/my-signalk-plugin
```

### Plugin skeleton

In your module directory, create `index.js` with the following content:

```javascript
module.exports = function (app) {
  var plugin = {};

  plugin.id = 'my-signalk-plugin';
  plugin.name = 'My Great Plugin';
  plugin.description = 'Plugin that does stuff';

  plugin.start = function (options, restartPlugin) {
    // Here we put our plugin logic
    app.debug('Plugin started');
  };

  plugin.stop = function () {
    // Here we put logic we need when the plugin stops
    app.debug('Plugin stopped');
  };

  plugin.schema = {
    // The plugin schema
  };

  return plugin;
};

```

You should be able to restart the server now. If you set the `DEBUG` environment variable, you can get debug output about the plugin loading process:

```
$ DEBUG=signalk:interfaces:plugins signalk-server
```

And you should see something like:
```
signalk:interfaces:plugins Registering plugin my-signalk-plugin +0ms
signalk:interfaces:plugins Could not find options for plugin my-signalk-plugin, returning empty options:  +2ms
```

After everything loads well, you can debug your own plugin by running:

```
$ DEBUG=my-signalk-plugin signalk-server
```

You should be able to now enable your plugin in the admin UI (although it doesn't do anything yet).

You should see something like this in your console:
```
my-signalk-plugin Plugin stopped +0ms
my-signalk-plugin Plugin started +2ms
```

For development purposes, it's often nice to have some mocked data. SignalK comes with a synthesized NMEA2000 data set that can be used as sample data. You can enable this by adding `--sample-n2k-data` to the command line:

```
$ DEBUG=my-signalk-plugin signalk-server --sample-n2k-data
```

### Deltas

Most of the time your plugin wants to either process data that the server gathers (e.g. data that is coming from a NMEA 2000 bus or another source) or generate data for the server to consume (e.g. data you capture from a device or the internet). In both cases you'll often work with *deltas*; data structures that describe a change in Signal K's internal data model. 

The [Signal K Delta Specification](http://signalk.org/specification/1.3.0/doc/data_model.html#delta-format) defines deltas that are used to send updates to clients. The delta format describes messages that may contain 1 or more updates - it is an envelope format and you can stuff more than one thing in a message.

However most of the time a data consumer like a plugin is interested in updates to just a few particular data items. This is why the server's plugin API uses *denormalized deltas* to allow handling data items independently. When you handle the individual items separately you do not need to go through the delta's envelope format to find the item that you have interest in.

Note that deltas contain absolute values and not a change in the value itself, but denote a change in the data model.

Denormalized deltas have the following structure:
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

The following delta shows a change in `navigation.position` and contains the updated `longitude` and `latitude` for this specific vessel:
```javascript
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
```
## Paths
To be able to access data in SignalK's data model, there is the notion of *paths*. Paths are like keys in a hashmap or dictionary, but traverse branches.

Say we have the following data:
```javascript
{
  vessels: {
    ...
  },
  shore: {
    basestations: {
      'urn:mrn:imo:mmsi:2766140': [Object],
      'urn:mrn:imo:mmsi:2766160': [Object],
      'urn:mrn:imo:mmsi:2300048': [Object],
      'urn:mrn:imo:mmsi:2300047': [Object]
    }
  }
}
```
We can access all the base stations with the path `shore.basestations` or even a single base station through the path `shore.basestations.urn:mrn:imo:mmsi:2766140`.

## Contexts
The SignalK data model also provides different contexts. In some cases you want your plugin to only process data that is coming from your own vessel, while in other cases you want to receive data from other contexts (e.g. other vessels, base stations ashore, etc). Contexts allow you to only receive deltas for parts of the data model.

SignalK server has a shortcut to your own vessels' context through `vessels.self`. Sometimes you can configure the context (like in the subscription example above), so you don't have to filter out the deltas that are coming from your own vessel.

In other cases you might want to use a specific context (e.g. when you want only deltas from another vessel) and sometimes you want all the deltas, regardless of their context. In the latter case, you can use `*`.

### Processing data from the server
You can get the value of a path or subscribe to updates for one or more paths (e.g. `navigation.datetime`).

Since paths are hierarchical, paths can contain wildcards (like `*`).

Let's start with getting the value of `uuid` inside our `plugin.start` function:

```javascript
let value = app.getSelfPath('uuid');
app.debug(value); // Should output something like urn:mrn:signalk:uuid:a9d2c3b1-611b-4b00-8628-0b89d014ed60
```

Secondly, we can subscribe to a stream of updates (deltas) for a specific path. We can create the subscription inside our `plugin.start` function:

```javascript
var unsubscribes = [];

plugin.start = function (options, restartPlugin) {
  app.debug('Plugin started');
  let localSubscription = {
    context: '*', // Get data for all contexts
    subscribe: [{
      path: '*', // Get all paths
      period: 5000 // Every 5000ms
    }]
  };

  app.subscriptionmanager.subscribe(
    localSubscription,
    unsubscribes,
    subscriptionError => {
      app.error('Error:' + subscriptionError);
    },
    delta => {
      delta.updates.forEach(u => {
        app.debug(u);
      });
    }
  );
};
```

Since we would like to unsubscribe from updates when the plugin stops, we create an empty array that called `unsubscribes`. This array will be populated with unsubscribe functions by the `subscriptionmanager`. When the plugin stops, we can call these functions.

We create a subscription definition and pass that to `app.subscriptionmanager.subscribe()` as the first argument.
The second argument takes our `unsubscribes` array and the third argument takes a function that will be called when there's an error. The last argument should be a function that handles the delta update; in our case we just debug print the output.

Now we can add the following to our `plugin.stop` function:

```javascript
plugin.stop = function () {
  unsubscribes.forEach(f => f());
  unsubscribes = [];
};
```
Here we loop though all the unsubscribe functions for our subscriptions and call each function.

Now restart the server and you should see deltas being output in your console.

## Sending NMEA 2000 data from a plugin

A SignalK plugin can not only read deltas, but can also send data. The following examples show how you can emit NMEA 2000 data.

### Actisense serial format

To send a message in the Actisense serial format, simply use `app.emit()` in the following way:
``` javascript
  app.emit(
    'nmea2000out',
    '2017-04-15T14:57:58.468Z,0,262384,0,0,14,01,0e,00,88,b6,02,00,00,00,00,00,a2,08,00');
```

### Canboat JSON format

To send data in  `canboat` JSON format, use `app.emit()` in the following way:

```javascript
  app.emit('nmea2000JsonOut', {
    pgn: 130306,
    'Wind Speed': speed,
    'Wind Angle': angle < 0 ? angle + Math.PI*2 : angle,
    'Reference': "Apparent"
  });
```

### Sending a message on NMEA2000 startup

If you need to send an N2K message out at startup, e.g to get current state from a device:

```javascript
  app.on('nmea2000OutAvailable', () => {
     app.emit(
       'nmea2000out',
       '2017-04-15T14:57:58.468Z,2,6,126720,%s,%s,4,a3,99,01,00');
  });
```

## Schema

Every plugin defines a `schema` that is used by the server to render the plugins' configuration screen. Within the module, `schema` can either be a property or a function that returns a [JSON Schema](http://json-schema.org/) structure describing the plugin's configuration data.

For example:
```javascript
  plugin.schema = {
    type: 'object',
    required: ['some_string', 'some_other_number'],
    properties: {
      some_string: {
        type: 'string',
        title: 'Some string that the plugin needs'
      },
      some_number: {
        type: 'number',
        title: 'Some number that the plugin needs',
        default: 60
      },
      some_other_number: {
        type: 'number',
        title: 'Some other number that the plugin needs',
        default: 5
      }
    }
  };
```

The configuration is passed in to the `plugin.start` function as the first argument:

```javascript
plugin.start = function (options, restartPlugin) {
  // options contains the plugin configuration
  ...
}
```

### UI Schema
The `uiSchema` value is used by the user interface to provide information on how the configuration form should rendered and should conform [the uiSchema object](https://github.com/mozilla-services/react-jsonschema-form#the-uischema-object).

In the Admin UI, you can make sections of your configuration collapsible. E.g. to make all data in an object called 'myObject' collapsible:
```javascript
uiSchema['myObject'] = {
  'ui:field': 'collapsible',
  collapse: {
  field: 'ObjectField',
  wrapClassName: 'panel-group'
}
```

For more information, see [react-jsonschema-form-extras](https://github.com/RxNT/react-jsonschema-form-extras#collapsible-fields-collapsible)


## Restarting a plugin
As you might have seen, the second argument of `plugin.start` is called `pluginRestart`. This is a function that is passed to be able to restart the plugin. A plugin can call `restartPlugin()` to restart itself.

## Removing a plugin

If you have have installed the server from npm and have used the setup script the plugins that you have installed yourself are installed under `~/.signalk/node_modules` and listed in `~/.signalk/package.json`. If you want to remove a plugin you should remove it from `package.json` and then either run `npm prune` in `~/.signalk/` directory or wipe `~/.signalk/node_modules` and run `npm install` in `~/.signalk/`.

Plugin settings are stored in `~/.signalk/plugin-config-data/` and can just delete the settings file for the plugin you are removing.

## Making a plugin enabled by default
If your plugin does not require any initial configuration, you can enable it by default. Add the following property to your `package.json`:

```json
  "signalk-plugin-enabled-by-default": true
```

## Plugin configuration files

A plugin's configuration data is saved at `SIGNALK_NODE_CONFIG_DIR/plugin-config-data/<plugin-name>.json`. You can disable a plugin by removing its configuration file.

## Logging

The plugin configuration screen has an option for turning on logging per plugin. Enabling logging will cause any deltas sent by the plugin to be logged in the server's data log.

## Examples

Some easier to understand examples of SignalK plugins are:
- [set-system-time](https://github.com/SignalK/set-system-time/blob/master/index.js)
- [Ais Reporter](https://github.com/SignalK/aisreporter/issues)

# Server API for plugins

Internally, SignalK server builds a full data model. Plugins can access the server's delta stream (updates) and full model and provide additional data as deltas using the following functions.

### `app.handleMessage(pluginId, delta)`

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
  app.registerPutHandler('vessels.self', 'some.path', myActionHandler);
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

### `app.setProviderStatus(msg)`

Set the current status of the plugin. The `msg` should be a short message describing the current status of the plugin and will be displayed in the plugin configuration UI and the Dashboard.

```javascript
app.setProviderStatus('Initializing');
// Do something
app.setProviderStatus('Done initializing');
```

### `app.setProviderError(msg)`

Set the current error status of the plugin. The `msg` should be a short message describing the current status of the plugin and will be displayed in the plugin configuration UI and the Dashboard.

```javascript
app.setProviderError('Error connecting to database');
```

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
