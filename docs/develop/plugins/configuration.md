---
title: Configuration
---

# Plugin Configuration

A plugin's {@link @signalk/server-api!Plugin.schema | `schema`} function must return a [JSON Schema](http://json-schema.org/) object describing the structure of the configuration data.

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
}
```

JSON Schema approach works reasonably well for simple to medium complex configuration data. The server supports also [custom plugin configuration components](../webapps.md), bypassing the automatic configuration format generation.

It should be noted that some JSON schema constructs are not supported. Refer to the [RJSF documentation](https://rjsf-team.github.io/react-jsonschema-form/docs/) for details.

The configuration data is stored by the server under the following path `$SIGNALK_NODE_CONFIG_DIR/plugin-config-data/<plugin-name>.json`. _(Default value of SIGNALK_NODE_CONFIG_DIR is $HOME/.signalk.)_

The plugin is passed the configuration settings as the first parameter of the {@link @signalk/server-api!Plugin.start | `start`} function.

```javascript
plugin.start = (settings, restartPlugin) => {
  // settings contains the plugin configuration
  ...
}
```

## UI Schema

The plugin can define {@link @signalk/server-api!Plugin.uiSchema | `uiSchema`} by returning a [uiSchema object](https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/uiSchema) which is used to control how the user interface is rendered in the Admin UI.

For more information, see the [RJSF documentation on uiSchema](https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/uiSchema)

## Making a plugin enabled by default

If your plugin does not require any initial configuration, you can enable it to start when the Signal K server is restarted after the plugin is installed.

To do this add the following to the `package.json`:

```json
  "signalk-plugin-enabled-by-default": true
```