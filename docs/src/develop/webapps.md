# Webapps and components

## Introduction

There are four ways to add web-based user interfaces to the Signal K Server:

- Standalone Webapps
- Embedded Webapps
- Embedded Plugin Configuration Forms
- Embedded Compontents

**Standalone Webapps** are Webapps that can be installed on the server via Appstore. The server provides a list of installed webapps. Once you navigate to them the server admin UI disappears and the webapp controls the whole page (browser window / tab).

**Embedded Webapps** are installed and listed like Standalone Webapps, but they open **embedded in the server admin UI**, leaving the header and footer available so that the user can perform login, restart server and use the admin UI's sidebar to navigate to a different part of the admin UI.

![vesselpositions](../img/vesselpositions.png?raw=true "Vesselpositions Embedded Webapp")

**Embedded Plugin Configuration Forms** are related to server plugins. A plugin provides a schema for the configuration data it uses. The server uses the schema - a description of the structure of the data used to configure the plugin - to generate configuration forms for the installed plugins. The generated form is often lackin in usability due to it being totally generic. To address this a plugin can provide its own **Configuration Form** that the server embeds within the Plugin Configuration of the server admin UI.

![calibration](../img/calibration.png?raw=true "Calibration plugin configuration form")

**Embedded Components** are individual UI components provided by a plugin or a webapp. They are currently available at the bottom of the Webapps page of the admin UI. The idea with embedding components would be to allow a plugin to add individual components to different parts of the server, but this is more an idea than a fully implemented feature at this stage.

## Webapp/Component Structure

All different webapps (and server plugins) are installed with npm, from npm registry or for example from your own Github repository. Private plugins need not be published to npm - see the documentation for [npm install](https://docs.npmjs.com/cli/v6/commands/npm-install) for the exact details. Only webapps that are relevant for all users should be published in npm to be available in App store of everybody's server.

The basic structure of a webapp is 
- directory named `public` that contains the actual webapp: html, JavaScript and resources such as images and css files. This directory is automatically mounted by the server so that the webapp is available via http once installed
- package.json with special keywords that classifies the webapp
  - `signalk-webapp` - standalone webapp
  - `signalk-embeddable-webapp` - embeddable webapp
  - `signalk-plugin-configurator` - plugin configuration form

This structure is all that is needed for a standalone webapp.

You can also include the following section in `package.json` to determine how your webapp appears in the _Webapps_ list:
```JSON
  "signalk": {
    "appIcon": "./assets/icons/icon-72x72.png",
    "displayName": "Freeboard-SK"
  },
```

where:
- `appIcon` is the path (relative to the `public` directory) to an image within the package to display in the webapp list. The image should be at least 72x72 pixels in size.
- `displayName` is the name to appear in the webapp list. By default the `name` in the package.json is used, when supplied this text will be used instead.

The embedded components are implemented using [Webpack Federated Modules](https://webpack.js.org/concepts/module-federation/) and [React Code Splitting](https://reactjs.org/docs/code-splitting.html).

There is no keyword for a module that provides only embedded components, use `signalk-webapp` instead.

You need to configured Webpack to create the necessary code for federation using *ModuleFederationPlugin* and expose the component with fixed names:
- embeddable webapp: `./AppPanel`
- plugin configuration form: `./PluginConfigurationPanel`
- embedded component: `./AddonPanel`

The ModuleFederationPlugin library name must match the package name and be a "safe" name for a webpack module like in `library: { type: 'var', name: packageJson.name.replace(/[-@/]/g, '_') },`

The exposed modules need to `export default` a React component - both class based components and stateless functional components can be used. The server dependencies like `reactstrap` can and should be used. Add `@signalk/server-admin-ui-dependencies` as a dependency to the webapp, it defines the depedencies used by the server admin UI.

See the vesselpositions embedded webapp/component and Calibration plugin for examples of each. It is probably easier to start with either one and modify them to suit your needs. Don't forget to change the module id and name in package.json!


## Webapp / Component and Admin UI / Server interfaces

Standalone Webapps can use the server's APIs (Standard Signal K http and WebSocket APIS as well as the server's endpoints) but they need to implement everything themselves.

Embedded Webapps, Components and Plugin Configuration Forms work inside the Admin UI and they can interact with the Admin UI and the server with APIs exposed by the Admin UI as component properties.

This documentation is rudimentary on purpose, as the details need to be worked out.

Embedded webapp properties
- access to the login status of the browser user
- ability to render Login form instead of the webapp content
- getting and setting application data
- opening an automatically reconnecting WebSocket connection to the server
- getting Signal K data via `get`
- [Embedded](packages/server-admin-ui/src/views/Webapps/Embedded.js)

PluginConfigurationForm properties
- `configuration` : the configuration data of the plugin
- `save`: function to save the configuration data
- [EmbeddedPluginConfigurationForm](packages/server-admin-ui/src/views/Configuration/EmbeddedPluginConfigurationForm.js)

