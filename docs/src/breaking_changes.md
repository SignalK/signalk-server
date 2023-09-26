
# Changes

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

The Resources API has updated the definition of the following resources:
- `routes`: removed the `start`, `end` properties.
- `waypoints`: removed `position` attribute, added `name`, `description` and `type` attributes.
- `regions`: removed `geohash` attribute, added `name` and `description` properties.
- `notes`: removed `geohash` and `region` attributes, added `href` and `properties` attributes.
- `charts`: There has been a significant changes to include support for WMS, WMTS and TileJSON sources. 

Please see the [Resources OpenAPI definition](https://github.com/SignalK/signalk-server/blob/master/src/api/resources/openApi.json) for details.


---

# Deprecations:

### 1. courseGreatCircle, courseRhumbline paths

With the introduction of the Course API the following paths should now be considered deprecated:
- `/signalk/v1/api/vessels/self/navigation/courseGreatCircle`
- `/signalk/v1/api/vessels/self/navigation/courseRhumbline`

_Note: The Course API does currently maintain values in these paths for the purposes of backward compatibility, but applications and plugins referencing these paths should plan to move to using the equivalent paths under `/signalk/v2/api/vessels/self/navigation/course`.
