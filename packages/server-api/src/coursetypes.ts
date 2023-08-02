import { Position } from '.'

interface DestinationBase {
  href?: string
}

export interface Destination extends DestinationBase {
  position?: Position
  type?: string
}

export interface RouteDest extends DestinationBase {
  reverse?: boolean
  pointIndex?: number
  arrivalCircle?: number
}

export interface ActiveRoute extends DestinationBase {
  href: string //ActiveRoute always has href
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
