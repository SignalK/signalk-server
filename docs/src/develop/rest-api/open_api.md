# REST APIs

REST APIs were introduced in Signal K server version 2 to provide a way for applications and plugins perform operations and ensure that the Signal K data model is consistent.

They are mounted under the path `/signalk/v2/api` and OpenAPI definitions can be found under _Documentation -> OpenAPI_ in the server Admin UI. 


### APIs available in Signal K server v2.0.0 and later:

| API | Description | Endpoint    | 
|---        |---            |---          |
| [Course](./course_api.md)  | Set a course, follow a route, advance to next point, etc.  | `course` |
| [Resources](./resources_api.md) | Create, view, update and delete waypoints, routes, etc. | `resources` |

---


#### Following is a list of proposed APIs for implementation:


| Proposed API       | Description | Endpoint    | 
|---        |---            |---          |
| _`Notifications`_ | Provide the ability to raise, update and clear notifications from multiple sources. _[View PR](https://github.com/SignalK/signalk-server/pull/1560)_| `notifications` |
| _`Autopilot`_  | Provide the ability to send common commands to an autopilot via a provider plugin. _[View PR](https://github.com/SignalK/signalk-server/pull/1512)_ | `autopilot` |

---
