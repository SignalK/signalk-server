---
title: Breaking Changes
---

# Breaking Changes & Deprecations

This document lists breaking changes and deprecations in Signal K Server.

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

## Security: Anonymous Read Access Disabled by Default

When security is first enabled on a new installation, `allow_readonly` now defaults to `false`. Previously it defaulted to `true`, meaning anyone could read all Signal K data without authentication.

### Impact

- **New installations** will require authentication for all access, including read-only. Devices like chart plotters and instrument displays that previously worked without a token will need to be configured with access credentials.
- **Existing installations** are **not affected** — the `allow_readonly` value is already written explicitly in `security.json` and will be preserved.

### Mitigation

During initial security setup, the Enable Security dialog offers an **"Allow Readonly Access"** checkbox to opt in. Alternatively, you can enable it at any time in **Security > Settings**.

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
