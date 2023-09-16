import { Position } from '.'

export interface PointDestination {
  href?: string
  position?: Position
  type?: string
}

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

export interface CourseInfo {
  startTime: string | null
  targetArrivalTime: string | null
  arrivalCircle: number
  activeRoute: ActiveRoute | null
  nextPoint: {
    href?: string | null
    type: string | null
    position: Position | null
  } | null
  previousPoint: {
    href?: string | null
    type: string | null
    position: Position | null
  } | null
}
