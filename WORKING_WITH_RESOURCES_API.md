# Working with the Resources API


## Overview

The SignalK specification defines a number of resources (routes, waypoints, notes, regions & charts) each with its  path under the root `resources` path _(e.g. `/signalk/v1/api/resources/routes`)_.

The SignalK server handles requests to these resource paths to enable the retrieval, creation, updating and deletion of resources.

---
## Operation:

For resources to be stored and retrieved, the Signal K server requires that a [Resource Provider plugin](RESOURCE_PROVIDER_PLUGINS.md) be installed and registered to manage each of the resource types your implementation requires. _You can find plugins in the `App Store` section of the server admin UI._

Client applications can then use HTTP requests to resource paths to store and retrieve resource entries. _Note: the ability to store resource entries is controlled by the server security settings so client applications may need to authenticate for write / delete operations to complete successfully._


### Retrieving Resources
---

Resource entries are retrived by submitting an HTTP `GET` request to the relevant path.

_Example:_
```typescript
HTTP GET 'http://hostname:3000/signalk/v1/api/resources/routes'
```
to return a list of available routes OR
```typescript
HTTP GET 'http://hostname:3000/signalk/v1/api/resources/routes/urn:mrn:signalk:uuid:94052456-65fa-48ce-a85d-41b78a9d2111'
```
to retrieve a specific resource entry.

When retrieving a list of entries these can be filtered based on certain criteria such as:

- being within a bounded area
- distance from vessel
- total entries returned.

This is done by supplying query string key | value pairs in the request.

_Example 1: Retrieve waypoints within 50km of the vessel_
```typescript
HTTP GET 'http://hostname:3000/signalk/v1/api/resources/waypoints?distance=50000'
```
_Note: the distance supplied is in meters_.

_Example 2: Retrieve the first 20 waypoints within 90km of the vessel_
```typescript
HTTP GET 'http://hostname:3000/signalk/v1/api/resources/waypoints?distance=90000&limit=20'
```
_Note: the distance supplied is in meters_.

_Example 3: Retrieve waypoints within a bounded area._
```typescript
HTTP GET 'http://hostname:3000/signalk/v1/api/resources/waypoints?bbox=-135.5,38,-134,38.5'
```
_Note: the bounded area is supplied as bottom left & top right corner coordinates in the form swLongitude,swLatitude,neLongitude,neLatitude_.


### Deleting Resources
---

Resource entries are deleted by submitting an HTTP `DELETE` request to a path containing the id of the resource to delete.

_Example:_
```typescript
HTTP DELETE 'http://hostname:3000/signalk/v1/api/resources/routes/urn:mrn:signalk:uuid:94052456-65fa-48ce-a85d-41b78a9d2111'
```

In this example the route with the supplied id is deleted from storage.

### Creating / updating Resources
---

Resource entries are created and updated by submitting an HTTP `PUT` request that contains the resource data to the relevant API path depending on the type of resource to create / update.

Each resource type has a specific set of attributes that are required to be supplied before the resource entry can be created.

Generally a resource will be created by submitting the resource attributes and the server will generate a resource id for the entry. You can assign a specific id for a newly created resource by using an API path containing the id you wish to assign to the resource. _Note: if a resource of the same type with the supplied id already exists, it will be overwritten with the submitted data!_

___Note: When submitting data to create or update a resource entry, the submitted resource data is validated against the Signal K schema for that resource type. If the submitted data is deemed to be invalid then the operation is aborted.___

___Additionally when supplying an id to assign to or identify the resource on which to perform the operation, the id must be valid for the type of resource as defined in the Signal K schema.___

---
#### __Routes:__

To create / update a route entry the body of the PUT request must contain data in the following format: 
```javascript
{
  name: 'route name',
  description: 'description of the route',
  attributes: {
    attribute1: 'attribute1 value',
    attribute2: 258,
    ...
  },
  points: [
    {latitude: -38.567,longitude: 135.9467},
    {latitude: -38.967,longitude: 135.2467},
    {latitude: -39.367,longitude: 134.7467},
    {latitude: -39.567,longitude: 134.4467}
  ]
}
```
where:
- name: is text detailing the name of the route
- description (optional): is text describing the route
- attributes (optional): object containing key | value pairs of attributes associated with the route
- points: is an array of route points (latitude and longitude)


_Example: Create new route entry (with server generated id)_
```typescript 
HTTP PUT 'http://hostname:3000/signalk/v1/api/resources/set/route' {
  name: 'route name',
  description: 'description of the route',
  attributes: {
    distance: 6580
  },
  points: [
    {latitude: -38.567,longitude: 135.9467},
    {latitude: -38.967,longitude: 135.2467},
    {latitude: -39.367,longitude: 134.7467},
    {latitude: -39.567,longitude: 134.4467}
  ]
}
```

