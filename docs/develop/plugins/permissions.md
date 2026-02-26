---
title: Permissions & PUT Handlers
---

# Plugin Permissions & PUT Handlers

This guide explains how Signal K's permission system affects plugins and how to choose the right approach for handling write operations.

## Permission Levels

Signal K server has three permission levels:

| Level     | Access                                                  |
| --------- | ------------------------------------------------------- |
| **read**  | Read data via REST and WebSocket                        |
| **write** | Read + send PUT requests to Signal K paths              |
| **admin** | Write + manage server configuration, plugins, and users |

When security is enabled, users are assigned one of these levels. When security is disabled or `allow_readonly` is configured, unauthenticated users get read-only access.

---

## Plugin Router Endpoints Require Admin

All HTTP endpoints registered via `registerWithRouter()` are mounted under `/plugins/{pluginId}/...` and **always require admin permission**.

```javascript
plugin.registerWithRouter = (router) => {
  // This endpoint requires admin permission
  router.put('/my-setting', (req, res) => {
    // ...
    res.json({ status: 'ok' })
  })
}
```

This is by design — plugin endpoints can modify server state, install packages, or interact with system resources. The admin requirement prevents unauthorized access.

> **This means regular users with `write` permission cannot use plugin HTTP endpoints.** If you need non-admin users to control a device, use a PUT handler instead (see below).

---

## PUT Handlers — Write Permission Only

PUT handlers are registered on **Signal K data paths** and only require `write` permission. This is the correct approach for device control (switches, thermostats, autopilots, etc.) where non-admin users need to send commands.

PUT handlers work over both HTTP PUT and WebSocket PUT messages.

### Registering a PUT Handler

Use `app.registerPutHandler()` in your plugin's `start()` method:

```javascript
plugin.start = (options) => {
  app.registerPutHandler(
    'vessels.self',
    'electrical.switches.anchorLight.state',
    (context, path, value, callback) => {
      // Send command to the actual switch hardware
      switchController
        .setState(value)
        .then(() => {
          // Report success — server will emit a delta with the new value
          callback({ state: 'COMPLETED', statusCode: 200 })
        })
        .catch((err) => {
          callback({
            state: 'COMPLETED',
            statusCode: 502,
            message: err.message
          })
        })

      // Return PENDING to indicate async processing
      return { state: 'PENDING' }
    }
  )
}
```

### Function Signature

```typescript
app.registerPutHandler(
  context: string,     // e.g. 'vessels.self'
  path: string,        // e.g. 'electrical.switches.anchorLight.state'
  callback: ActionHandler,
  source?: string      // optional source identifier (defaults to plugin.id)
)
```

### Callback Parameters

| Parameter  | Type     | Description                                 |
| ---------- | -------- | ------------------------------------------- |
| `context`  | string   | The vessel context (e.g. `vessels.self`)    |
| `path`     | string   | The Signal K path being written to          |
| `value`    | any      | The new value from the PUT request          |
| `callback` | function | Call with `{ state, statusCode, message? }` |

### Response States

| State       | StatusCode | When to use                                         |
| ----------- | ---------- | --------------------------------------------------- |
| `COMPLETED` | 200        | Success                                             |
| `COMPLETED` | 400        | Invalid value                                       |
| `COMPLETED` | 502        | Hardware/backend error                              |
| `PENDING`   | —          | Returned from handler, will call `callback()` later |

### Synchronous Handler Example

For simple cases where the action completes immediately:

```javascript
app.registerPutHandler(
  'vessels.self',
  'environment.inside.temperature.target',
  (context, path, value, callback) => {
    if (typeof value !== 'number' || value < 273 || value > 313) {
      return {
        state: 'COMPLETED',
        statusCode: 400,
        message: 'Temperature must be 273-313 K'
      }
    }
    thermostat.setTarget(value)
    return { state: 'COMPLETED', statusCode: 200 }
  }
)
```

### How Users Send PUT Requests

Once a PUT handler is registered, users with `write` permission can send commands via:

**HTTP PUT:**

```
PUT /signalk/v1/api/vessels/self/electrical/switches/anchorLight/state
Content-Type: application/json

{ "value": 1 }
```

**WebSocket:**

```json
{
  "context": "vessels.self",
  "requestId": "1",
  "put": {
    "path": "electrical.switches.anchorLight.state",
    "value": 1
  }
}
```

See [WebSocket Protocol](../websocket-protocol.md#put-requests) for details on WebSocket PUT.

---

## v2 API Provider Plugins

If your plugin provides data for a v2 API (autopilot, resources, weather), the API framework handles permissions for you. Your provider plugin implements an interface, and the API routes enforce the appropriate permission level.

| Provider Type | Interface           | Permission handled by |
| ------------- | ------------------- | --------------------- |
| Autopilot     | `AutopilotProvider` | Autopilot API         |
| Resources     | `ResourceProvider`  | Resources API         |
| Weather       | `WeatherProvider`   | Weather API           |

See the specific provider documentation:

- [Autopilot Provider Plugins](./autopilot_provider_plugins.md)
- [Resource Provider Plugins](./resource_provider_plugins.md)
- [Weather Provider Plugins](./weather_provider_plugins.md)

---

## ACL Configuration

For fine-grained access control, the server supports per-path Access Control Lists. See [Security](../../security.md) for details.

Example ACL allowing any user to read steering data but only admin to write:

```json
{
  "context": "vessels.self",
  "resources": [
    {
      "paths": ["steering.*"],
      "permissions": [
        { "subject": "any", "permission": "read" },
        { "subject": "admin", "permission": "write" }
      ]
    }
  ]
}
```

---

## Decision Guide

| What you need                         | Approach                          | Permission required         |
| ------------------------------------- | --------------------------------- | --------------------------- |
| Plugin configuration UI               | Router (`/plugins/...`)           | admin                       |
| Control a device (switch, thermostat) | `registerPutHandler()` on SK path | write                       |
| Provide resources (waypoints, routes) | Resource provider plugin          | write (via Resources API)   |
| Provide autopilot integration         | Autopilot provider plugin         | write (via Autopilot API)   |
| Provide weather data                  | Weather provider plugin           | read (data only)            |
| Read data from other sources          | `getSelfPath()` / subscriptions   | read                        |
| Emit data into the model              | `handleMessage()`                 | _(plugin runs server-side)_ |
