---
title: WebSocket Protocol
---

# Signal K WebSocket Protocol

The Signal K WebSocket protocol provides real-time streaming of data between the server and clients. It is the primary interface for receiving live updates from sensors, instruments, and APIs.

## Endpoints

| Endpoint               | Purpose                  |
| ---------------------- | ------------------------ |
| `/signalk/v1/stream`   | Real-time data streaming |
| `/signalk/v1/playback` | Historical data playback |

Both endpoints use the standard WebSocket protocol (`ws://` or `wss://`).

> For the REST API (HTTP) documentation, see [REST APIs](./rest-api/README.md).
>
> For machine-readable channel documentation, see the [AsyncAPI viewer](/skServer/asyncapi/docs) (Documentation &rarr; AsyncAPI in the Admin UI sidebar).

---

## Connecting

### Basic Connection

Connect to the stream endpoint using any WebSocket client:

```
ws://localhost:3000/signalk/v1/stream
```

### Query Parameters

| Parameter          | Values                | Default  | Description                                   |
| ------------------ | --------------------- | -------- | --------------------------------------------- |
| `subscribe`        | `none`, `self`, `all` | `self`   | Initial subscription scope                    |
| `sendMeta`         | `all`                 | _(none)_ | Include metadata deltas for subscribed values |
| `sendCachedValues` | `true`, `false`       | `true`   | Send cached values on connection              |
| `serverevents`     | `all`                 | _(none)_ | Subscribe to server lifecycle events          |
| `token`            | JWT string            | _(none)_ | Authentication token                          |

_Example: Connect with no initial subscriptions (then subscribe selectively):_

```
ws://localhost:3000/signalk/v1/stream?subscribe=none
```

_Example: Subscribe to all vessels, include metadata:_

```
ws://localhost:3000/signalk/v1/stream?subscribe=all&sendMeta=all
```

### Playback Connection

The playback endpoint replays historical data:

```
ws://localhost:3000/signalk/v1/playback?startTime=2024-06-15T08:00:00Z&playbackRate=5
```

| Parameter      | Required | Description                               |
| -------------- | -------- | ----------------------------------------- |
| `startTime`    | Yes      | ISO 8601 timestamp to start playback from |
| `playbackRate` | No       | Speed multiplier (default: 1)             |

---

## Authentication

The server checks for authentication credentials in the following order:

1. **Query parameter:** `?token=<jwt>`
2. **HTTP header:** `Authorization: Bearer <jwt>` or `Authorization: JWT <jwt>`
3. **Cookie:** `JAUTHENTICATION=<jwt>`

If no valid token is provided and the server has `allow_readonly` enabled, the connection is granted read-only access.

### Login via WebSocket

You can also authenticate after connecting by sending a login message:

```json
{
  "login": {
    "username": "admin",
    "password": "secret"
  },
  "requestId": "1"
}
```

Response:

