# What's new in Version 2.

Signal K Server version 2 introduces new REST APIs designed to perform specific operations _(e.g. set destination, advance to next point, etc)_.

These APIs have been implemented to ensure the integrity of the underlying Signal K data model by maintaining values in all related paths associated with the operation. In this way a cohesive, reliable data set is presented to all connected applications and devices.

The new APIs are mounted under `/signalk/v2/api`, their definitions available as OpenApi documents accessible via _Documentation -> OpenAPI_ in the server admin user interface. They coexist with `/signalk/v1/api` paths to ensure continued operation of applications.

Some REST APIs provide an `interface` for use by plugins via the {@link @signalk/server-api!ServerAPI | Server Plugin API} to enable them to enact operations in a managed way.

_**Important: The Signal K data paths maintained by the REST APIs should NOT be updated directly by any other plugin or process!**_

With the move towards operation based APIs some paths are flagged for deprecation. Please see [Changes & Deprecations](./breaking_changes.md) for details.

---

### Course API

Provides common course operations via `/signalk/v2/api/vessels/self/navigation/course`.

See the [Course API](./develop/rest-api/course_api.md) for details.

---

### Resources API

Provides operations for creating, maintaining and accessing resources such as routes, waypoints, etc via `/signalk/v2/api/resources`.

See the [Resources API](./develop/rest-api/resources_api.md) for details.


---

## Notes for Developers:


### NMEA0183 / NMEA2000 message processing

Whilst the Course API and its associated operations provide a means of setting a course, NMEA data streams are the source of information when the course is set on a connected device.

In the past, plugins processing NMEA data streams have directly populated the mapped `v1` Signal K paths based on the received sentence / PGN values. Moving forward these plugins should utilise the relevant {@link @signalk/server-api!ServerAPI | Server Plugin API} methods to enact course operations.


### Stream updates

The new REST APIs emit `v2` deltas with values that are objects.

For example, when a course is activated, deltas will be emitted for `navigation.course.previousPoint`, `navigation.course.nextPoint` and `navigation.course.activeRoute` where the value is an object.

_Example: v2 Delta_
```JSON
{
    "path": "navigation.course.previousPoint",
    "value": {
        "position": {
           "latitude": 65.0,
           "longitude": 3.754
        },
        "type": "Location",
        "href": null
    }
}
```


#### Connection with v1 Full Data Model

The current implementation of Signal K Server provides only a single `stream` endpoint _(`/signalk/v1/stream`)_ and all values emitted as deltas _(both `v1` & `v2`)_ will continue appear there.

It should be noted, that even though both `v1` & `v2` deltas appear in the one stream, only `v1` deltas will populate the _full data model_ and be available under the `/signalk/v1/api` path!
