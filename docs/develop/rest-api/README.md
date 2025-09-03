---
title: REST APIs
children:
  - conventions.md
  - autopilot_api.md
  - course_api.md
  - plugin_api.md
  - resources_api.md
  - plugin_api.md
  - ./proposed/README.md
---

# REST APIs

REST APIs were introduced in Signal K server version 2 to provide a way for applications and plugins perform operations and ensure that the Signal K data model is consistent.

The OpenAPI definitions can be found under _Documentation -> OpenAPI_ in the server Admin UI.

### APIs available in Signal K server v2.0.0 and later:

APIs are available via `/signalk/v2/api/<endpoint>`

| API                               | Description                                                                        | Endpoint                         |
| --------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------- |
| [`Autopilot`](./autopilot_api.md) | Provide the ability to send common commands to an autopilot via a provider plugin. | `vessels/self/autopilot`         |
| [Course](./course_api.md)         | Set a course, follow a route, advance to next point, etc.                          | `vessels/self/navigation/course` |
| [Resources](./resources_api.md)   | Create, view, update and delete waypoints, routes, etc.                            | `resources`                      |

---
