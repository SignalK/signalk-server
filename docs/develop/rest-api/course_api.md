---
title: Course API
---

# Course API

The _Course API_ provides common course operations under the path `/signalk/v2/api/vessels/self/navigation/course` ensuring that all related Signal K data model values are maintained and consistent. This provides a set of data that can be confidently used for _course calculations_ and _autopilot operation_.

Additionally, the Course API persists course information on the server to ensure data is not lost in the event of a server restart.

Client applications use `HTTP` requests (`PUT`, `GET`,`DELETE`) to perform operations and retrieve course data.

The Course API also listens for destination information in the NMEA stream and will set / clear the destination accordingly _(e.g. NMEA0183 RMB sentence, NMEA2000 PGN 129284)_. See [Configuration](#Configuration) for more details.

_Note: You can view the \_Course API_ OpenAPI definition in the Admin UI (Documentation => OpenApi).\_

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

_Note: Delta values reflect the relevant property of the Course Information data object as detailed in the
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

To cancel the current course navigation and clear the course data.

```typescript
HTTP DELETE 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course'
```

_Note: This operation will NOT change the destination information coming from the NMEA input stream! If the NMEA source device is still emitting destination data this will reappear as the current destination._

To ignore destination data from NMEA sources see [Configuration](#configuration) below.

## Configuration

The default configuration of the Course API will accept destination information from both API requests and NMEA stream data sources.

For NMEA sources, Course API monitors the the following Signal K paths populated by both the `nmea0183-to-signalk` and `n2k-to-signalk` plugins:

- _navigation.courseRhumbline.nextPoint.position_
- _navigation.courseGreatCircle.nextPoint.position_

HTTP requests are prioritised over NMEA data sources, so making an API request will overwrite the destination information received from and NMEA source.

Note: when the destination cleared using an API request, if the NMEA stream is emitting an active destination position, this will then be used by the Course API to populate course data.

#### Ignoring NMEA Destination Information

The Course API can be configured to ignore destination data in the NMEA stream by enabling `apiOnly` mode.

In `apiOnly` mode destination information can only be set / cleared using HTTP API requests.

- **`apiOnly` Mode = Off _(default)_**
  - Destination data is accepted from both _HTTP API_ and _NMEA_ sources
  - Setting a destination using the HTTP API will override the destination data received via NMEA
  - When clearing the destination using the HTTP API, if destination data is received via NMEA this will then be used as the active destination.
  - To clear destination sourced via NMEA, clear the destination on the source device.

- **`apiOnly` Mode = On**
  - Course operations are only accepted via the HTTP API
  - NMEA stream data is ignored
  - Switching to `apiOnly` mode when an NMEA sourced destination is active will clear the destination.

#### Retrieving Course API Configuration

To retrieve the Course API configuration settings, submit a HTTP `GET` request to `/signalk/v2/api/vessels/self/navigation/course/_config`.

```typescript
HTTP GET 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/_config'
```

_Example response:_

```JSON
{
  "apiOnly": false
}
```

#### Enable / Disable `apiOnly` mode

To enable `apiOnly` mode, submit a HTTP `POST` request to `/signalk/v2/api/vessels/self/navigation/course/_config/apiOnly`.

_Enable apiOnly mode:_

```typescript
HTTP POST 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/_config/apiOnly'
```

To disable `apiOnly` mode, submit a HTTP `DELETE` request to `/signalk/v2/api/vessels/self/navigation/course/_config/apiOnly`.

_Disable apiOnly mode:_

```typescript
HTTP DELETE 'http://hostname:3000/signalk/v2/api/vessels/self/navigation/course/_config/apiOnly'
```

## Course Calculations

Whilst not performing course calculations, the _Course API_ defines the paths to accommodate the values calculated during course navigation.

Click [here](./course_calculations.md) for details.
