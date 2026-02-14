---
title: REST APIs
children:
  - conventions.md
  - autopilot_api.md
  - course_api.md
  - history_api.md
  - notifications_api.md
  - radar_api.md
  - resources_api.md
  - weather_api.md
  - plugin_api.md
  - ./proposed/README.md
---

# REST APIs

Modular, subdomain specific REST APIs were introduced in Signal K server version 2 to provide a way for applications and plugins perform operations and ensure that the Signal K data model is consistent.

The OpenAPI definitions can be found under _Documentation -> OpenAPI_ in the server Admin UI.

### APIs available in Signal K server v2.0.0 and later:

APIs are available via `/signalk/v2/api/<endpoint>`

| API                                     | Description                                                                        | Endpoint                         |
| --------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------- |
| [`Autopilot`](./autopilot_api.md)       | Provide the ability to send common commands to an autopilot via a provider plugin. | `vessels/self/autopilot`         |
| [Course](./course_api.md)               | Set a course, follow a route, advance to next point, etc.                          | `vessels/self/navigation/course` |
| [History](./history_api.md)             | Query historical data.                                                             | `history`                        |
| [Radar](./radar_api.md)                 | View and control marine radar equipment via a provider plugin. _(In development)_  | `vessels/self/radars`            |
| [Resources](./resources_api.md)         | Create, view, update and delete waypoints, routes, etc.                            | `resources`                      |
| [Weather](./weather_api.md)             | Query weather observations, forecasts, and warnings via a provider plugin.         | `weather`                        |
| [Notifications](./notifications_api.md) | Centralised management, silencing and acknowledgement of notifications and alarms. | `notifications`                  |

### Interactive Documentation

The server provides interactive API documentation accessible from the Admin UI sidebar under _Documentation_:

- **OpenAPI** — interactive Swagger UI for all REST APIs (including plugin APIs) at `/doc/openapi`
- **AsyncAPI** — WebSocket delta channel documentation at `/skServer/asyncapi/docs`
- **Path Reference** — searchable metadata for all Signal K paths (units, descriptions) at `/documentation/paths`

For the WebSocket streaming protocol (deltas, subscriptions, PUT requests), see the [WebSocket Protocol](../websocket-protocol.md) documentation.

---