_Example: Create new route entry (with supplied id)_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v1/api/resources/set/route/urn:mrn:signalk:uuid:94052456-65fa-48ce-a85d-41b78a9d2111' {
  name: 'route name',
  description: 'description of the route',
  attributes: {
    distance: 6580
  },
  points: [
    {latitude: -38.567,longitude: 135.9467},
    {latitude: -38.967,longitude: 135.2467},
    {latitude: -39.367,longitude: 134.7467},
    {latitude: -39.567,longitude: 134.4467}
  ]
}
```

---
#### __Waypoints:__

To create / update a waypoint entry the body of the PUT request must contain data in the following format: 
```javascript
{
  name: 'waypoint name',
  description: 'description of the waypoint',
  attributes: {
    attribute1: 'attribute1 value',
    attribute2: 258,
    ...
  },
  position: {
    latitude: -38.567,
    longitude: 135.9467
  }
}
```
where:
- name: is text detailing the name of the waypoint
- description (optional): is text describing the waypoint
- attributes (optional): object containing key | value pairs of attributes associated with the waypoint
- position: the latitude and longitude of the waypoint


_Example: Create new waypoint entry (with server generated id)_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v1/api/resources/set/waypoint' {
  name: 'waypoint #1',
  position: {
    latitude: -38.567,
    longitude: 135.9467
  }
}
```

_Example: Create new waypoint entry (with supplied id)_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v1/api/resources/set/waypoint/urn:mrn:signalk:uuid:94052456-65fa-48ce-a85d-41b78a9d2111' {
  name: 'waypoint #1',
  position: {
    latitude: -38.567,
    longitude: 135.9467
  }
}
```

---
#### __Regions:__

To create / update a region entry the body of the PUT request must contain data in the following format: 
```javascript
{
  name: 'region name',
  description: 'description of the region',
  attributes: {
    attribute1: 'attribute1 value',
    attribute2: 258,
    ...
  },
  points: [
    {latitude: -38.567,longitude: 135.9467},
    {latitude: -38.967,longitude: 135.2467},
    {latitude: -39.367,longitude: 134.7467},
    {latitude: -39.567,longitude: 134.4467},
    {latitude: -38.567,longitude: 135.9467}
  ],
  geohash: 'gbsuv'
}
```
where:
- name: is text detailing the name of the region
- description (optional): is text describing the region
- attributes (optional): object containing key | value pairs of attributes associated with the region

and either:
- points: is an array of points (latitude and longitude) defining a polygon. _Note: first and last point in the array must be the same!_

OR
- geohash: a value defining a bounded area _e.g. 'gbsuv'_


_Example: Create new region entry (with server generated id)_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v1/api/resources/set/region' {
  name: 'region name',
  description: 'description of the region',
  points: [
    {latitude: -38.567,longitude: 135.9467},
    {latitude: -38.967,longitude: 135.2467},
    {latitude: -39.367,longitude: 134.7467},
    {latitude: -39.567,longitude: 134.4467},
    {latitude: -38.567,longitude: 135.9467}
  ]
}
```

_Example: Create new region entry (with supplied id)_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v1/api/resources/set/region/urn:mrn:signalk:uuid:94052456-65fa-48ce-a85d-41b78a9d2111' {
  name: 'region name',
  description: 'description of the region',
  geohash: 'gbsuv'
}
```

---
#### __Notes:__

To create / update a note entry the body of the PUT request must contain data in the following format: 
```javascript
{
  title: 'note title text',
  description: 'description of the note',
  attributes: {
    attribute1: 'attribute1 value',
    attribute2: 258,
    ...
  },
  url: 'link to note content',
  mimeType: 'text/plain, text/html, etc.',
  position: {
    latitude: -38.567,
    longitude: 135.9467
  },
  geohash: 'gbsuv',
  region: '/resources/regions/urn:mrn:signalk:uuid:35052456-65fa-48ce-a85d-41b78a9d2a61'
}
```
where:
- name: is text detailing the name of the note
- description (optional): is text describing the note
- attributes (optional): object containing key | value pairs of attributes associated with the note
- url (optional): link to the note contents
- mimeType (optional): the mime type of the note contents

and either:
- position: the latitude and longitude associated with the note

OR
- geohash: a value defining a bounded area associated with the note _e.g. 'gbsuv'_

OR
- region: text containing a reference to a region resource associated with the note _e.g. '/resources/regions/urn:mrn:signalk:uuid:35052456-65fa-48ce-a85d-41b78a9d2a61'_


_Example: Create new note entry (with server generated id)_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v1/api/resources/set/note' {
  title: 'note title',
  description: 'text containing brief description',
  url: 'http:notehost.com/notes/mynote.html',
  mimeType: 'text/plain',
  position: {
    latitude: -38.567,
    longitude: 135.9467
  }
}
```

_Example: Create new note entry (with supplied id)_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v1/api/resources/set/note/urn:mrn:signalk:uuid:94052456-65fa-48ce-a85d-41b78a9d2111' {
  title: 'note title',
  description: 'text containing brief description',
  region: '/resources/regions/urn:mrn:signalk:uuid:35052456-65fa-48ce-a85d-41b78a9d2a61'
}
```

