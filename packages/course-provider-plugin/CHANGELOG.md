# CHANGELOG: @signalk/course-provider

## v1.2.5

- **Fixed**: Updated passed perpendicular calculation (#8).
- **Chore**: Added tests.

## v1.2.4

- **Fixed**: Calculation of remaining distance to travel of current route.
- **Fixed**: Worker termination.

## v1.2.3

- **Fixed**: Use VMC calculation for both `course.velocityMadeGood` and `performance.velocityMadeGoodToWaypoint`.

## v1.2.2

- **Fixed**: VMC calculation to use COG instead of heading.
- **Fixed**: VMG calculation.

## v1.2.1

- **Fixed**: Added `@signalk/server-api` dependencies.

## v1.2.0

- **Added**: Route distance / time to go and eta at final destination to `calcValues`.
- **Fixed**: Issue where route waypoints were not available for the distance calculation.
- **Update**: Perpendicular passed notification message text.

## v1.1.1

- **Fixed**: Issue where magnetic bearing values fell outside of the 0-360 degree range.

## v1.1.0

- **Added**: `performance.velocityMadeGoodToWaypoint`.
- **Update**: Use a value of _0_ when `navigation.magneticVariation` is undefined to ensure `bearingTrackMagnetic` & `bearingMagnetic` have a value.

## v1.0.3

- **Fixed**: Value of `navigation.course.calcValues.calcMethod` being set to `undefined` when course is cleared.

## v1.0.2

- **Fixed**: Remove erroneous unit conversion in TTG calculation.

## v1.0.1

- **Update**: Change plugin catagory keyword to `signalk-category-utility`.

## v1.0.0

- Populates the following course data paths under `navigation.course.calcValues`:

  - `bearingTrackTrue`
  - `bearingTrackMagnetic`
  - `crossTrackError`
  - `distance`
  - `distance`
  - `bearingTrue`
  - `bearingMagnetic`
  - `velocityMadeGood`
  - `timeToGo`
  - `estimatedTimeOfArrival`
  - `targetSpeed`

- Raises / clears the following notifications:
  - `notifications.navigation.arrivalCircleEntered`
  - `notifications.navigation.perpendicularPassed`
