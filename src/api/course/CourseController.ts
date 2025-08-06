import {
  Controller,
  Get,
  Route,
  Tags,
  Response,
  SuccessResponse,
  Request,
  Security
} from 'tsoa'
import express from 'express'

/**
 * Course information interface
 */
export interface CourseInfo {
  /** ISO 8601 timestamp of course start */
  startTime: string | null
  /** Estimated time of arrival in ISO 8601 format */
  targetArrivalTime: string | null
  /** Arrival circle radius in meters */
  arrivalCircle: number
  /** Active route information */
  activeRoute: {
    href: string
    pointIndex: number
    pointTotal: number
    reverse: boolean
    name?: string
  } | null
  /** Next waypoint or location */
  nextPoint: {
    type: 'Location' | 'RoutePoint' | 'VesselPosition'
    position: {
      latitude: number
      longitude: number
    }
    href?: string
  } | null
  /** Previous waypoint or location */
  previousPoint: {
    type: 'Location' | 'RoutePoint' | 'VesselPosition'
    position: {
      latitude: number
      longitude: number
    }
    href?: string
  } | null
}

/**
 * Course navigation controller for SignalK server
 * Provides endpoints for managing vessel navigation course information
 */
@Route('vessels/self/navigation')
@Tags('Navigation')
export class CourseController extends Controller {
  /**
   * Get current course information
   * @summary Returns the vessel's current course/navigation information
   * @returns {CourseInfo} Current course information including destination, route, and arrival details
   * @example response:
   * {
   *   "startTime": "2024-01-01T00:00:00Z",
   *   "targetArrivalTime": "2024-01-01T12:00:00Z",
   *   "arrivalCircle": 50,
   *   "activeRoute": {
   *     "href": "/resources/routes/123",
   *     "pointIndex": 2,
   *     "pointTotal": 5,
   *     "reverse": false,
   *     "name": "Test Route"
   *   },
   *   "nextPoint": {
   *     "type": "Location",
   *     "position": { "latitude": -35.5, "longitude": 138.7 }
   *   },
   *   "previousPoint": {
   *     "type": "VesselPosition",
   *     "position": { "latitude": -35.45, "longitude": 138 }
   *   }
   * }
   */
  @Get('course-tsoa') // Parallel endpoint for gradual migration
  @Security('signalK', ['read'])
  @SuccessResponse(200, 'Course information retrieved successfully')
  @Response(404, 'No active course')
  public async getCourseInfo(
    @Request() request: express.Request
  ): Promise<CourseInfo> {
    // Access the CourseApi singleton from the app object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = request.app as any
    const courseApi = app.courseApi

    if (!courseApi) {
      this.setStatus(500)
      throw new Error('CourseApi not initialized')
    }

    // Get the course info from the singleton and return it directly
    return courseApi.getCourseInfo()
  }
}
