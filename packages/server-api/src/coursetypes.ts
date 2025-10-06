import { Position } from '.'
import { Brand } from './brand'

/** @category Course API */
export interface HrefDestination {
  href: string
}

/** @category Course API */
export interface PositionDestination {
  position: Position
}

/** @category Course API */
export type PointDestination = HrefDestination | PositionDestination

/** @category Course API */
export interface RouteDestination {
  href: string
  reverse?: boolean
  pointIndex?: number
  arrivalCircle?: number
}

/** @category Course API */
export interface ActiveRoute {
  href: string
  pointIndex: number
  pointTotal: number
  reverse: boolean
  name: string
}

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
