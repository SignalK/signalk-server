# What's new in Version 2.

Signal K server version 2 introduces new REST APIs designed to perform specific operations (e.g. set destination, advance to next point, etc).

Using these APIs will ensure that the underlying Signal K data model has values set in all related paths associated with the operation, providing a cohesive data set that can be reliably used by all connected applications and devices.

These new APIs are mounted under `/signalk/v2/api` and coexist with `/signalk/v1/api` paths, their definition available as OpenApi documents accessible via the server admin user interface.

_**It is important to note that the Signal K data paths maintained by the REST APIs should NOT be updated directly by any other plugin or process. In the case where an API provides an `interface`, it should be used by plugins to perform operations.**_

With the move towards operation based APIs some paths are flagged for deprecation. Please see [Deprecations](#deprecations) section below for details.

---

### Course API

Provides common course operations via `/signalk/v2/api/vessels/self/navigation/course`.

See the [Course API](openapi/course_api.md) for details.

---

### Resources API

Provides operations for creating, maintaining and accessing resources such as routes, waypoints, etc via `/signalk/v2/api/resources`.

See the [Resources API](openapi/resources_api.md) for details.


---

## Notes for Developers:


### NMEA0183 / NMEA2000 message processing

As stated previously the Course API ensures a cohesive data set by ensuring values are set in ALL related Signal K paths for the given operation. 

An NMEA data streams are also a source of course data which, in prior versions, this data has been used to directly populate various Signal K paths (e.g. `n2k-signalk` and `nmea0183-signalk` plugins). 

**These plugins (and others like them) should use the interface provided by the Course API to set / clear a destination.**

In practise this would mean collecting and processing data received from the relevant sentences / pgns to compose a Course API request.


### Connection with v1 Full Data Model

In the current implementation there is still only a single `stream` endpoint and all values emitted as deltas will continue appear there.

_It is important to note though, that `version 2` deltas will not populate the `full data model`. This means that these values will only be available via the API._


### Stream updates

The new APIs emit values in the deltas that are object valued.

For example, when a course is activated deltas will be emitted for `navigation.course.previousPoint`, `navigation.course.nextPoint` and `navigation.course.activeRoute` where the value is an object and not as individual path / values. 

_e.g. `navigation.course.previousPoint`_
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


