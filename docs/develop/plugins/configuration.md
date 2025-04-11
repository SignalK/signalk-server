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

It should ne noted that some JSON schema constructs are not supported. Refer ([details](https://github.com/peterkelly/react-jsonschema-form-bs4/blob/v1.7.1-bs4/docs/index.md#json-schema-supporting-status)) for details.

The configuration data is stored by the server under the following path `$SIGNALK_NODE_CONFIG_DIR/plugin-config-data/<plugin-name>.json`. _(Default value of SIGNALK_NODE_CONFIG_DIR is $HOME/.signalk.)_

The plugin is passed the configuration settings as the first parameter of the {@link @signalk/server-api!Plugin.start | `start`} function.

```javascript
plugin.start = (settings, restartPlugin) => {
  // settings contains the plugin configuration
  ...
}
```

## UI Schema

The plugin can define {@link @signalk/server-api!Plugin.uiSchema | `uiSchema`} by returning a [uiSchema object](https://github.com/mozilla-services/react-jsonschema-form#the-uischema-object) which is used to control how the user interface is rendered in the Admin UI.

_Example: Make all data in an object called 'myObject' collapsible:_

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

## Making a plugin enabled by default

If your plugin does not require any initial configuration, you can enable it to start when the Signal K server is restarted after the plugin is installed.

To do this add the following to the `package.json`:

```json
  "signalk-plugin-enabled-by-default": true
```
