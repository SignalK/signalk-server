---
title: Publishing to The AppStore
---

# Publishing to The AppStore

Plugins and WebApps are available in the AppStore when they have been published to [npm repository](https://www.npmjs.com/) with the one or more of the following keywords in the `package.json` file:

- `signalk-node-server-plugin`
- `signalk-webapp`

Additionally you can have your plugin appear within one or more AppStore categories by also adding the following keyword(s):

- `signalk-category-chart-plotters`
- `signalk-category-nmea-2000`
- `signalk-category-nmea-0183`
- `signalk-category-instruments`
- `signalk-category-hardware`
- `signalk-category-ais`
- `signalk-category-notifications`
- `signalk-category-digital-switching`
- `signalk-category-utility`
- `signalk-category-cloud`
- `signalk-category-weather`
- `signalk-category-deprecated`
- `signalk-category-hidden` (won't show on the App Store)

To have your plugin start automatically after being installed, without requiring any configuration via the **Plugin Config** screen add the following key to the `package.json` file:

```JSON
"signalk-plugin-enabled-by-default": true
```

To control the way your WebApp is displayed in the Admin UI add a `signalk` key with the following attributes:

```JSON
  "signalk": {
    "appIcon": "./img/icon-72x72.png", // path to an image file to use as an icon.
    "displayName": "My SK App" // name to display in place of the package name.
  }
```

_Example: package.json_

```JSON
{
  "name": "my-signalk-plugin-app",
  "version": "1.0.0",
  "description": "My great signalk plugin-app",
  "keywords": [
    "signalk-node-server-plugin",
    "signalk-webapp",
    "signalk-category-ais"
  ],
  "signalk-plugin-enabled-by-default": true,
  "signalk": {
    "appIcon": "./assets/icons/icon-72x72.png",
    "displayName": "My Great WebApp"
  },
  "main": "plugin/index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "author": "",
  "license": "ISC"
}
```

#### Publishing your Plugin

Once you have developed and tested your Plugin / WebApp you can publish it to make it visible in the AppStore.
To do this, in a terminal session from within the folder containing `package.json`:

```shell
npm publish
```
