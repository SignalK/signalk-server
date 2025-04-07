/* eslint-disable @typescript-eslint/no-explicit-any */
import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:course')

import { IRouter, Request, Response } from 'express'
import _ from 'lodash'

import { SignalKMessageHub, WithConfig } from '../../app'
import { WithSecurityStrategy } from '../../security'
import { getSourceId } from '@signalk/signalk-schema'

import {
  GeoJsonPoint,
  PathValue,
  Position,
  Route,
  SignalKResourceType,
  SKVersion,
  PointDestination,
  ActiveRoute,
  RouteDestination,
  CourseInfo,
  COURSE_POINT_TYPES,
  Update,
  Delta,
  hasValues,
  SourceRef,
  Waypoint,
  Unsubscribes
} from '@signalk/server-api'

const { Location, RoutePoint, VesselPosition } = COURSE_POINT_TYPES
import { isValidCoordinate } from 'geolib'
import { Responses } from '../'
import { Store } from '../../serverstate/store'

import { buildSchemaSync } from 'api-schema-builder'
import courseOpenApi from './openApi.json'
import { ResourcesApi } from '../resources'
import { writeSettingsFile } from '../../config/config'

const COURSE_API_SCHEMA = buildSchemaSync(courseOpenApi)

const SIGNALK_API_PATH = `/signalk/v2/api`
const COURSE_API_PATH = `${SIGNALK_API_PATH}/vessels/self/navigation/course`

const API_CMD_SRC: CommandSource = {
  $source: 'courseApi' as SourceRef,
  type: 'API'
}

export const COURSE_API_V2_DELTA_COUNT = 13
export const COURSE_API_V1_DELTA_COUNT = 8
export const COURSE_API_INITIAL_DELTA_COUNT =
  COURSE_API_V1_DELTA_COUNT * 2 + COURSE_API_V2_DELTA_COUNT

interface CourseApplication
  extends IRouter,
    WithConfig,
    WithSecurityStrategy,
    SignalKMessageHub {}

interface CommandSource {
  type: string
  $source: SourceRef
  msg?: string
  path?: string
}
const NO_COURSE_INFO: CourseInfo = {
  startTime: null,
  targetArrivalTime: null,
  arrivalCircle: 0,
  activeRoute: null,
  nextPoint: null,
  previousPoint: null
}

export class CourseApi {
  private courseInfo = NO_COURSE_INFO

  private store: Store
  private cmdSource: CommandSource | null = null // source which set the destination
  private unsubscribes: Unsubscribes = []
  private settings!: { apiOnly?: boolean }

  constructor(
    private app: CourseApplication,
    private resourcesApi: ResourcesApi
  ) {
    this.store = new Store(app, 'course')
    this.parseSettings()
  }

  async start() {
    return new Promise<void>(async (resolve) => {
      this.initCourseRoutes()

      let storeData
      try {
        storeData = await this.store.read()
        debug('Found persisted course data')
        this.courseInfo = await this.validateCourseInfo(storeData)
        this.cmdSource = this.courseInfo.nextPoint ? API_CMD_SRC : null
      } catch (_error) {
        debug('No persisted course data (using default)')
      }
      debug(
        '** courseInfo **',
        this.courseInfo,
        '** cmdSource **',
        this.cmdSource
      )
      if (this.courseInfo.nextPoint) {
        this.emitCourseInfo(true)
      }

      ;(this.app as any).subscriptionmanager.subscribe(
        {
          context: 'vessels.self',
          subscribe: [
            {
              path: 'navigation.courseRhumbline.nextPoint.position',
              period: 500
            },
            {
              path: 'navigation.courseGreatCircle.nextPoint.position',
              period: 500
            }
          ]
        },
        this.unsubscribes,
        (err: Error) => {
          console.log(`Course API: Subscribe failed: ${err}`)
        },
        (msg: Delta) => {
          this.processV1DestinationDeltas(msg)
        }
      )
      resolve()
    })
  }

  // parse server settings
  private parseSettings() {
    const defaultSettings = {
      apiOnly: false
    }
    if (!('courseApi' in this.app.config.settings)) {
      debug('***** Applying Default Settings ********')
      this.app.config.settings.courseApi = defaultSettings
    }
    if (
      this.app.config.settings.courseApi &&
      typeof this.app.config.settings.courseApi.apiOnly === 'undefined'
    ) {
      debug('***** Applying missing apiOnly attribute to Settings ********')
      this.app.config.settings.courseApi.apiOnly = false
    }
    this.settings = this.app.config.settings.courseApi ?? { apiOnly: false }
    debug('** Parsed App Settings ***', this.app.config.settings)
    debug('** Applied cmdSource ***', this.cmdSource)
  }

