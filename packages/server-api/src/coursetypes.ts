export type {
  HrefDestinationType as HrefDestination,
  PositionDestinationType as PositionDestination,
  RouteDestinationType as RouteDestination,
  ActiveRouteType as ActiveRoute,
  NextPreviousPointType as NextPreviousPoint,
  CourseInfoType as CourseInfo
} from './typebox/course-schemas'

import type {
  HrefDestinationType,
  PositionDestinationType
} from './typebox/course-schemas'
import type { Static } from '@sinclair/typebox'
import { CoursePointTypeSchema } from './typebox/course-schemas'

/** @category Course API */
export type PointDestination = HrefDestinationType | PositionDestinationType

/** @category Course API */
export type CoursePointType = Static<typeof CoursePointTypeSchema>

/** @category  Course API */
export const COURSE_POINT_TYPES = {
  VesselPosition: 'VesselPosition' as CoursePointType,
  RoutePoint: 'RoutePoint' as CoursePointType,
  Location: 'Location' as CoursePointType,
  Waypoint: 'Waypoint' as CoursePointType
}
