import { type Static } from '@sinclair/typebox'
import { type Position } from './shared-schemas'
import { Brand } from './brand'
import {
  HrefDestinationSchema,
  PositionDestinationSchema,
  RouteDestinationSchema,
  ActiveRouteSchema
} from './course-schemas'

export * from './course-schemas'

/** @category Course API */
export type HrefDestination = Static<typeof HrefDestinationSchema>

/** @category Course API */
export type PositionDestination = Static<typeof PositionDestinationSchema>

/** @category Course API */
export type PointDestination = HrefDestination | PositionDestination

/** @category Course API */
export type RouteDestination = Static<typeof RouteDestinationSchema>

/** @category Course API */
export type ActiveRoute = Static<typeof ActiveRouteSchema>

/** @category Course API */
export interface NextPreviousPoint {
  href?: string
  type: CoursePointType
  position: Position
}

/** @category Course API */
export type CoursePointType = Brand<string, 'coursepointtype'>

/** @category  Course API */
export const COURSE_POINT_TYPES = {
  VesselPosition: 'VesselPosition' as CoursePointType,
  RoutePoint: 'RoutePoint' as CoursePointType,
  Location: 'Location' as CoursePointType
}

/** @category Course API */
export interface CourseInfo {
  startTime: string | null
  targetArrivalTime: string | null
  arrivalCircle: number
  activeRoute: ActiveRoute | null
  nextPoint: NextPreviousPoint | null
  previousPoint: NextPreviousPoint | null
}
