import { Position } from './index.js'
import { Brand } from './brand.js'

export interface HrefDestination {
  href: string
}

export interface PositionDestination {
  position: Position
}

export type PointDestination = HrefDestination | PositionDestination

export interface RouteDestination {
  href: string
  reverse?: boolean
  pointIndex?: number
  arrivalCircle?: number
}

export interface ActiveRoute {
  href: string
  pointIndex: number
  pointTotal: number
  reverse: boolean
  name: string
}

export type CoursePointType = Brand<string, 'coursepointtype'>

export const COURSE_POINT_TYPES = {
  VesselPosition: 'VesselPosition' as CoursePointType,
  RoutePoint: 'RoutePoint' as CoursePointType,
  Location: 'Location' as CoursePointType
}

export interface CourseInfo {
  startTime: string | null
  targetArrivalTime: string | null
  arrivalCircle: number
  activeRoute: ActiveRoute | null
  nextPoint: {
    href?: string
    type: CoursePointType
    position: Position
  } | null
  previousPoint: {
    href?: string
    type: CoursePointType
    position: Position
  } | null
}
