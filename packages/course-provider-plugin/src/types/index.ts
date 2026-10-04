export interface SKPaths {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface CourseData {
  gc: CourseResult
  rl: CourseResult
  passedPerpendicular: boolean
}

export interface CourseResult {
  calcMethod?: string
  distance?: number | null
  bearingTrue?: number | null
  bearingMagnetic?: number | null
  velocityMadeGood?: number | null
  velocityMadeGoodToCourse?: number | null
  timeToGo?: number | null
  estimatedTimeOfArrival?: string | null
  previousPoint?: {
    distance?: number | null
  }
  route?: {
    timeToGo?: number | null
    estimatedTimeOfArrival?: string | null
    distance?: number | null
  }
  bearingTrackTrue?: number | null
  bearingTrackMagnetic?: number | null
  crossTrackError?: number | null
  targetSpeed?: number | null
}
