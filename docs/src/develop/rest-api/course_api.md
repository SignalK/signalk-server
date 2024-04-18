# Working with the Course API


## Overview

The _Course API_ provides common course operations under the path `/signalk/v2/api/vessels/self/navigation/course` ensuring that all related Signal K data model values are maintained and consistent. This provides a set of data that can be confidently used for _course calculations_ and _autopilot operation_.

Client applications use `HTTP` requests (`PUT`, `GET`,`DELETE`) to perform operations and retrieve course data. 

Additionally, the Course API persists course information on the server to ensure data is not lost in the event of a server restart.

_Note: You can view the _Course API_ OpenAPI definition in the Admin UI (Documentation => OpenApi)._

---
## Setting a Course

The Course API provides endpoints for:
1. Navigate to a location _(lat, lon)_
1. Navigate to a waypoint _(href to waypoint resource)_
1. Follow a Route _(href to a route resource)_.

### 1. Navigate to a Location

To navigate to a point submit a HTTP `PUT` request to `/signalk/v2/api/vessels/self/navigation/course/destination` and supply the latitude & longitude of the destination point.

```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/destination' {"position": {"latitude": -60.5, "longitude": -166.7}}
```


### 2. Navigate to a Waypoint

To navigate to a point submit a HTTP `PUT` request to `/signalk/v2/api/vessels/self/navigation/course/destination` and supply a reference to a waypoint resource entry under `/resources/waypoints`

```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/destination' {"href": "/resources/waypoints/5242d307-fbe8-4c65-9059-1f9df1ee126f"}
```


### 3. Follow a Route

To follow a route submit a HTTP `PUT` request to `/signalk/v2/api/vessels/self/navigation/course/activeRoute` and supply a reference to a route resource entry under `/resources/routes`.

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

#### Advancing along a Route

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

#### Delta Messages

The Course API emits delta messages with the following paths when course information has been changed.

_Note: Delta values reflect the relevant property of the Course Information data object as detailed  in the
[Retrieving Course Information](#retrieving-course-information) section._

- `navigation.course.startTime`
- `navigation.course.targetArrivalTime`
- `navigation.course.arrivalCircle`
- `navigation.course.activeRoute`
- `navigation.course.nextPoint`
- `navigation.course.previousPoint`



## Retrieving Course Information

Course information is retrieved by submitting a HTTP `GET` request to `/signalk/v2/api/vessels/self/navigation/course`.

```typescript
HTTP GET 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course'
```

The contents of the response will reflect the operation used to set the current course. The `nextPoint` & `previousPoint` sections will always contain values but `activeRoute` will only contain values when a route is being followed.

#### 1. Operation: Navigate to a location _(lat, lon)_

_Example response:_
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

#### 2. Operation: Navigate to a waypoint _(href to waypoint resource)_

_Example response:_
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


#### 3. Operation: Follow a Route _(href to a route resource)_.

_Example response:_
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

## Cancelling navigation

To cancel the current course navigation and clear the course data

```typescript
HTTP DELETE 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/'
```

---

## Course Calculations

Whilst not performing course calculations, the _Course API_ defines the paths to accommodate the values calculated during course navigation.

Click [here](./course_calculations.md) for details.



