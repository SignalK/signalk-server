# Server plugins


## Overview

Signal K Node server plugins are components that extend functionality of the server.
They are installed via the AppStore and configured via the Admin UI.

Signal K server exposes an interface for plugins to use in order to interact with the full data model, emit delta messages and process requests.

Plugins can also provide a webapp by placing the relavent files in a folder named `/public/` which the server will mount under `http://{skserver}:3000/{pluginId}`.

**Note: With the move towards Signal K server providing APIs to perform operations, it is important that you consider how the proposed functionality provided by your plugin aligns with the Signal K architecture before starting development.**

For example, if the plugin you are looking to develop is providing access to information such as `route,` `waypoint`, `POI`, or `charts` you should be creating a _[Resources Provider Plugin](./resource_provider_plugins.md)_ for the _[Resources API](../openapi/resources_api.md)_.

Or if you are looking to perform course calculations or integrate with an auotpilot, you will want to review the _[Course API](../openapi/course_api.md)_ documentation prior to commencing your project.


**OpenApi description for your plugin's API** 

If your plugin provides an API you should consider providing an OpenApi description. This promotes cooperation with other plugin/webapp authors and also paves the way for incorporating new APIs piloted within a plugin into the Signal K specification. _See [Add OpenAPI definition](#add-an-openapi-definition)_ below.

---

## Getting Started with Plugin Development

### Prerequisites

To get started developing your plugin you will need the following:
- Signal K server instance on your device _(clone of GIT repository or docker instance)_
- NodeJs version 18 or later and NPM installed
- SignalK server configuration folder. _(Created when Signal K server is started. default location is `$HOME/.signalk`)_. 

---

### Setting up your project

1. Create a folder for your plugin code and create the necessary file structure:
```bash
mkdir my-pluin
cd my-plugin
npm init      # create package.json file
```

2. Create the folders to hold your plugin code and webapp UI.
```bash
/my-plugin
  /plugin     # plugin (javascript code / built typesrcipt code)
    index.js
    ..
  /public     # web app UI
    index.html
    ..
  /src        # typescript source code (not required if using javascript)
    index.ts  
    ...
  package.json
```

3. Update the `package.json` to reflect your project structure and add keywords to identify the package for the Signal K AppStore.

```JSON
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My signalk plugin",
  "keywords": [
    "signalk-node-server-plugin",
    "signalk-category-ais"
  ],
  "signalk-plugin-enabled-by-default": false,
  "signalk": {
    "appIcon": "./assets/icons/icon-72x72.png",
    "displayName": "My Great WebApp"
  },
  "main": "plugin/index.js",
  ...
}
```

4. _Optional:_ Install any dependencies or third party packages.
```bash
npm i
```


### Link your project to Signal K server.

Once you have developed your plugin code and are ready to debug, the most convenient way is to use `npm link` to link your plugin code to your instance of Signal K server. 

To do this, from within a terminal window:
```bash
# Ensure you are in the folder containing your built plugin code
cd my_plugin_src

# Create a link (may require the use of sudo)
npm link

# Change to the Signal K server configuration directory
cd ~/.signalk

# Link your plugin using the name in the package.json file 
#(may require the use of sudo)
npm link my-signalk-plugin-app
```

When you start Signal K server the plugin will now appear in the **Plugin Config** screen where it can be configured and enabled.


### Debugging

The simplest way to debug your plugin is to turn on **Enable Debug log** for your plugin in the **Plugin Config** screen.

Alternatively, you can debug your plugin by starting the Signal K server with the `DEBUG` environment variable:
```bash
$ DEBUG=my-signalk-plugin signalk-server

# sample output 
my-signalk-plugin Plugin stopped +0ms
my-signalk-plugin Plugin started +2ms
```

You can also view debug information about the plugin loading process:
```bash
$ DEBUG=signalk:interfaces:plugins signalk-server

# sample output
signalk:interfaces:plugins Registering plugin my-signalk-plugin +0ms
signalk:interfaces:plugins Could not find options for plugin my-signalk-plugin, returning empty options:  +2ms
```

#### Sample Data

For development purposes, it's often nice to have some mocked data. SignalK comes with a synthesized NMEA2000 data set that can be used as sample data. 

You can enable this by adding `--sample-n2k-data` to the command line:
```bash
$ DEBUG=my-signalk-plugin signalk-server --sample-n2k-data
```
---

## Start Coding

Signal K server plugins are NodeJs `javascript` or `typescript` projects that return an object that implements the `Plugin` interface. 

They are installed into the `node_modules` folder that resides inside the SignalK server's configuration directory _(`$HOME/.signalk` by default)_. 

A Signal K plugin is passed a reference to the Signal K server plugin interface which it can use to interact with the server.

Following are code snippets that can be used as a template for plugin development ensuring the returned Plugin object contains the required  functions.

### Javascript

Create `index.js` with the following content:

```javascript
module.exports = (app) => {

  const plugin = {
    id: 'my-signalk-plugin',
    name: 'My Great Plugin',
    start: (settings, restartPlugin) => {
      // start up code goes here.
    },
    stop: () => {
      // shutdown code goes here.
    },
    schema: () => {
      properties: {
        // plugin configuration goes here
      }
    }
  };

  return plugin;
};
```

### Typescript

Create `index.js` with the following content:

```typescript
import { Plugin, PluginServerApp } from '@signalk/server-api';

module.exports = (app: PluginServerApp): Plugin => {

  const plugin: Plugin = {
    id: 'my-signalk-plugin',
    name: 'My Great Plugin',
    start: (settings, restartPlugin) => {
      // start up code goes here.
    },
    stop: () => {
      // shutdown code goes here.
    },
    schema: () => {
      properties: {
        // plugin configuration goes here
      }
    }
  };

  return plugin;
}
```

A plugin must return an object containing the following functions:

- `start(settings, restartPlugin)`: This function is called when the plugin is enabled or when the server starts (and the plugin is enabled). The `settings` parameter contains the configuration data entered via the **Plugin Config** screen. `restartPlugin` is a function that can be called by the plugin to restart itself.

- `stop()`: This function is called when the plugin is disabled or after configuration changes. Use this function to "clean up" the resources consumed by the plugin i.e. unsubscribe from streams, stop timers / loops and close devices.

- `schema()`: A function that returns an object defining the schema of the plugin's configuration data. It is used by the server to generate the user interface in the **Plugin Config** screen.

_Note: When a plugin's configuration is changed the server will first call `stop()` to stop the plugin and then `start()` with the new configuration data._ 

A plugin can also contain the following optional functions:

- `uiSchema()`: A function that returns an object defining the attributes of the UI components displayed in the **Plugin Config** screen.

- `registerWithRouter(router)`: This function (which is called during plugin startup) enables plugins to provide an API by registering paths with the Express router is passed as a parameter when invoked. It is strongly recommended that he plugin implement `getOpenAPI()` if this function is used.

_Example:_
```javascript
plugin.registerWithRouter = (router) => {
    router.get('/preferences', (req, res) => {
    res.status(200).json({
      preferences: {
        color: 'red',
        speed: 1.23
      }
    });
  });
};

```

- `getOpenApi()`: Function to return the OpenAPI definition. This should be implemented when your plugin provides HTTP endpoints for clients to call. Doing so makes the OpenAPI definition available in the server Admin UI under `Documentation -> OpenAPI`.

_Example:_
```javascript
const openapi = require('./openApi.json');

plugin.getOpenApi = () => openapi;

```

---

## Plugin configuration / Schema

A plugin's `schema` function must return a [JSON Schema](http://json-schema.org/) object decribing the structure of the configuration data. This is used by the server to render the plugin's configuration screen in the Admin UI. 

The configuration data is stored by the server under the following path `$SIGNALK_NODE_CONFIG_DIR/plugin-config-data/<plugin-name>.json`. _(Default value of SIGNALK_NODE_CONFIG_DIR is $HOME/.signalk.)_

_Example:_
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
JSON Schema approach works reasonably well for simple to medium complex configuration data. 

It should ne noted that some JSON schema constructs are not supported. Refer ([details](https://github.com/peterkelly/react-jsonschema-form-bs4/blob/v1.7.1-bs4/docs/index.md#json-schema-supporting-status)) for details. 

The server supports also [custom plugin configuration components](https://github.com/SignalK/signalk-server/blob/master/WEBAPPS.md), bypassing the automatic configuration format generation.

The plugin is passed the configuration settings as the first parameter of the `start` function.
```javascript
plugin.start = (settings, restartPlugin) => {
  // settings contains the plugin configuration
  ...
}
```

### UI Schema
The plugin can define `uiSchema` by returning a [uiSchema object](https://github.com/mozilla-services/react-jsonschema-form#the-uischema-object) which is used to control how the user interface is rendered in the Admin UI.

_Example: Make all data in an object called 'myObject' collapsible:
```javascript
uiSchema['myObject'] = {
  'ui:field': 'collapsible',
  collapse: {
    field: 'ObjectField',
    wrapClassName: 'panel-group'
  }
}
```

For more information, see [react-jsonschema-form-extras](https://github.com/RxNT/react-jsonschema-form-extras#collapsible-fields-collapsible)


### Making a plugin enabled by default
If your plugin does not require any initial configuration, you can enable it to start when the Signal K server is restarted after the plugin is installed. 

To do this add the following to the `package.json`:

```json
  "signalk-plugin-enabled-by-default": true
```
---

## Add an OpenAPI Definition

If your plugin exposes an API to interact with it then you should include an OpenAPI definition.

You do this by creating an OpenAPI definition within the file `openApi.json` and then returning the content of the file with the `getOpenApi` method.

_Example:_
```javascript
const openapi = require('./openApi.json');
...

plugin.getOpenApi = () => openapi;
```

This will include your plugin's OpenApi definition in the documentation in the server's Admin UI under _Documentation -> OpenAPI_. 

Note: If the plugin's OpenApi description DOES NOT include a `servers` property, the API path presented in the documentation will be relative to the Signal K API path. You should include this property the plugin API is rooted elsewhere.
_Example:_
```JSON
  "servers": [
    {
      "url": "/myapi/endpoint"
    }
  ],
```

See [testplugin](https://github.com/SignalK/signalk-server/tree/b82477e63ebdc14878164ce1ed3aedd80c5a8b0c/test/plugin-test-config/node_modules/testplugin) for an example.

---

## Logging

To record deltas sent by the plugin in the server's data log, enable the **Log plugin output** in the plugin configuration screen. 

---

## Removing a plugin

Plugins can be removed via the AppStore.

You can also remove a plugin manually by:
1. Deleting it's folder under `~/.signalk/node_modules`
1. Deleting it's entry from `~/.signalk/package.json`
1. Run `npm prune` from the `~/.signalk/` directory.

Alternatively you can:
1. Remove the folder `~/.signalk/node_modules`
1. Run `npm install` from the `~/.signalk/` directory.


Finally you can remove the plugin setting file in `~/.signalk/plugin-config-data/`.

---

## Examples

Following are links to some published SignalK plugins that serve as an example of working plugins:
- [set-system-time](https://github.com/SignalK/set-system-time/blob/master/index.js)
- [Ais Reporter](https://github.com/SignalK/aisreporter/issues)