  // write to server settings file
  private saveSettings() {
    writeSettingsFile(this.app as any, this.app.config.settings, () =>
      debug('***SETTINGS SAVED***')
    )
  }

  /** Process deltas for <destination>.nextPoint data
   * Note: Delta source cannot override destination set by API!
   * Destination is set when:
   * 1. There is no current destination
   * 2. msg source matches current Destination source
   * 3. Destination Position is changed.
   */
  private async processV1DestinationDeltas(delta: Delta) {
    if (
      !Array.isArray(delta.updates) ||
      this.isAPICmdSource() ||
      (!this.cmdSource && this.settings?.apiOnly)
    ) {
      return
    }
    delta.updates.forEach((update: Update) => {
      if (hasValues(update)) {
        update.values.forEach((pathValue: PathValue) => {
          if (
            update.source &&
            update.source.type &&
            ['NMEA0183', 'NMEA2000'].includes(update.source.type)
          ) {
            this.parseStreamValue(
              {
                type: update.source.type,
                $source: update.$source || getSourceId(update.source),
                msg:
                  update.source.type === 'NMEA0183'
                    ? `${update.source.sentence}`
                    : `${update.source.pgn}`,
                path: pathValue.path
              },
              pathValue.value as Position
            )
          }
        })
      }
    })
  }

  /** Test for valid Signal K position */
  private isValidPosition(position: Position): boolean {
    return (
      typeof position?.latitude === 'number' &&
      typeof position?.latitude === 'number' &&
      position?.latitude >= -90 &&
      position?.latitude <= 90 &&
      position?.longitude >= -180 &&
      position?.longitude <= 180
    )
  }

  /** Process stream value and take action
   * @param cmdSource Object describing the source of the update
   * @param pos Destination location value in the update
   */
  private async parseStreamValue(cmdSource: CommandSource, pos: Position) {
    if (!this.cmdSource) {
      // New source
      if (!this.isValidPosition(pos)) {
        return
      }
      debug('parseStreamValue:', 'Setting Destination...')
      const result = await this.setDestination({ position: pos }, cmdSource)
      debug('parseStreamValue: Source set...', this.cmdSource)
      if (result) {
        this.emitCourseInfo()
        return
      }
    }

    if (this.isCurrentCmdSource(cmdSource)) {
      if (!this.isValidPosition(pos)) {
        debug(
          'parseStreamValue:',
          'No or invalid position... Clear Destination...'
        )
        this.clearDestination()
        return
      }

      if (
        this.courseInfo.nextPoint?.position?.latitude !== pos.latitude ||
        this.courseInfo.nextPoint?.position?.longitude !== pos.longitude
      ) {
        debug(
          'parseStreamValue:',
          'Position changed... Updating Destination...'
        )
        const result = await this.setDestination({ position: pos }, cmdSource)
        if (result) {
          this.emitCourseInfo()
        }
      }
    }
  }

  /** Get course (exposed to plugins) */
  async getCourse(): Promise<CourseInfo> {
    debug(`** getCourse()`)
    return this.courseInfo
  }

  /** Clear destination / route (exposed to plugins) */
  async clearDestination(persistState?: boolean): Promise<void> {
    this.courseInfo = {
      ...NO_COURSE_INFO,
      arrivalCircle: this.courseInfo.arrivalCircle
    }
    this.cmdSource = null
    this.emitCourseInfo(!persistState)
  }

  /** Set course (exposed to plugins)
   * @param dest Setting to null clears the current destination
   */
  async destination(
    dest: (PointDestination & { arrivalCircle?: number }) | null
  ) {
    debug(`** destination(${dest})`)

    if (!dest) {
      throw new Error('No destination information supplied!')
    }

    const result = await this.setDestination(dest)
    if (result) {
      this.emitCourseInfo()
    }
  }

  /** Set / clear route (exposed to plugins)
   * @param dest Setting to null clears the current destination
   */
  async activeRoute(dest: RouteDestination | null) {
    debug(`** activeRoute(${dest})`)

    if (!dest) {
      throw new Error('No route information supplied!')
    }

    const result = await this.activateRoute(dest)
    if (result) {
      this.emitCourseInfo()
    }
  }

