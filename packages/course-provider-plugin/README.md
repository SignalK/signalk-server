# Course Provider Plugin

[![CI](https://github.com/SignalK/course-provider-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/SignalK/course-provider-plugin/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@signalk/course-provider.svg)](https://www.npmjs.com/package/@signalk/course-provider)
[![License](https://img.shields.io/npm/l/@signalk/course-provider.svg)](https://github.com/SignalK/course-provider-plugin/blob/master/LICENSE)

**Signal K server Course data provider plugin**.

This plugin is included with Signal K Server and populates the course data paths found under [`navigation.course.calcValues`](https://demo.signalk.org/doc/openapi/?urls.primaryName=course#/calculations/get_course_calcValues) as well as providing an API endpoint at `/signalk/v2/api/vessels/self/navigation/course/calcValues`

Additionally it will populate `performance.velocityMadeGoodToWaypoint` as well as
allow the following notifications to be raised:

- **`notifications.navigation.course.arrivalCircleEntered`**: _alert_ message is sent when the value of `distance` falls below the value of `navigation.course.arrivalCircle`.

- **`notifications.navigation.perpendicularPassed`**: _alert_ message is sent when the perpendicular line (relative to `navigation.course.previousPoint.position` at the destination has been passed by the vessel.

While a route is followed, these notifications are raised only at its last point when the plugin moves the route on by itself (see _Route advance_ below).

## Configuration

**Notifications:** provides configuration for generated notifications.

- **Enable sound:** Checking this option sets the `sound` flag for any notifications generated.

**Calculation method:** Select the course calculation method to use and the paths to populate.

- **GreatCircle (default)**: populates values using _GreatCircle_ calculations.
- **Rhumbline**: populates values using _Rhumbline_ calculations.

**Route advance:** when an active route moves on to its next point by itself.

- **On whichever comes first (default)**: on entering the arrival circle or on passing the perpendicular.
- **On entering the arrival circle**: never with an arrival circle of 0.
- **On passing the perpendicular**
- **Never**: the route moves on only when a user or another application selects the next point.

The plugin advances through the Course API, by starting the route again at its next point. Chart plotters can read the setting at `/plugins/course-provider/autoAdvance` (`{ "value": "either" }`) to know whether they need to move the route on themselves.
