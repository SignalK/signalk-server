---
title: Breaking Changes
---

# Breaking Changes & Deprecations

This document lists breaking changes and deprecations in Signal K Server.

---

## NMEA 2000 Source Identification: CAN Name

NMEA 2000 sources are now identified by their **CAN Name** instead of the N2K source address. The CAN Name is a stable, globally unique identifier derived from the device's ISO Address Claim (PGN 60928).

### What Changed

| Before                                                | After                                         |
| ----------------------------------------------------- | --------------------------------------------- |
| `$source = "can0.22"`                                 | `$source = "can0.Furuno_SCX-20"`              |
| Source address changes when devices are added/removed | CAN Name is stable regardless of bus topology |

### Impact

- **Source Priority configuration** — Existing `sourcePriorities` entries in `settings.json` that reference old-style source addresses (e.g. `can0.22`) will no longer match. You will need to reconfigure source priorities using the new CAN Name identifiers via _Data -> Source Priority_ in the Admin UI.

- **Security ACLs** — If you have ACL rules that filter by `$source` (e.g. `"sources": ["can0.22"]`), these need to be updated to use the CAN Name format.

- **Plugins** — Plugins that compare or store `$source` values for N2K devices should be aware that the format has changed. Plugin-originated sources (using `app.handleMessage(plugin.id, ...)`) are not affected.

- **WebSocket clients** — Clients that parse or filter by `$source` will see the new format for N2K sources.

### Migration

Open _Data -> Source Priority_ in the Admin UI to reconfigure priorities with the new identifiers. The Source Ranking and Path-Level Override dropdowns show the device manufacturer and model name alongside the CAN Name, making it easy to identify devices.

---

## Source Priority: All Source Data Preserved

Previously, the source priority engine discarded data from non-preferred sources entirely — it never reached the delta cache, data model, or WebSocket subscribers. Lower-priority sensors were invisible to the server and all clients.

Now, **all source data is preserved** in the server's data model. The priority engine filters at the subscription level rather than at ingest time. This means:

- All sources are stored in the delta cache and available via the REST API at `/signalk/v1/api/`
- WebSocket subscribers receive preferred-source data by default, but can opt in to all sources with `sourcePolicy=all`

This is a behavioral change — plugins and clients that previously only saw the preferred source's data may now see additional sources when querying the data model directly. WebSocket subscriptions are not affected unless `sourcePolicy=all` is explicitly requested.

---

## Admin UI: React 19 Migration

The Admin UI has been upgraded from React 16 to **React 19**. This is a significant update that may affect embedded webapps and plugin configuration panels.

### What Changed

| Component    | Before     | After      |
| ------------ | ---------- | ---------- |
| React        | 16.14.0    | 19.x       |
| React DOM    | 16.14.0    | 19.x       |
| React Router | 4.x        | 6.x        |
| Language     | JavaScript | TypeScript |

### Impact on Embedded Webapps

**If your webapp uses Module Federation to share React with the Admin UI:**

1. **Singleton sharing is now required** - Your webapp must configure React and ReactDOM as singletons with `requiredVersion: false`. See [vite.config.js](https://github.com/SignalK/signalk-server/blob/master/packages/server-admin-ui-react19/vite.config.js) for the current configuration.

2. **React 19 compatibility** - If your webapp bundles its own React, it should be compatible with components rendered by the host. Most React 16/17/18 code works unchanged in React 19, but some deprecated APIs have been removed.

3. **String refs removed** - React 19 no longer supports string refs (`ref="myRef"`). Use `useRef()` instead.

4. **`defaultProps` on function components** - Deprecated. Use JavaScript default parameters instead.

### Impact on Plugin Configuration Panels

Plugin configuration panels using `./PluginConfigurationPanel` export continue to work. The props interface remains the same:

- `configuration` - the plugin's configuration data
- `save` - function to save configuration

### No Impact

- **Standalone webapps** - Webapps that don't use Module Federation sharing are not affected
- **Server APIs** - All Signal K HTTP and WebSocket APIs remain unchanged
- **Plugin JavaScript APIs** - Server-side plugin APIs are not affected

---

## REST API Changes

The following changes have been implemented with the introduction of **Resources API** and apply to applications using the `./signalk/v2/resources` endpoint.

_Note: These changes DO NOT impact applications using the `./signalk/v1/resources` endpoint._

### 1. Resource ID prefix assignment

The version 1 specification defined resource Ids with the following format `urn:mrn:signalk:uuid:<UUIDv4>`.

_e.g. `urn:mrn:signalk:uuid:18592f80-3425-43c2-937b-0be64b6be68c`_

The Resource API has dropped the use the prefix and ids are now just a uuidv4 value.

_e.g. `18592f80-3425-43c2-937b-0be64b6be68c`_

This format is used for both accessing a resource _e.g. `/signalk/v1/api/resources/waypoints/18592f80-3425-43c2-937b-0be64b6be68c`_ as well as the value within an `href` attribute.

_Example:_

```
{
   "name": "...",
   "descripton": "...",
   "href": "/resources/waypoints/18592f80-3425-43c2-937b-0be64b6be68c",
   ...
}
```

### 2. Resource Attributes

The Resources API has updated the definition of the following resources and may break applications that simply shift to using the `v2` api without catering for the changes:

- **routes**: removed the `start`, `end` properties.
- **waypoints**: removed `position` attribute, added `name`, `description` and `type` attributes.
- **regions**: removed `geohash` attribute, added `name` and `description` properties.
- **notes**: removed `geohash` and `region` attributes, added `href` and `properties` attributes.
- **charts**: There has been a significant changes to include support for WMS, WMTS and TileJSON sources.

Please see the [Resources OpenAPI definition](https://github.com/SignalK/signalk-server/blob/master/src/api/resources/openApi.json) for details.

---

## Deprecations:

### 1. courseGreatCircle, courseRhumbline paths

With the introduction of the Course API the following paths should now be considered deprecated:

- `/signalk/v1/api/vessels/self/navigation/courseGreatCircle`
- `/signalk/v1/api/vessels/self/navigation/courseRhumbline`

_Note: The Course API does currently maintain values in these paths for the purposes of backward compatibility, but applications and plugins referencing these paths should plan to move to using the equivalent paths under `/signalk/v2/api/vessels/self/navigation/course`._
