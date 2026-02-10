import { type Static } from '@sinclair/typebox'
import { Position } from '.'
import { Brand } from './brand'
import {
  HrefDestinationSchema,
  PositionDestinationSchema,
  RouteDestinationSchema,
  ActiveRouteSchema
} from './course-schemas'

// Re-export all schemas for downstream consumers
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

/**
 * NextPreviousPoint uses the branded CoursePointType, so it stays as an
 * interface. The TypeBox NextPreviousPointSchema validates the runtime shape;
 * the Brand provides nominal typing at compile time.
 * @category Course API
 */
export interface NextPreviousPoint {
  href?: string
  type: CoursePointType
  position: Position
}

/**
 * CoursePointType is a branded string for nominal typing.
 * Runtime validation uses CoursePointTypeSchema.
 * @category Course API
 */
export type CoursePointType = Brand<string, 'coursepointtype'>

/** @category  Course API */
export const COURSE_POINT_TYPES = {
  VesselPosition: 'VesselPosition' as CoursePointType,
  RoutePoint: 'RoutePoint' as CoursePointType,
  Location: 'Location' as CoursePointType
}

/**
 * CourseInfo references NextPreviousPoint which has the branded CoursePointType,
 * so it stays as an interface. The TypeBox CourseInfoSchema validates the
 * runtime shape.
 * @category Course API
 */
export interface CourseInfo {
  startTime: string | null
  targetArrivalTime: string | null
  arrivalCircle: number
  activeRoute: ActiveRoute | null
  nextPoint: NextPreviousPoint | null
  previousPoint: NextPreviousPoint | null
}
