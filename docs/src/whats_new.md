# What's new in Version 2.

Signal K Server version 2 introduces new REST APIs designed to perform specific operations _(e.g. set destination, advance to next point, etc)_.

These APIs have been implemented to ensure the integrity of the underlying Signal K data model by maintaining values in all related paths associated with the operation. In this way a cohesive, reliable data set is presented to all connected applications and devices.

The new APIs are mounted under `/signalk/v2/api`, their definition(s) available as OpenApi documents accessible via _Documentation -> OpenAPI_ in the server admin user interface. They coexist with `/signalk/v1/api` paths to ensure continued operation of applications.

Some REST APIs provide an `interface` for use by plugins to enact operations in a managed way.

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

The Course API and associated operations maintain all "course" related paths in the data model but this API is not the only source of course data. NMEA data streams are also a source of course data.

In the past, plugins processing this data have directly populated various `v1` Signal K paths. Moving forward 
these plugins should utilise interface provided by the Course API to perform the required operation.

In practise this would mean collecting and processing data received from the relevant sentences / PGNs to compose a Course API request.


### Connection with v1 Full Data Model

In the current implementation of Signal K Server there is still only a single `stream` endpoint and all values emitted as deltas _(both `v1` & `v2`)_ will continue appear there.

It should be noted, that while both `v1` & `v2` deltas appear in the one stream, only `v1` deltas will populate the _full data model_ and be available under the `/signalk/v1/api/` path!

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


