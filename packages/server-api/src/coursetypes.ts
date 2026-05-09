export type {
  HrefDestination,
  PositionDestination,
  RouteDestination,
  ActiveRoute,
  NextPreviousPoint,
  CourseInfo
} from './typebox/course-schemas'

import type {
  HrefDestination,
  PositionDestination
} from './typebox/course-schemas'
import type { Static } from '@sinclair/typebox'
import { CoursePointTypeSchema } from './typebox/course-schemas'

/** @category Course API */
export type PointDestination = HrefDestination | PositionDestination

/** @category Course API */
export type CoursePointType = Static<typeof CoursePointTypeSchema>

/** @category  Course API */
export const COURSE_POINT_TYPES = {
  VesselPosition: 'VesselPosition' as CoursePointType,
  RoutePoint: 'RoutePoint' as CoursePointType,
  Location: 'Location' as CoursePointType,
  Waypoint: 'Waypoint' as CoursePointType
}
