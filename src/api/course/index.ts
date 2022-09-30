import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:course')

import { FullSignalK } from '@signalk/signalk-schema'
import { Application, Request, Response } from 'express'
import _ from 'lodash'
import path from 'path'
import { WithConfig } from '../../app'
import { WithSecurityStrategy } from '../../security'

import { GeoJsonPoint, Position, Route } from '@signalk/server-api'
import { isValidCoordinate } from 'geolib'
import { Responses } from '../'
import { Store } from '../../serverstate/store'

import { buildSchemaSync } from 'api-schema-builder'
import courseOpenApi from './openApi.json'

const COURSE_API_SCHEMA = buildSchemaSync(courseOpenApi)

const SIGNALK_API_PATH = `/signalk/v2/api`
const COURSE_API_PATH = `${SIGNALK_API_PATH}/vessels/self/navigation/course`

interface CourseApplication
  extends Application,
    WithConfig,
    WithSecurityStrategy {
  resourcesApi: {
    getResource: (resourceType: string, resourceId: string) => any
  }
  signalk: FullSignalK
  handleMessage: (id: string, data: any) => void
}

interface DestinationBase {
  href?: string
  arrivalCircle?: number
}
interface Destination extends DestinationBase {
  position?: Position
  type?: string
}
interface ActiveRoute extends DestinationBase {
  pointIndex?: number
  reverse?: boolean
  name?: string
}

interface Location extends Position {
  name?: string
}

interface CourseInfo {
  startTime: string | null
  targetArrivalTime: string | null
  activeRoute: {
    href: string | null
    pointIndex: number | null
    pointTotal: number | null
    reverse: boolean | null
    name: string | null
    waypoints: any[] | null
  }
  nextPoint: {
    href: string | null
    type: string | null
    position: Position | null
    arrivalCircle: number
  }
  previousPoint: {
    href: string | null
    type: string | null
    position: Position | null
  }
}

export class CourseApi {
  private server: CourseApplication

  private courseInfo: CourseInfo = {
    startTime: null,
    targetArrivalTime: null,
    activeRoute: {
      href: null,
      pointIndex: null,
      pointTotal: null,
      reverse: null,
      name: null,
      waypoints: null
    },
    nextPoint: {
      href: null,
      type: null,
      position: null,
      arrivalCircle: 0
    },
    previousPoint: {
      href: null,
      type: null,
      position: null
    }
  }

  private store: Store

  constructor(app: CourseApplication) {
    this.server = app
    this.store = new Store(
      path.join(app.config.configPath, 'serverstate/course')
    )
  }

  async start() {
    return new Promise<void>(async resolve => {
      this.initCourseRoutes()

      try {
        const storeData = await this.store.read()
        this.courseInfo = this.validateCourseInfo(storeData)
      } catch (error) {
        console.error('** No persisted course data (using default) **')
      }
      debug(this.courseInfo)
      this.emitCourseInfo(true)
      resolve()
    })
  }

  private getVesselPosition() {
    return _.get((this.server.signalk as any).self, 'navigation.position')
  }

  private validateCourseInfo(info: CourseInfo) {
    if (info.activeRoute && info.nextPoint && info.previousPoint) {
      return info
    } else {
      debug(`** Error: Loaded course data is invalid!! (using default) **`)
      return this.courseInfo
    }
  }

  private updateAllowed(request: Request): boolean {
    return this.server.securityStrategy.shouldAllowPut(
      request,
      'vessels.self',
      null,
      'navigation.course'
    )
  }

