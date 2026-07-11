---
title: Plugin API
---

# Plugin configuration HTTP API

## `GET /plugins/`

Get a list of installed plugins and their configuration data.

## `GET /plugins/<pluginid>`

Get information from an installed plugin.

Example result:

```json
{
  "enabled": false,
  "id": "marinetrafficreporter",
  "name": "Marine Traffic Reporter"
}
```

## `POST /plugins/<pluginid>/configure`

Save configuration data for a plugin. Stops and starts the plugin as a side effect.

## Authentication

All plugin routes under `/plugins/<pluginid>/` require admin authentication by default. Plugins can open specific routes up to `readwrite` or `readonly` users by registering them via `router.access(level)`. The reserved paths `/` and `/config` always remain admin-only and cannot be downgraded. See [Plugin development](../plugins/README.md) for details.