  private getVesselPosition() {
    return _.get((this.app.signalk as any).self, 'navigation.position')
  }

  private async validateCourseInfo(info: CourseInfo) {
    if (
      !hasAllProperties(info, ['activeRoute', 'nextPoint', 'previousPoint'])
    ) {
      debug(`** Error: Loaded course data is invalid!! **`)
      return NO_COURSE_INFO
    }

    if (
      (await this.isValidRouteCourse(info)) ||
      (await this.isValidWaypointCourse(info))
    ) {
      return info
    }
    return NO_COURSE_INFO
  }

  private async isValidRouteCourse(info: CourseInfo): Promise<boolean> {
    if (!info?.activeRoute?.href) {
      return false
    }
    const activeRoute = info.activeRoute
    const route = await this.getRoute(activeRoute.href)
    return (
      route?.feature !== undefined &&
      activeRoute.pointIndex >= 0 &&
      activeRoute.pointIndex < route.feature.geometry.coordinates.length
    )
  }

  private async isValidWaypointCourse(info: CourseInfo): Promise<boolean> {
    if (!info?.nextPoint?.href) {
      return false
    }
    const parsedHref = this.parseHref(info.nextPoint.href)
    if (!parsedHref) {
      return false
    }
    const wpt = (await this.resourcesApi.getResource(
      parsedHref.type,
      parsedHref.id
    )) as Waypoint
    return wpt?.feature !== undefined
  }

  private updateAllowed(request: Request): boolean {
    return this.app.securityStrategy.shouldAllowPut(
      request,
      'vessels.self',
      null,
      'navigation.course'
    )
  }

  private initCourseRoutes() {
    debug(`** Initialise ${COURSE_API_PATH} path handlers **`)

    // Return current course information
    this.app.get(`${COURSE_API_PATH}`, async (req: Request, res: Response) => {
      debug(`** ${req.method} ${req.path}`)
      res.json(this.courseInfo)
    })

    // Return course api config
    this.app.get(
      `${COURSE_API_PATH}/_config`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        res.json((this.app.config.settings as any)['courseApi'])
      }
    )