  private initCourseRoutes() {
    debug(`** Initialise ${COURSE_API_PATH} path handlers **`)
    // return current course information
    this.server.get(
      `${COURSE_API_PATH}`,
      async (req: Request, res: Response) => {
        debug(`** GET ${COURSE_API_PATH}`)
        res.json(this.courseInfo)
      }
    )

    this.server.put(
      `${COURSE_API_PATH}/arrivalCircle`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/arrivalCircle`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        if (this.isValidArrivalCircle(req.body.value)) {
          this.courseInfo.nextPoint.arrivalCircle = req.body.value
          this.emitCourseInfo()
          res.status(200).json(Responses.ok)
        } else {
          res.status(400).json(Responses.invalid)
        }
      }
    )

    this.server.put(
      `${COURSE_API_PATH}/restart`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/restart`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        if (!this.courseInfo.nextPoint.position) {
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
            this.courseInfo.previousPoint.position = position.value
            this.emitCourseInfo()
            res.status(200).json(Responses.ok)
          } else {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: `Vessel position unavailable!`
            })
          }
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `Vessel position unavailable!`
          })
        }
      }
    )

    this.server.put(
      `${COURSE_API_PATH}/targetArrivalTime`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/targetArrivalTime`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        if (req.body.value === null || this.isValidIsoTime(req.body.value)) {
          this.courseInfo.targetArrivalTime = req.body.value
          this.emitCourseInfo()
          res.status(200).json(Responses.ok)
        } else {
          res.status(400).json(Responses.invalid)
        }
      }
    )

    // set destination
    this.server.put(
      `${COURSE_API_PATH}/destination`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/destination`)
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

    // clear destination
    this.server.delete(
      `${COURSE_API_PATH}/destination`,
      async (req: Request, res: Response) => {
        debug(`** DELETE ${COURSE_API_PATH}/destination`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).json(Responses.ok)
      }
    )

    // set activeRoute
    this.server.put(
      `${COURSE_API_PATH}/activeRoute`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/activeRoute`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          const result = await this.activateRoute(req.body)
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

    // clear activeRoute
    this.server.delete(
      `${COURSE_API_PATH}/activeRoute`,
      async (req: Request, res: Response) => {
        debug(`** DELETE ${COURSE_API_PATH}/activeRoute`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).json(Responses.ok)
      }
    )

    this.server.put(
      `${COURSE_API_PATH}/activeRoute/:action`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/activeRoute/${req.params.action}`)
        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        // fetch active route data
        if (!this.courseInfo.activeRoute.href) {
          res.status(400).json(Responses.invalid)
          return
        }
        const rte = await this.getRoute(this.courseInfo.activeRoute.href)
        if (!rte) {
          res.status(400).json(Responses.invalid)
          return
        }

        if (req.params.action === 'nextPoint') {
          if (
            typeof this.courseInfo.activeRoute.pointIndex === 'number' &&
            typeof req.body.value === 'number' &&
            (req.body.value === 1 || req.body.value === -1)
          ) {
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
            this.courseInfo.activeRoute.pointIndex = this.calcReversedIndex()
          }
          this.courseInfo.activeRoute.reverse = !this.courseInfo.activeRoute
            .reverse
        }

        if (req.params.action === 'refresh') {
          this.courseInfo.activeRoute.pointTotal =
            rte.feature.geometry.coordinates.length
          let idx = -1
          for (let i = 0; i < rte.feature.geometry.coordinates.length; i++) {
            if (
              rte.feature.geometry.coordinates[i][0] ===
                this.courseInfo.nextPoint.position?.longitude &&
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
        this.courseInfo.nextPoint.position = this.getRoutePoint(
          rte,
          this.courseInfo.activeRoute.pointIndex as number,
          this.courseInfo.activeRoute.reverse
        )
        this.courseInfo.nextPoint.type = `RoutePoint`
        this.courseInfo.nextPoint.href = null

        // set previousPoint
        try {
          const position: any = this.getVesselPosition()
          if (position && position.value) {
            this.courseInfo.previousPoint.position = position.value
            this.courseInfo.previousPoint.type = `VesselPosition`
          } else {
            res.status(400).json(Responses.invalid)
            return false
          }
        } catch (err) {
          console.log(`** Error: unable to retrieve vessel position!`)
          res.status(400).json(Responses.invalid)
          return false
        }

        this.courseInfo.previousPoint.href = null
        this.emitCourseInfo()
        res.status(200).json(Responses.ok)
      }
    )
  }

  private calcReversedIndex(): number {
    return (
      (this.courseInfo.activeRoute.pointTotal as number) -
      1 -
      (this.courseInfo.activeRoute.pointIndex as number)
    )
  }

  private async activateRoute(route: ActiveRoute): Promise<boolean> {
    let rte: any

    if (route.href) {
      rte = await this.getRoute(route.href)
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

    // set activeroute
    newCourse.activeRoute.href = route.href

    newCourse.startTime = new Date().toISOString()

    newCourse.activeRoute.name = rte.name
    newCourse.activeRoute.waypoints = this.getRoutePoints(rte)

    if (this.isValidArrivalCircle(route.arrivalCircle as number)) {
      newCourse.nextPoint.arrivalCircle = route.arrivalCircle as number
    }

    newCourse.activeRoute.reverse = !!route.reverse

    newCourse.activeRoute.pointIndex = this.parsePointIndex(
      route.pointIndex as number,
      rte
    )
    newCourse.activeRoute.pointTotal = rte.feature.geometry.coordinates.length

    // set nextPoint
    newCourse.nextPoint.position = this.getRoutePoint(
      rte,
      newCourse.activeRoute.pointIndex,
      newCourse.activeRoute.reverse
    )
    newCourse.nextPoint.type = `RoutePoint`
    newCourse.nextPoint.href = null

    // set previousPoint
    try {
      const position: any = this.getVesselPosition()
      if (position && position.value) {
        this.courseInfo.previousPoint.position = position.value
        this.courseInfo.previousPoint.type = `VesselPosition`
      } else {
        throw new Error(`Error: Unable to retrieve vessel position!`)
      }
    } catch (err) {
      throw new Error(`Error: Unable to retrieve vessel position!`)
    }

    newCourse.previousPoint.href = null

    this.courseInfo = newCourse
    return true
  }

  private async setDestination(dest: Destination): Promise<boolean> {
    const newCourse: CourseInfo = { ...this.courseInfo }

    newCourse.startTime = new Date().toISOString()

    // set nextPoint
    if (this.isValidArrivalCircle(dest.arrivalCircle)) {
      newCourse.nextPoint.arrivalCircle = dest.arrivalCircle as number
    }

    newCourse.nextPoint.type =
      typeof dest.type !== 'undefined' ? dest.type : null

    if (dest.href) {
      const typedHref = this.parseHref(dest.href)
      if (typedHref) {
        debug(`fetching ${JSON.stringify(typedHref)}`)
        // fetch waypoint resource details
        try {
          const r = await this.server.resourcesApi.getResource(
            typedHref.type,
            typedHref.id
          )
          if (isValidCoordinate(r.feature.geometry.coordinates)) {
            newCourse.nextPoint.position = {
              latitude: r.feature.geometry.coordinates[1],
              longitude: r.feature.geometry.coordinates[0]
            }
            newCourse.nextPoint.href = dest.href
            newCourse.nextPoint.type = 'Waypoint'
          } else {
            throw new Error(`Invalid waypoint coordinate data! (${dest.href})`)
          }
        } catch (err) {
          throw new Error(`Error retrieving and validating ${dest.href}`)
        }
      } else {
        throw new Error(`Invalid href! (${dest.href})`)
      }
    } else if (dest.position) {
      newCourse.nextPoint.href = null
      newCourse.nextPoint.type = 'Location'
      if (isValidCoordinate(dest.position)) {
        newCourse.nextPoint.position = dest.position
      } else {
        throw new Error(`Error: position is not valid`)
      }
    } else {
      throw new Error(`Destination not provided!`)
    }

    // clear activeRoute values
    newCourse.activeRoute.href = null
    newCourse.activeRoute.pointIndex = null
    newCourse.activeRoute.pointTotal = null
    newCourse.activeRoute.reverse = null
    newCourse.activeRoute.waypoints = null

    // set previousPoint
    try {
      const position: any = this.getVesselPosition()
      if (position && position.value) {
        newCourse.previousPoint.position = position.value
        newCourse.previousPoint.type = `VesselPosition`
        newCourse.previousPoint.href = null
      } else {
        throw new Error(
          `Error: navigation.position.value is undefined! (${position})`
        )
      }
    } catch (err) {
      throw new Error(`Error: Unable to retrieve vessel position!`)
    }

    this.courseInfo = newCourse
    return true
  }

  private clearDestination() {
    this.courseInfo.startTime = null
    this.courseInfo.targetArrivalTime = null
    this.courseInfo.activeRoute.href = null
    this.courseInfo.activeRoute.pointIndex = null
    this.courseInfo.activeRoute.pointTotal = null
    this.courseInfo.activeRoute.reverse = null
    this.courseInfo.activeRoute.name = null
    this.courseInfo.activeRoute.waypoints = null
    this.courseInfo.nextPoint.href = null
    this.courseInfo.nextPoint.type = null
    this.courseInfo.nextPoint.position = null
    this.courseInfo.previousPoint.href = null
    this.courseInfo.previousPoint.type = null
    this.courseInfo.previousPoint.position = null
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

  private parseHref(href: string): { type: string; id: string } | undefined {
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
      type: ref[1],
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
        return await this.server.resourcesApi.getResource(h.type, h.id)
      } catch (err) {
        debug(`** Unable to fetch resource: ${h.type}, ${h.id}`)
        return undefined
      }
    } else {
      debug(`** Unable to parse href: ${href}`)
      return undefined
    }
  }

  private buildDeltaMsg(): any {
    const values: Array<{ path: string; value: any }> = []
    const navPath = 'navigation.course'

    debug(this.courseInfo)

    values.push({
      path: `${navPath}.startTime`,
      value: this.courseInfo.startTime
    })
    values.push({
      path: `${navPath}.targetArrivalTime`,
      value: this.courseInfo.targetArrivalTime
    })
    values.push({
      path: `${navPath}.activeRoute.href`,
      value: this.courseInfo.activeRoute.href
    })
    values.push({
      path: `${navPath}.activeRoute.pointIndex`,
      value: this.courseInfo.activeRoute.pointIndex
    })
    values.push({
      path: `${navPath}.activeRoute.pointTotal`,
      value: this.courseInfo.activeRoute.pointTotal
    })
    values.push({
      path: `${navPath}.activeRoute.reverse`,
      value: this.courseInfo.activeRoute.reverse
    })
    values.push({
      path: `${navPath}.activeRoute.name`,
      value: this.courseInfo.activeRoute.name
    })
    values.push({
      path: `${navPath}.activeRoute.waypoints`,
      value: this.courseInfo.activeRoute.waypoints
    })

    values.push({
      path: `${navPath}.nextPoint.href`,
      value: this.courseInfo.nextPoint.href
    })
    values.push({
      path: `${navPath}.nextPoint.position`,
      value: this.courseInfo.nextPoint.position
    })
    values.push({
      path: `${navPath}.nextPoint.type`,
      value: this.courseInfo.nextPoint.type
    })
    values.push({
      path: `${navPath}.nextPoint.arrivalCircle`,
      value: this.courseInfo.nextPoint.arrivalCircle
    })

    values.push({
      path: `${navPath}.previousPoint.position`,
      value: this.courseInfo.previousPoint.position
    })
    values.push({
      path: `${navPath}.previousPoint.type`,
      value: this.courseInfo.previousPoint.type
    })

    return {
      updates: [
        {
          values
        }
      ]
    }
  }

  private emitCourseInfo(noSave = false) {
    this.server.handleMessage('courseApi', this.buildDeltaMsg())
    if (!noSave) {
      this.store.write(this.courseInfo).catch(error => {
        console.log(error)
      })
    }
  }
}