```json
{
  "requestId": "1",
  "state": "COMPLETED",
  "statusCode": 200,
  "login": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

Use the returned token for subsequent connections or send it in-stream:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

For details on access control, permissions, and ACLs see the [Security](../security.md) documentation.

---

## Hello Message

Immediately after connecting, the server sends a hello message:

```json
{
  "name": "signalk-server",
  "version": "2.21.0",
  "self": "vessels.urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d",
  "roles": ["master", "main"],
  "timestamp": "2024-06-15T08:00:00.000Z"
}
```

| Field       | Description                                                     |
| ----------- | --------------------------------------------------------------- |
| `name`      | Server name                                                     |
| `version`   | Server software version                                         |
| `self`      | The vessel context identifier for this server                   |
| `roles`     | Server roles (always `["master", "main"]` for a primary server) |
| `timestamp` | Server time at connection                                       |

For playback connections, `startTime` and `playbackRate` are included as well.

---

## Delta Format

After the hello message, the server streams **delta messages** — incremental updates to the Signal K data model. Each delta contains one or more path/value pairs grouped by source and timestamp.

```json
{
  "context": "vessels.urn:mrn:imo:mmsi:234567890",
  "updates": [
    {
      "source": {
        "label": "N2000-01",
        "type": "NMEA2000",
        "src": "115",
        "pgn": 128267
      },
      "$source": "N2000-01.115",
      "timestamp": "2024-06-15T08:00:01.507Z",
      "values": [
        {
          "path": "navigation.courseOverGroundTrue",
          "value": 2.971
        },
        {
          "path": "navigation.speedOverGround",
          "value": 3.85
        }
      ]
    }
  ]
}
```

### Delta Fields

| Field                      | Description                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `context`                  | The vessel or object this update applies to (e.g. `vessels.urn:mrn:imo:mmsi:234567890`) |
| `updates[]`                | Array of update groups, each from a single source at a single timestamp                 |
| `updates[].source`         | Structured source identifier (type, label, device address)                              |
| `updates[].$source`        | Compact source identifier string                                                        |
| `updates[].timestamp`      | ISO 8601 timestamp of the measurement                                                   |
| `updates[].values[]`       | Array of path/value pairs                                                               |
| `updates[].values[].path`  | Signal K path relative to the context (e.g. `navigation.speedOverGround`)               |
| `updates[].values[].value` | The value — can be a number, string, boolean, object, or `null`                         |

### Source Types

The `source` object identifies where the data originated:

| Source Type | Fields                                | Example                                                                         |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| NMEA2000    | `type`, `label`, `src`, `pgn`         | `{ "type": "NMEA2000", "label": "N2K", "src": "115", "pgn": 128267 }`           |
| NMEA0183    | `type`, `label`, `talker`, `sentence` | `{ "type": "NMEA0183", "label": "serial1", "talker": "GP", "sentence": "RMC" }` |
| SignalK     | `type`, `label`                       | `{ "type": "SignalK", "label": "courseApi" }`                                   |
| Plugin      | `label`                               | `{ "label": "my-plugin-id" }`                                                   |

### Value Types

Values for well-known paths are typically:

- **Numbers** — always in SI units (meters, radians, Kelvin, m/s, etc.)
- **Strings** — identifiers, names, states
- **Booleans** — binary states
- **Objects** — structured data (positions, notifications, etc.)
- **`null`** — path value cleared / resource deleted

_See the [Path Reference](/documentation/paths) for units and descriptions of all well-known paths._

### Vessel Name Delta

A delta with an empty path sets context-level properties:

```json
{
  "context": "vessels.urn:mrn:imo:mmsi:234567890",
  "updates": [
    {
      "timestamp": "2024-06-15T08:00:00Z",
      "$source": "N2000-01.115",
      "values": [
        {
          "path": "",
          "value": { "name": "WRANGO" }
        }
      ]
    }
  ]
}
```

---

## Subscriptions

By default, connecting to `/signalk/v1/stream` subscribes you to all paths on `vessels.self`. You can change subscriptions dynamically by sending subscribe/unsubscribe messages.

### Subscribe

```json
{
  "context": "vessels.self",
  "subscribe": [
    {
      "path": "navigation.speedThroughWater",
      "period": 1000,
      "format": "delta",
      "policy": "ideal",
      "minPeriod": 200
    },
    {
      "path": "navigation.logTrip",
      "period": 10000
    }
  ]
}
```

| Field                   | Required | Default | Description                                                             |
| ----------------------- | -------- | ------- | ----------------------------------------------------------------------- |
| `context`               | Yes      | —       | Vessel context (`vessels.self`, `vessels.*`, `*`)                       |
| `subscribe[].path`      | Yes      | —       | Path pattern (supports `*` wildcard, e.g. `navigation.*`)               |
| `subscribe[].period`    | No       | 1000    | Update interval in milliseconds                                         |
| `subscribe[].format`    | No       | `delta` | Response format                                                         |
| `subscribe[].policy`    | No       | `ideal` | `instant` (every change), `ideal` (throttled), `fixed` (exact interval) |
| `subscribe[].minPeriod` | No       | 0       | Minimum interval between updates in milliseconds                        |

### Unsubscribe

```json
{
  "context": "vessels.self",
  "unsubscribe": [{ "path": "navigation.speedThroughWater" }]
}
```

Unsubscribe from everything:

```json
{
  "context": "*",
  "unsubscribe": [{ "path": "*" }]
}
```

### Path Discovery with `announceNewPaths`

To discover available paths without subscribing to continuous updates for all of them:

```json
{
  "context": "*",
  "announceNewPaths": true,
  "subscribe": [
    {
      "path": "navigation.position",
      "period": 1000
    }
  ]
}
```

When `announceNewPaths` is `true`:

1. The server sends cached values for **all** existing paths matching the context (once each)
2. When a new path appears later (e.g. new sensor comes online), the server announces it once
3. Only the explicitly subscribed paths receive continuous updates

---

## PUT Requests

PUT requests allow clients to change values on the server — for example, controlling a switch or setting a thermostat. PUT requests require `write` permission.

### Sending a PUT

```json
{
  "context": "vessels.self",
  "requestId": "c0d79334-4e25-4245-8892-54e8ccc8021d",
  "put": {
    "path": "electrical.switches.anchorLight.state",
    "value": 1
  }
}
```

If `context` is omitted, `vessels.self` is assumed.

### PUT Response

The server sends a status response:

```json
{
  "requestId": "c0d79334-4e25-4245-8892-54e8ccc8021d",
  "state": "COMPLETED",
  "statusCode": 200
}
```

| State       | StatusCode | Meaning                                 |
| ----------- | ---------- | --------------------------------------- |
| `PENDING`   | 202        | Request accepted, processing            |
| `COMPLETED` | 200        | Success                                 |
| `COMPLETED` | 400        | Bad request                             |
| `COMPLETED` | 405        | No PUT handler registered for this path |
| `COMPLETED` | 502        | Handler error                           |
| `COMPLETED` | 504        | Handler timeout                         |

For plugin developers: see [Permissions & PUT Handlers](./plugins/permissions.md) for how to register PUT handlers.

---

## Delete Requests

Delete a path value from the data model:

```json
{
  "context": "vessels.self",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "delete": {
    "path": "electrical.switches.switch1.state"
  }
}
```

---

## Access Requests

Clients with limited permissions can request elevated access:

```json
{
  "accessRequest": {
    "clientId": "my-boat-app",
    "description": "Mobile navigation app"
  },
  "requestId": "1"
}
```

The server administrator can approve or deny the request via the Admin UI.

---

## v2 API Deltas

The v2 REST APIs (Course, Notifications, Autopilot, Resources, Radar) emit deltas with v2-style paths when state changes. These deltas arrive on the same WebSocket stream as v1 deltas.

For example, when a destination is set via the Course API, you'll receive deltas under `navigation.course.*`:

```json
{
  "context": "vessels.self",
  "updates": [
    {
      "$source": "courseApi",
      "timestamp": "2024-06-15T08:30:00Z",
      "values": [
        {
          "path": "navigation.course.nextPoint",
          "value": {
            "position": { "latitude": 51.5, "longitude": -0.1 },
            "type": "Location"
          }
        },
        {
          "path": "navigation.course.arrivalCircle",
          "value": 500
        }
      ]
    }
  ]
}
```

For machine-readable documentation of which v2 API channels emit which messages, see the [AsyncAPI documentation](/skServer/asyncapi/docs).

---

## Discovery

Before connecting, clients can discover the WebSocket endpoint via the REST discovery API:

```
GET /signalk
```

Response:

```json
{
  "endpoints": {
    "v1": {
      "version": "2.21.0",
      "signalk-http": "http://localhost:3000/signalk/v1/api/",
      "signalk-ws": "ws://localhost:3000/signalk/v1/stream"
    }
  }
}
```

Use the `signalk-ws` URL to connect.