    // Set apiOnly mode
    this.app.post(
      `${COURSE_API_PATH}/_config/apiOnly`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          ;(this.settings as any).apiOnly = true
          if (!this.isAPICmdSource()) {
            this.clearDestination(true)
          }
          this.saveSettings()
          res.status(200).json(Responses.ok)
        } catch {
          res.status(400).json(Responses.invalid)
        }
      }
    )

    // Clear apiOnly mode
    this.app.delete(
      `${COURSE_API_PATH}/_config/apiOnly`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          ;(this.settings as any).apiOnly = false
          this.saveSettings()
          res.status(200).json(Responses.ok)
        } catch {
          res.status(400).json(Responses.invalid)
        }
      }
    )

    // course metadata
    this.app.get(
      `${COURSE_API_PATH}/arrivalCircle/meta`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        res.json({
          arrivalCircle: {
            description:
              'The circle which indicates arrival when vessel position is within its radius.',
            units: 'm'
          }
        })
      }
    )

    this.app.put(
      `${COURSE_API_PATH}/arrivalCircle`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        if (this.isValidArrivalCircle(req.body.value)) {
          this.courseInfo.arrivalCircle = req.body.value
          this.emitCourseInfo(false, 'arrivalCircle')
          res.status(200).json(Responses.ok)
        } else {
          res.status(400).json(Responses.invalid)
        }
      }
    )

    this.app.put(
      `${COURSE_API_PATH}/restart`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        if (!this.courseInfo.nextPoint) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `No active destination!`
          })
          return
        }
        // set previousPoint to vessel position
        try {
          const position: any = this.getVesselPosition()
          if (position && position.value) {
            this.courseInfo.previousPoint = {
              position: position.value,
              type: VesselPosition
            }
            this.emitCourseInfo(false, 'previousPoint')
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: `Vessel position unavailable!`
            })
          }
        } catch (_err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `Vessel position unavailable!`
          })
        }
      }
    )

    this.app.put(
      `${COURSE_API_PATH}/targetArrivalTime`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        if (req.body.value === null || this.isValidIsoTime(req.body.value)) {
          this.courseInfo.targetArrivalTime = req.body.value
          this.emitCourseInfo(false, 'targetArrivalTime')
          res.status(200).json(Responses.ok)
        } else {
          res.status(400).json(Responses.invalid)
        }
      }
    )

    // clear / cancel course
    this.app.delete(
      `${COURSE_API_PATH}`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        this.clearDestination(true)
        res.status(200).json(Responses.ok)
      }
    )

    // set destination
    this.app.put(
      `${COURSE_API_PATH}/destination`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        const endpoint = COURSE_API_SCHEMA[`${COURSE_API_PATH}/destination`].put
        if (!endpoint.body.validate(req.body)) {
          res.status(400).json(endpoint.body.errors)
          return
        }

        try {
          const result = await this.setDestination(req.body)
          if (result) {
            this.emitCourseInfo()
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json(Responses.invalid)
          }
        } catch (error) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (error as any).message
          })
        }
      }
    )

    // set activeRoute
    this.app.put(
      `${COURSE_API_PATH}/activeRoute`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          const result = await this.activateRoute(req.body)
          debug(this.courseInfo)
          if (result) {
            this.emitCourseInfo()
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json(Responses.invalid)
          }
        } catch (error) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: (error as any).message
          })
        }
      }
    )

    this.app.put(
      `${COURSE_API_PATH}/activeRoute/:action`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}, ${req.params.action}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        // fetch active route data
        if (!this.courseInfo.activeRoute) {
          res.status(400).json(Responses.invalid)
          return
        }
        const rte = await this.getRoute(this.courseInfo.activeRoute.href)
        if (!rte) {
          res.status(400).json(Responses.invalid)
          return
        }

        if (req.params.action === 'nextPoint') {
          if (typeof this.courseInfo.activeRoute.pointIndex === 'number') {
            if (!req.body.value || typeof req.body.value !== 'number') {
              req.body.value = 1
            }
            this.courseInfo.activeRoute.pointIndex = this.parsePointIndex(
              this.courseInfo.activeRoute.pointIndex + req.body.value,
              rte
            )
          } else {
            res.status(400).json(Responses.invalid)
            return
          }
        }

        if (req.params.action === 'pointIndex') {
          if (typeof req.body.value === 'number') {
            this.courseInfo.activeRoute.pointIndex = this.parsePointIndex(
              req.body.value,
              rte
            )
          } else {
            res.status(400).json(Responses.invalid)
            return
          }
        }
        // reverse direction from current point
        if (req.params.action === 'reverse') {
          if (typeof req.body.pointIndex === 'number') {
            this.courseInfo.activeRoute.pointIndex = req.body.pointIndex
          } else {
            this.courseInfo.activeRoute.pointIndex = this.calcReversedIndex(
              this.courseInfo.activeRoute
            )
          }
          this.courseInfo.activeRoute.reverse =
            !this.courseInfo.activeRoute.reverse
        }

        if (req.params.action === 'refresh') {
          this.courseInfo.activeRoute.pointTotal =
            rte.feature.geometry.coordinates.length
          let idx = -1
          for (let i = 0; i < rte.feature.geometry.coordinates.length; i++) {
            if (
              rte.feature.geometry.coordinates[i][0] ===
                this.courseInfo.nextPoint?.position?.longitude &&
              rte.feature.geometry.coordinates[i][1] ===
                this.courseInfo.nextPoint.position?.latitude
            ) {
              idx = i
            }
          }
          if (idx !== -1) {
            this.courseInfo.activeRoute.pointIndex = idx
          }
          this.emitCourseInfo()
          res.status(200).json(Responses.ok)
          return
        }

        // set new destination
        this.courseInfo.nextPoint = {
          position: this.getRoutePoint(
            rte,
            this.courseInfo.activeRoute.pointIndex as number,
            this.courseInfo.activeRoute.reverse
          ),
          type: RoutePoint
        }

        // set previousPoint
        if (this.courseInfo.activeRoute.pointIndex === 0) {
          try {
            const position: any = this.getVesselPosition()
            if (position && position.value) {
              this.courseInfo.previousPoint = {
                position: position.value,
                type: VesselPosition
              }
            } else {
              res.status(400).json(Responses.invalid)
              return false
            }
          } catch (_err) {
            console.log(`** Course API: Unable to retrieve vessel position!`)
            res.status(400).json(Responses.invalid)
            return false
          }
        } else {
          this.courseInfo.previousPoint = {
            position: this.getRoutePoint(
              rte,
              (this.courseInfo.activeRoute.pointIndex as number) - 1,
              this.courseInfo.activeRoute.reverse
            ),
            type: RoutePoint
          }
        }
        this.emitCourseInfo()
        res.status(200).json(Responses.ok)
      }
    )
  }

  private calcReversedIndex(activeRoute: ActiveRoute): number {
    return (
      (activeRoute.pointTotal as number) -
      1 -
      (activeRoute.pointIndex as number)
    )
  }

  private async activateRoute(
    route: RouteDestination,
    src: CommandSource = API_CMD_SRC
  ): Promise<boolean> {
    const { href, reverse } = route
    let rte: any

    if (href) {
      rte = await this.getRoute(href)
      if (!rte) {
        throw new Error(
          `** Could not retrieve route information for ${route.href}`
        )
      }
      if (!Array.isArray(rte.feature?.geometry?.coordinates)) {
        throw new Error(`Invalid route coordinate data! (${route.href})`)
      }
    } else {
      throw new Error('Route information not supplied!')
    }

    const newCourse: CourseInfo = { ...this.courseInfo }
    const pointIndex = this.parsePointIndex(route.pointIndex as number, rte)
    const activeRoute = {
      href,
      name: rte.name,
      reverse: !!reverse,
      pointIndex,
      pointTotal: rte.feature.geometry.coordinates.length
    }
    newCourse.activeRoute = activeRoute
    newCourse.nextPoint = {
      type: RoutePoint,
      position: this.getRoutePoint(rte, pointIndex, !!reverse)
    }
    newCourse.startTime = new Date().toISOString()

    if (this.isValidArrivalCircle(route.arrivalCircle as number)) {
      newCourse.arrivalCircle = route.arrivalCircle as number
    }

    // set previousPoint
    if (activeRoute.pointIndex === 0) {
      try {
        const position: any = this.getVesselPosition()
        if (position && position.value) {
          newCourse.previousPoint = {
            position: position.value,
            type: VesselPosition
          }
        } else {
          throw new Error(`Error: Unable to retrieve vessel position!`)
        }
      } catch (_err) {
        throw new Error(`Error: Unable to retrieve vessel position!`)
      }
    } else {
      newCourse.previousPoint = {
        position: this.getRoutePoint(
          rte,
          activeRoute.pointIndex - 1,
          activeRoute.reverse
        ),
        type: RoutePoint
      }
    }

    if (this.isSourceChange(src)) {
      this.clearDestination(true)
    }
    this.courseInfo = newCourse
    this.cmdSource = src
    return true
  }

  private async setDestination(
    dest: PointDestination & { arrivalCircle?: number },
    src: CommandSource = API_CMD_SRC
  ): Promise<boolean> {
    const newCourse: CourseInfo = { ...this.courseInfo }

    newCourse.startTime = new Date().toISOString()

    if (this.isValidArrivalCircle(dest.arrivalCircle)) {
      newCourse.arrivalCircle = dest.arrivalCircle as number
    }

    if ('href' in dest) {
      const typedHref = this.parseHref(dest.href)
      if (typedHref) {
        debug(`fetching ${JSON.stringify(typedHref)}`)
        // fetch waypoint resource details
        try {
          const r = (await this.resourcesApi.getResource(
            typedHref.type,
            typedHref.id
          )) as any
          if (isValidCoordinate(r.feature.geometry.coordinates)) {
            newCourse.nextPoint = {
              position: {
                latitude: r.feature.geometry.coordinates[1],
                longitude: r.feature.geometry.coordinates[0]
              },
              href: dest.href,
              type: r.type ?? 'Waypoint'
            }
            newCourse.activeRoute = null
          } else {
            throw new Error(`Invalid waypoint coordinate data! (${dest.href})`)
          }
        } catch (_err) {
          throw new Error(`Error retrieving and validating ${dest.href}`)
        }
      } else {
        throw new Error(`Invalid href! (${dest.href})`)
      }
    } else if ('position' in dest) {
      if (this.isValidPosition(dest.position)) {
        newCourse.nextPoint = {
          position: dest.position,
          type: Location
        }
      } else {
        throw new Error(`Error: position is not valid`)
      }
    } else {
      throw new Error(`Destination not provided!`)
    }

    // clear activeRoute
    newCourse.activeRoute = null

    // set previousPoint
    try {
      const position: any = this.getVesselPosition()
      if (position && position.value) {
        newCourse.previousPoint = {
          position: position.value,
          type: VesselPosition
        }
      } else {
        throw new Error(
          `Error: navigation.position.value is undefined! (${position})`
        )
      }
    } catch (_err) {
      throw new Error(`Error: Unable to retrieve vessel position!`)
    }

    if (this.isSourceChange(src)) {
      this.clearDestination(true)
    }
    this.courseInfo = newCourse
    this.cmdSource = src
    return true
  }

  private isValidArrivalCircle(value: number | undefined): boolean {
    return typeof value === 'number' && value >= 0
  }

  private isValidIsoTime(value: string | undefined): boolean {
    return !value
      ? false
      : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)((-(\d{2}):(\d{2})|Z))$/.test(
          value
        )
  }

  private parsePointIndex(index: number, rte: any): number {
    if (typeof index !== 'number' || !rte) {
      return 0
    }
    if (!rte.feature?.geometry?.coordinates) {
      return 0
    }
    if (!Array.isArray(rte.feature?.geometry?.coordinates)) {
      return 0
    }
    if (index < 0) {
      return 0
    }
    if (index > rte.feature?.geometry?.coordinates.length - 1) {
      return rte.feature?.geometry?.coordinates.length - 1
    }
    return index
  }

  private parseHref(
    href: string
  ): { type: SignalKResourceType; id: string } | undefined {
    if (!href) {
      return undefined
    }

    const ref: string[] = href.split('/').slice(-3)
    if (ref.length < 3) {
      return undefined
    }
    if (ref[0] !== 'resources') {
      return undefined
    }
    return {
      type: ref[1] as SignalKResourceType,
      id: ref[2]
    }
  }

  private getRoutePoint(rte: any, index: number, reverse: boolean | null) {
    const pos = reverse
      ? rte.feature.geometry.coordinates[
          rte.feature.geometry.coordinates.length - (index + 1)
        ]
      : rte.feature.geometry.coordinates[index]
    const result: Position = {
      latitude: pos[1],
      longitude: pos[0]
    }
    if (pos.length === 3) {
      result.altitude = pos[2]
    }
    return result
  }

  private getRoutePoints(rte: any) {
    const pts = rte.feature.geometry.coordinates.map((pt: GeoJsonPoint) => {
      return {
        position: {
          latitude: pt[1],
          longitude: pt[0]
        }
      }
    })
    return pts
  }

  private async getRoute(href: string): Promise<Route | undefined> {
    const h = this.parseHref(href)
    if (h) {
      try {
        return (await this.resourcesApi.getResource(h.type, h.id)) as
          | Route
          | undefined
      } catch (_err) {
        debug(`** Unable to fetch resource: ${h.type}, ${h.id}`)
        return undefined
      }
    } else {
      debug(`** Unable to parse href: ${href}`)
      return undefined
    }
  }

  private buildDeltaMsg(paths: string[]): any {
    const values: Array<{ path: string; value: any }> = []
    const navPath = 'navigation.course'

    if (
      paths.length === 0 ||
      (paths && (paths.includes('activeRoute') || paths.includes('nextPoint')))
    ) {
      values.push({
        path: `${navPath}.startTime`,
        value: this.courseInfo.startTime
      })
    }

    if (paths.length === 0 || (paths && paths.includes('targetArrivalTime'))) {
      values.push({
        path: `${navPath}.targetArrivalTime`,
        value: this.courseInfo.targetArrivalTime
      })
    }

    if (paths.length === 0 || (paths && paths.includes('activeRoute'))) {
      values.push({
        path: `${navPath}.activeRoute`,
        value: this.courseInfo.activeRoute
      })
    }

    if (paths.length === 0 || (paths && paths.includes('arrivalCircle'))) {
      values.push({
        path: `${navPath}.arrivalCircle`,
        value: this.courseInfo.arrivalCircle
      })
    }

    if (paths.length === 0 || (paths && paths.includes('previousPoint'))) {
      values.push({
        path: `${navPath}.previousPoint`,
        value: this.courseInfo.previousPoint
      })
    }

    return {
      updates: [
        {
          values
        }
      ]
    }
  }

  private buildV1DeltaMsg(paths: string[]): Delta {
    const values: Array<{ path: string; value: any }> = []
    const navGC = 'navigation.courseGreatCircle'
    const navRL = 'navigation.courseRhumbline'

    if (paths.length === 0 || (paths && paths.includes('activeRoute'))) {
      values.push({
        path: `${navGC}.activeRoute.href`,
        value: this.courseInfo.activeRoute?.href ?? null
      })
      values.push({
        path: `${navRL}.activeRoute.href`,
        value: this.courseInfo.activeRoute?.href ?? null
      })

      values.push({
        path: `${navGC}.activeRoute.startTime`,
        value: this.courseInfo.startTime
      })
      values.push({
        path: `${navRL}.activeRoute.startTime`,
        value: this.courseInfo.startTime
      })
    }
    if (paths.length === 0 || (paths && paths.includes('nextPoint'))) {
      values.push({
        path: `${navGC}.nextPoint.value.href`,
        value: this.courseInfo.nextPoint?.href ?? null
      })
      values.push({
        path: `${navRL}.nextPoint.value.href`,
        value: this.courseInfo.nextPoint?.href ?? null
      })

      values.push({
        path: `${navGC}.nextPoint.value.type`,
        value: this.courseInfo.nextPoint?.type ?? null
      })
      values.push({
        path: `${navRL}.nextPoint.value.type`,
        value: this.courseInfo.nextPoint?.type ?? null
      })

      values.push({
        path: `${navGC}.nextPoint.position`,
        value: this.courseInfo.nextPoint?.position ?? null
      })
      values.push({
        path: `${navRL}.nextPoint.position`,
        value: this.courseInfo.nextPoint?.position ?? null
      })
    }
    if (paths.length === 0 || (paths && paths.includes('arrivalCircle'))) {
      values.push({
        path: `${navGC}.nextPoint.arrivalCircle`,
        value: this.courseInfo.arrivalCircle
      })
      values.push({
        path: `${navRL}.nextPoint.arrivalCircle`,
        value: this.courseInfo.arrivalCircle
      })
    }
    if (paths.length === 0 || (paths && paths.includes('previousPoint'))) {
      values.push({
        path: `${navGC}.previousPoint.position`,
        value: this.courseInfo.previousPoint?.position ?? null
      })
      values.push({
        path: `${navRL}.previousPoint.position`,
        value: this.courseInfo.previousPoint?.position ?? null
      })

      values.push({
        path: `${navGC}.previousPoint.value.type`,
        value: this.courseInfo.previousPoint?.type ?? null
      })
      values.push({
        path: `${navRL}.previousPoint.value.type`,
        value: this.courseInfo.previousPoint?.type ?? null
      })
    }

    return {
      updates: [
        {
          values: values as PathValue[]
        }
      ]
    }
  }

  private emitCourseInfo(noSave?: boolean, ...paths: string[]) {
    this.app.handleMessage(
      API_CMD_SRC.$source,
      this.buildV1DeltaMsg(paths),
      SKVersion.v1
    )

    const v2Delta = this.buildDeltaMsg(paths)
    v2Delta.updates[0].$source = API_CMD_SRC.$source
    v2Delta.updates.push({
      $source: this.cmdSource ? this.cmdSource.$source : API_CMD_SRC.$source,
      values: [
        {
          path: `navigation.course.nextPoint`,
          value: this.courseInfo.nextPoint
        }
      ]
    })
    this.app.handleMessage(
      'N/A', //no-op as updates already have $source
      v2Delta,
      SKVersion.v2
    )

    const p = typeof noSave === 'undefined' ? this.isAPICmdSource() : !noSave
    if (p) {
      debug('*** persisting state **')
      this.store.write(this.courseInfo).catch((error) => {
        console.log('Course API: Unable to persist destination details!')
        debug(error)
      })
    }
  }

  private isAPICmdSource = () => this.cmdSource?.type === API_CMD_SRC.type

  private isSourceChange = (newSource: CommandSource): boolean =>
    this.cmdSource !== null &&
    (this.cmdSource.type !== newSource.type ||
      this.cmdSource.$source !== newSource.$source)

  private isCurrentCmdSource = (cmdSource: CommandSource) =>
    this.cmdSource?.type === cmdSource.type &&
    this.cmdSource?.$source === cmdSource.$source &&
    this.cmdSource?.path === cmdSource.path &&
    this.cmdSource?.msg === cmdSource.msg
}

const hasAllProperties = (info: CourseInfo, propNames: string[]) => {
  return !propNames.find((propName) => !(propName in info))
}
