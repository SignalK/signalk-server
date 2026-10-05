# Course Provider Plugin

[![CI](https://github.com/SignalK/course-provider-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/SignalK/course-provider-plugin/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@signalk/course-provider.svg)](https://www.npmjs.com/package/@signalk/course-provider)
[![License](https://img.shields.io/npm/l/@signalk/course-provider.svg)](https://github.com/SignalK/course-provider-plugin/blob/master/LICENSE)

**Signal K server plugin that acts as a Course data provider**.

_Note: This plugin should ONLY be installed on Signal K Server version 2.0 or later!_

---

This plugin populates the course data paths found under [`navigation.course.calcValues`](https://demo.signalk.org/doc/openapi/?urls.primaryName=course#/calculations/get_course_calcValues) as well as providing an API endpoint at `/signalk/v2/api/vessels/self/navigation/course/calcValues`

Additionally it will populate `performance.velocityMadeGoodToWaypoint` as well as
allow the following notifications to be raised:

- **`notifications.navigation.arrivalCircleEntered`**: _alert_ message is sent when the value of `distance` falls below the value of `navigation.course.arrivalCircle`.

- **`notifications.navigation.perpendicularPassed`**: _alert_ message is sent when the perpendicular line (relative to `navigation.course.previousPoint.position` at the destination has been passed by the vessel.

## Configuration

---

**Notifications:** provides configuration for generated notifications.

- **Enable sound:** Checking this option sets the `sound` flag for any notifications generated.

**Calculation method:** Select the course calculation method to use and the paths to populate.

- **GreatCircle (default)**: populates values using _GreatCircle_ calculations.
- **Rhumbline**: populates values using _Rhumbline_ calculations.
