import { PointDestination, RouteDestination, CourseInfo } from './coursetypes'

/**
 * @see [Course REST API](../../../docs/src/develop/rest-api/course_api.md) provides the following functions for use by plugins.
 */
export interface CourseApi {
  /**
   * Retrieves the current course information.
   *
   * @category Course API
   */
  getCourse(): Promise<CourseInfo>

  /**
   * Cancels navigation to the current point or route being followed.
   *
   * @category Course API
   */
  clearDestination(): Promise<void>

  /**
   * Set course to a specified position / waypoint.
   *
   * @category Course API
   *
   * @param dest - Object containing destination position information.
   *
   */
  setDestination(
    dest: (PointDestination & { arrivalCircle?: number }) | null
  ): Promise<void>

  /**
   * Follow a route in the specified direction and starting at the specified point.
   *
   * @param dest - Object containing route information.
   *
   * - returns: Resolved Promise on success.
   *
   * @category Course API
   */
  activateRoute(dest: RouteDestination | null): Promise<void>
}
