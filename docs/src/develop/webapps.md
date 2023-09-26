# WebApps and Components

## Introduction

Signal K Server provides the following ways to add web-based user interfaces to enhance functionality and usability:

1. **Standalone WebApps** are web applications that when launched, the server Admin UI disappears and the webapp controls the whole page (browser window / tab).

1. **Embedded WebApps**  are web applications that when launched, are **embedded in the server Admin UI**, leaving the toolbar and menu available to the user.
![vesselpositions](../img/vesselpositions.png "Vesselpositions Embedded Webapp")

1. **Embedded Plugin Configuration Forms** are forms provided by a plugin that the server embeds within the _Plugin Config_ screen to replace the generic form rendered using the plugin _configuration schema_. This allows a richer set of controls to be provided for the user to configure the plugin compared to the more generice server generated form provides. 
![calibration](../img/calibration.png "Calibration plugin configuration form")

1. **Embedded Components** are individual UI components provided by a plugin or a webapp. They are listed in the _Addons_ section at the bottom of the _Webapps_ page of the Admin UI. More a concept than a fully implemented feature at this stage, the idea is to allow a plugin to add individual components to different parts of the server UI.

All Plugins, WebApps and Components can be installed via the _Appstore_.

## WebApp Structure

All WebApps (like plugins) are installed with `npm`, either from the npm registry or from your own Github repository. Only WebApps that are relevant for all users should be published to `npm` to be made available in the _Appstore_ of all Signal K Servers.

_Note: Private plugins need not be published to `npm` - see the documentation for [npm install](https://docs.npmjs.com/cli/v6/commands/npm-install) for details._ 


The basic structure of a webapp is: 
- A folder named `public` that contains the html, JavaScript and resource files such as images, fonts and style sheets. This folder is automatically mounted by the server so that the webapp is available after installation and the server restarted.
- `package.json` containing special keywords that classifies the webapp:
  - `signalk-webapp` - standalone webapp
  - `signalk-embeddable-webapp` - embeddable webapp
  - `signalk-plugin-configurator` - plugin configuration form

This structure is all that is needed for a standalone webapp.

You can also include the following section in `package.json` to control how your webapp appears in the _Webapps_ list:
```JSON
  "signalk": {
    "appIcon": "./assets/icons/icon-72x72.png",
    "displayName": "Freeboard-SK"
  },
```

where:
- `appIcon` is the path (relative to the `public` directory) to an image within the package to display in the webapp list. The image should be at least 72x72 pixels in size.
- `displayName` is the text you want to appear as the name in the webapp list. _(By default the _name_ attribute in the `package.json` is used.)_

See also [Working Offline](./developer_notes.md#offline-use).


## Embedded Components and Admin UI / Server interfaces

Embedded components are implemented using [Webpack Federated Modules](https://webpack.js.org/concepts/module-federation/) and [React Code Splitting](https://reactjs.org/docs/code-splitting.html).

_Note: There is no keyword for a module that provides only embedded components, use `signalk-webapp` instead._

You need to configured Webpack to create the necessary code for federation using *ModuleFederationPlugin* and expose the component with fixed names:
- embeddable webapp: `./AppPanel`
- plugin configuration form: `./PluginConfigurationPanel`
- embedded component: `./AddonPanel`

The ModuleFederationPlugin library name must match the package name and be a "safe" name for a webpack module like in `library: { type: 'var', name: packageJson.name.replace(/[-@/]/g, '_') },`

The exposed modules need to `export default` a React component - both class based components and stateless functional components can be used. The server dependencies like `reactstrap` can and should be used. Add `@signalk/server-admin-ui-dependencies` as a dependency to the webapp, it defines the depedencies used by the server admin UI.

See the vesselpositions embedded webapp/component and Calibration plugin for examples of each. It is probably easier to start with either one and modify them to suit your needs. Don't forget to change the module id and name in package.json!


## WebApp / Component and Admin UI / Server interfaces

Standalone WebApps can use the server's APIs _(Signal K http and WebSocket APIs as well as any server specific endpoints)_ but they need to implement everything else themselves.

Embedded WebApps, Components and Plugin Configuration Forms work inside the Admin UI, so they can interact with both the Admin UI and the server using APIs exposed by the Admin UI as component properties.


Embedded webapp properties:
- access to the login status of the browser user
- ability to render Login form instead of the webapp content
- getting and setting application data
- opening an automatically reconnecting WebSocket connection to the server
- getting Signal K data via `get`
- [Embedded](https://github.com/SignalK/signalk-server/blob/master/packages/server-admin-ui/src/views/Webapps/Embedded.js)

PluginConfigurationForm properties:
- `configuration` : the configuration data of the plugin
- `save`: function to save the configuration data
- [EmbeddedPluginConfigurationForm](https://github.com/SignalK/signalk-server/blob/master/packages/server-admin-ui/src/views/Configuration/EmbeddedPluginConfigurationForm.js)


**_Note: The documentation regarding embedded WebApps and Components provided at this time is rudimentary and should be considered under development as the concept is evolving._**