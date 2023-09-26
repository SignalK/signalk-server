# Working with the Course API


## Overview

The SignalK Course API provides a consistent means to perform common operations and to ensure that all related Signal K paths set with the relevant values.
It integrates with the [Resources API](WORKING_WITH_RESOURCES_PROVIDER_API.md) to retrieve  information about an active route or destination. 

Providing an API to manage the paths under `/signalk/v2/api/vessels/self/navigation/course` ensures the data underpinning course calculations and autopilot operation is consistent and valid.

Client applications use `HTTP` requests to set (`PUT`), retrieve (`GET`) and clear (`DELETE`) course data. 

_Note: the Course API persists course information on the server to ensure data is not lost in the event of a server restart._

**See the [OpenAPI documentation](https://demo.signalk.io/admin/openapi/) in the Admin UI (Server => OpenApi) for more Course API details.**


## Retrieving Course Information
---

Course information is retrieved by submitting a HTTP `GET` request to `/signalk/v2/api/vessels/self/navigation/course`.

```typescript
HTTP GET 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course'
```
The response will contain values pertaining to the current course. See also [Delta Messages](#delta-messages).

_Example: Navigate to Location._
```JSON
{
  "startTime": "2023-01-27T01:47:39.785Z",
  "targetArrivalTime": "2022-06-10T01:29:27.592Z",
  "arrivalCircle": 4000,
  "activeRoute": null,
  "nextPoint": {
    "type": "Location",
    "position": {
      "latitude": -34.92084502261776,
      "longitude": 131.54823303222656
    }
  },
  "previousPoint": {
    "type":"VesselPosition",
    "position": {
      "latitude": -34.82084502261776,
      "longitude": 131.04823303222656
    }
  }
}
```

_Example: Following a route._
```JSON
{
  "startTime": "2023-01-27T01:47:39.785Z",
  "targetArrivalTime": "2022-06-10T01:29:27.592Z",
  "arrivalCircle": 1000,
  "activeRoute": {
    "href": "/resources/routes/e24d72e4-e04b-47b1-920f-66b78e7b0331",
    "pointIndex": 0,
    "pointTotal": 5,
    "reverse": false,
    "name": "my route",
    "waypoints": [
      {
        "latitude": -34.92084502261776,
        "longitude": 131.54823303222656
      },
      {
        "latitude": -34.86621482446046,
        "longitude": 132.10166931152344,
      },
      {
        "latitude": -34.6309479733581,
        "longitude": 132.23350524902344
      },
      {
        "latitude": -34.63546778783319,
        "longitude": 131.8867492675781
      },
      {
        "latitude": -34.71000915922492,
        "longitude": 131.82289123535156
      }
    ]
  },
  "nextPoint": {
    "type": "RoutePoint",
    "position": {
      "latitude": -34.92084502261776,
      "longitude": 131.54823303222656
    }
  },
  "previousPoint": {
    "type":"VesselPosition",
    "position": {
      "latitude": -34.82084502261776,
      "longitude": 131.04823303222656
    }
  }
}
```

_Example: Navigate to Waypoint._
```JSON
{
  "startTime": "2023-01-27T01:47:39.785Z",
  "targetArrivalTime": "2022-06-10T01:29:27.592Z",
  "arrivalCircle": 4000,
  "activeRoute": null,
  "nextPoint": {
    "href": "/resources/waypoints/f24d72e4-e04b-47b1-920f-66b78e7b033e",
    "type": "Waypoint",
    "position": {
      "latitude": -34.92084502261776,
      "longitude": 131.54823303222656
    }
  },
  "previousPoint": {
    "type":"VesselPosition",
    "position": {
      "latitude": -34.82084502261776,
      "longitude": 131.04823303222656
    }
  }
}
```


## Setting a Course
---

The Course API provides endpoints for:
1. Navigating to a point.
1. Following a Route _(reference to a route entry under `/resources/routes`)_


### 1. Navigating to a Point

To navigate to a point submit a HTTP `PUT` request to `/signalk/v2/api/vessels/self/navigation/course/destination` and supply either:
- The latitude & longitude of the destination point
- A reference to a waypoint entry under `/resources/waypoints`

_Example: Setting destination using lat / lon:_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/destination' {"position": {"latitude": -60.5, "longitude": -166.7}}
```

_Example: Setting waypoint as destination:_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/destination' {"href": "/resources/waypoints/5242d307-fbe8-4c65-9059-1f9df1ee126f"}
```

### 2. Following a Route

To follow a route submit a HTTP `PUT` request to `/signalk/v2/api/vessels/self/navigation/course/activeRoute` and supply a reference to a route entry under `/resources/routes`.

_Example: Following a route:_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/activeRoute' {"href": "/resources/routes/5242d307-fbe8-4c65-9059-1f9df1ee126f"}
```

Additional parameters can be set when following a route including:
- Defining the point along the route to start at
- The direction to follow the route (forward / reverse)

_Example: Following a route in reverse direction:_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/activeRoute' 
{
  "href": "/resources/routes/5242d307-fbe8-4c65-9059-1f9df1ee126f",
  "reverse": true
}
```

### Advancing along a Route

As progress along a route is made, you can use the following endpoints to update the destination.

To set the destination to the next point along the route:
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/activeRoute/nextPoint'
```

To advance the destination to a point `n` places beyond the current destination point, supply a positive number representing the number of points to advance:

```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/activeRoute/nextPoint' {"value": 2}
```
_Sets destination to the point after the next in sequence._

To set the destination to the previous point along the route:
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/activeRoute/nextPoint' {"value": -1}
```

To set the destination to a point `n` places prior the current destination point, supply a negative number representing the number of points prior:

```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/activeRoute/nextPoint' {"value": -2}
```
_Sets destination to the point two prior to the current destination._

To set the destination to a specific point along the route, supply the zero-based index of the point:

_Example: 4th point along the route._
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/activeRoute/pointIndex' {"value": 3}
```
_Value contains the 'zero-based' index of the point along the route (i.e. 0 = 1st point, 1 = 2nd point, etc.)_

To reverse the direction along the route:
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/activeRoute/reverse'
```

## Cancelling navigation
---

To cancel the current course navigation and clear the course data

```typescript
HTTP DELETE 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/'
```


## Delta Messages
---

The Course API emits the delta messages with the following paths when course information has been changed.

_Note: Delta values reflect the relevant property of the Course Information data object as detailed [above](#retrieving-course-information)._

- `navigation.course.startTime`
- `navigation.course.targetArrivalTime`
- `navigation.course.arrivalCircle`
- `navigation.course.activeRoute`
- `navigation.course.nextPoint`
- `navigation.course.previousPoint`


## Course Calculations
---

The Course API defines the path `/vessels/self/navigation/course/calcValues` to accommodate the calculated values related to course navigation.

_**Note: The Course API implementation on the server does not perform the calculations to populate these values!**_

The following values are defined to be populated by a course computer / plugin based on the Course Information populated by the Course API.

_Path: `navigation/course/calcValues`_
```
calcMethod: "Rhumbline" or "GreatCircle"
crossTrackError
bearingTrackTrue
bearingTrackMagnetic
estimatedTimeOfArrival e.g. "2022-04-22T05:02:56.484Z"
distance
bearingTrue
bearingMagnetic
velocityMadeGood
timeToGo
targetSpeed
previousPoint: { distance }
```

_Example:_
```
{
  "calcMethod": "Rhumbline",
  "crossTrackError": 458.784,
  "bearingTrackTrue": 4.58491,
  "bearingTrackMagnetic": 4.51234,
  "estimatedTimeOfArrival": "2022-04-22T05:02:56.484Z",
  "distance": 10157,
  "bearingTrue": 4.58491,
  "bearingMagnetic": 4.51234,
  "velocityMadeGood": 7.2653,
  "timeToGo": 8491,
  "targetSpeed": 2.2653,
  "previousPoint": {
    "distance": 10157
  }
}
```
