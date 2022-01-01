import Debug from 'debug'
import { Application, Request, Response } from 'express'
import path from 'path'
import { WithConfig, WithSecurityStrategy, WithSignalK } from '../../app'
import _ from 'lodash'
import { Store } from '../store'

const debug = Debug('signalk:courseApi')

const SIGNALK_API_PATH: string = `/signalk/v1/api`
const COURSE_API_PATH: string = `${SIGNALK_API_PATH}/vessels/self/navigation/course`

const DELTA_INTERVAL: number = 30000

interface CourseApplication
  extends Application,
    WithConfig,
    WithSignalK,
    WithSecurityStrategy {}

interface CourseApplication extends Application {
  resourcesApi: {
    getResource: (resourceType: string, resourceId: string) => any
  }
}

interface DestinationBase {
  href?: string
  arrivalCircle?: number
}
interface Destination extends DestinationBase {
  position?: {
    latitude: number
    longitude: number
    altitude?: number
  }
  type?: string
}
interface ActiveRoute extends DestinationBase {
  pointIndex?: number
  reverse?: boolean
}

interface Position {
  latitude: number
  longitude: number
  altitude?: number
}

interface CourseInfo {
  activeRoute: {
    href: string | null
    startTime: string | null
    pointIndex: number
    reverse: boolean
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
    activeRoute: {
      href: null,
      startTime: null,
      pointIndex: 0,
      reverse: false
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

  private getVesselPosition() {
    return _.get( (this.server.signalk as any).self, 'navigation.position')
  }

  constructor(app: CourseApplication) {
    this.server = app
    this.store = new Store(path.join(app.config.configPath, 'api/course'))
    this.start(app).catch(error => {
      console.log(error)
    })
  }

  private async start(app: any) {
    debug(`** Initialise ${COURSE_API_PATH} path handler **`)
    this.server = app
    this.initResourceRoutes()

    try {
      const storeData = await this.store.read()
      this.courseInfo = this.validateCourseInfo(storeData)
    } catch (error) {
      debug('** No persisted course data (using default) **')
      this.store.write(this.courseInfo).catch(error => {
        console.log(error)
      })
    }
    debug(this.courseInfo)
    this.emitCourseInfo(true)

    setInterval(() => {
      if (this.courseInfo.nextPoint.position) {
        this.emitCourseInfo(true)
      }
    }, DELTA_INTERVAL)
  }

  private validateCourseInfo(info: CourseInfo) {
    if (info.activeRoute && info.nextPoint && info.previousPoint) {
      return info
    } else {
      debug(`** Error: Loaded course data is invalid!! (using default) **`)
      return this.courseInfo
    }
  }

  private updateAllowed(): boolean {
    return this.server.securityStrategy.shouldAllowPut(
      this.server,
      'vessels.self',
      null,
      'navigation.course'
    )
  }

  private initResourceRoutes() {
    // return current course information
    this.server.get(
      `${COURSE_API_PATH}`,
      async (req: Request, res: Response) => {
        debug(`** GET ${COURSE_API_PATH}`)
        res.json(this.courseInfo)
      }
    )

    this.server.put(
      `${COURSE_API_PATH}/restart`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/restart`)
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
        if (!this.courseInfo.nextPoint.position) {
          res.status(406).send(`No active destination!`)
          return
        }
        // set previousPoint to vessel position
        try {
          const position: any = this.getVesselPosition()
          if (position && position.value) {
            this.courseInfo.previousPoint.position = position.value
            this.emitCourseInfo()
            res.status(200).send('OK')
          }
        } catch (err) {
          res.status(406).send(`Vessel position unavailable!`)
        }
      }
    )

    this.server.put(
      `${COURSE_API_PATH}/arrivalCircle`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/arrivalCircle`)
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
        if (this.isValidArrivalCircle(req.body.value)) {
          this.courseInfo.nextPoint.arrivalCircle = req.body.value
          this.emitCourseInfo()
          res.status(200).send('OK')
        } else {
          res.status(406).send(`Invalid Data`)
        }
      }
    )

    // set destination
    this.server.put(
      `${COURSE_API_PATH}/destination`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/destination`)
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
        if (!req.body.value) {
          debug(`** Error: req.body.value is null || undefined!`)
          res.status(406).send(`Invalid Data`)
          return
        }
        const result = await this.setDestination(req.body.value)
        if (result) {
          this.emitCourseInfo()
          res.status(200).send('OK')
        } else {
          this.clearDestination()
          this.emitCourseInfo()
          res.status(406).send(`Invalid Data`)
        }
      }
    )

    // clear destination
    this.server.delete(
      `${COURSE_API_PATH}/destination`,
      async (req: Request, res: Response) => {
        debug(`** DELETE ${COURSE_API_PATH}/destination`)
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).send('OK')
      }
    )

    // set activeRoute
    this.server.put(
      `${COURSE_API_PATH}/activeRoute`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/activeRoute`)
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
        const result = await this.activateRoute(req.body.value)
        if (result) {
          this.emitCourseInfo()
          res.status(200).send('OK')
        } else {
          this.clearDestination()
          this.emitCourseInfo()
          res.status(406).send(`Invalid Data`)
        }
      }
    )

    // clear activeRoute /destination
    this.server.delete(
      `${COURSE_API_PATH}/activeRoute`,
      async (req: Request, res: Response) => {
        debug(`** DELETE ${COURSE_API_PATH}/activeRoute`)
        if (!this.updateAllowed()) {
          res.status(403)
          return
        }
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).send('OK')
      }
    )

    this.server.put(
      `${COURSE_API_PATH}/activeRoute/:action`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/activeRoute`)
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
        // fetch active route data
        if (!this.courseInfo.activeRoute.href) {
          res.status(406).send(`Invalid Data`)
          return
        }
        const rte = await this.getRoute(this.courseInfo.activeRoute.href)
        if (!rte) {
          res.status(406).send(`Invalid Data`)
          return
        }

        if (req.params.action === 'nextPoint') {
          if (
            typeof req.body.value === 'number' &&
            (req.body.value === 1 || req.body.value === -1)
          ) {
            this.courseInfo.activeRoute.pointIndex = this.parsePointIndex(
              this.courseInfo.activeRoute.pointIndex + req.body.value,
              rte
            )
          } else {
            res.status(406).send(`Invalid Data`)
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
            res.status(406).send(`Invalid Data`)
            return
          }
        }

        // set new destination
        this.courseInfo.nextPoint.position = this.getRoutePoint(
          rte,
          this.courseInfo.activeRoute.pointIndex,
          this.courseInfo.activeRoute.reverse
        )
        this.courseInfo.nextPoint.type = `RoutePoint`
        this.courseInfo.nextPoint.href = null

        // set previousPoint
        if (this.courseInfo.activeRoute.pointIndex === 0) {
          try {
            const position: any = this.getVesselPosition()
            if (position && position.value) {
              this.courseInfo.previousPoint.position = position.value
              this.courseInfo.previousPoint.type = `VesselPosition`
            } else {
              res.status(406).send(`Invalid Data`)
              return false
            }
          } catch (err) {
            res.status(406).send(`Invalid Data`)
            return false
          }
        } else {
          this.courseInfo.previousPoint.position = this.getRoutePoint(
            rte,
            this.courseInfo.activeRoute.pointIndex - 1,
            this.courseInfo.activeRoute.reverse
          )
          this.courseInfo.previousPoint.type = `RoutePoint`
        }
        this.courseInfo.previousPoint.href = null
        res.status(200).send('OK')
      }
    )
  }

  private async activateRoute(route: ActiveRoute): Promise<boolean> {
    let rte: any

    if (route.href) {
      rte = await this.getRoute(route.href)
      if (!rte) {
        return false
      }
      if (!Array.isArray(rte.feature?.geometry?.coordinates)) {
        return false
      }
    } else {
      return false
    }

    const newCourse: any = {}
    Object.assign(newCourse, this.courseInfo)

    // set activeroute
    newCourse.activeRoute.href = route.href

    if (this.isValidArrivalCircle(route.arrivalCircle as number)) {
      newCourse.nextPoint.arrivalCircle = route.arrivalCircle
    }

    newCourse.activeRoute.startTime = new Date().toISOString()

    if (typeof route.reverse === 'boolean') {
      newCourse.activeRoute.reverse = route.reverse
    }

    newCourse.activeRoute.pointIndex = this.parsePointIndex(
      route.pointIndex as number,
      rte
    )

    // set nextPoint
    newCourse.nextPoint.position = this.getRoutePoint(
      rte,
      newCourse.activeRoute.pointIndex,
      newCourse.activeRoute.reverse
    )
    newCourse.nextPoint.type = `RoutePoint`
    newCourse.nextPoint.href = null

    // set previousPoint
    if (newCourse.activeRoute.pointIndex === 0) {
      try {
        const position: any = this.getVesselPosition()
        if (position && position.value) {
          this.courseInfo.previousPoint.position = position.value
          this.courseInfo.previousPoint.type = `VesselPosition`
        } else {
          return false
        }
      } catch (err) {
        return false
      }
    } else {
      newCourse.previousPoint.position = this.getRoutePoint(
        rte,
        newCourse.activeRoute.pointIndex - 1,
        newCourse.activeRoute.reverse
      )
      newCourse.previousPoint.type = `RoutePoint`
    }
    newCourse.previousPoint.href = null

    this.courseInfo = newCourse
    return true
  }

  private async setDestination(dest: any): Promise<boolean> {
    const newCourse: any = {}
    Object.assign(newCourse, this.courseInfo)

    // set nextPoint
    if (this.isValidArrivalCircle(dest.arrivalCircle)) {
      newCourse.nextPoint.arrivalCircle = dest.arrivalCircle
    }

    newCourse.nextPoint.type =
      typeof dest.type !== 'undefined' ? dest.type : null

    if (dest.href) {
      const href = this.parseHref(dest.href)
      if (href) {
        // fetch waypoint resource details
        try {
          const r = await this.server.resourcesApi.getResource(
            href.type,
            href.id
          )
          if (r.position && typeof r.position?.latitude !== 'undefined') {
            newCourse.nextPoint.position = r.position
            newCourse.nextPoint.href = dest.href
            newCourse.nextPoint.type = 'Waypoint'
          } else {
            return false
          }
        } catch (err) {
          return false
        }
      }
    } else if (dest.position) {
      newCourse.nextPoint.href = null
      newCourse.nextPoint.type = 'Location'
      if (typeof dest.position.latitude !== 'undefined') {
        newCourse.nextPoint.position = dest.position
      } else {
        debug(`** Error: position.latitude is undefined!`)
        return false
      }
    } else {
      return false
    }

    // set previousPoint
    try {
      const position: any = this.getVesselPosition()
      if (position && position.value) {
        newCourse.previousPoint.position = position.value
        newCourse.previousPoint.type = `VesselPosition`
        newCourse.previousPoint.href = null
      } else {
        debug(`** Error: navigation.position.value is undefined! (${position})`)
        return false
      }
    } catch (err) {
      debug(`** Error: unable to retrieve navigation.position! (${err})`)
      return false
    }

    this.courseInfo = newCourse
    return true
  }

  private clearDestination() {
    this.courseInfo.activeRoute.href = null
    this.courseInfo.activeRoute.startTime = null
    this.courseInfo.activeRoute.pointIndex = 0
    this.courseInfo.activeRoute.reverse = false
    this.courseInfo.nextPoint.href = null
    this.courseInfo.nextPoint.type = null
    this.courseInfo.nextPoint.position = null
    this.courseInfo.previousPoint.href = null
    this.courseInfo.previousPoint.type = null
    this.courseInfo.previousPoint.position = null
  }

  private isValidArrivalCircle(value: number): boolean {
    return typeof value === 'number' && value >= 0
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
      return rte.feature?.geometry?.coordinates.length
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

  private getRoutePoint(rte: any, index: number, reverse: boolean) {
    const pos = reverse
      ? rte.feature.geometry.coordinates[
          rte.feature.geometry.coordinates.length - (index + 1)
        ]
      : rte.feature.geometry.coordinates[index]
    return {
      latitude: pos[1],
      longitude: pos[0],
      altitude: pos.length === 3 ? pos[2] : 0
    }
  }

  private async getRoute(href: string): Promise<any> {
    const h = this.parseHref(href)
    if (h) {
      try {
        return await this.server.resourcesApi.getResource(h.type, h.id)
      } catch (err) {
        return undefined
      }
    } else {
      return undefined
    }
  }

  private buildDeltaMsg(): any {
    const values: Array<{ path: string; value: any }> = []
    const navPath = [
      'navigation.courseGreatCircle',
      'navigation.courseRhumbline'
    ]

    values.push({
      path: `navigation.course`,
      value: this.courseInfo
    })

    values.push({
      path: `${navPath[0]}.activeRoute.href`,
      value: this.courseInfo.activeRoute.href
    })
    values.push({
      path: `${navPath[1]}.activeRoute.href`,
      value: this.courseInfo.activeRoute.href
    })
    values.push({
      path: `${navPath[0]}.activeRoute.startTime`,
      value: this.courseInfo.activeRoute.startTime
    })
    values.push({
      path: `${navPath[1]}.activeRoute.startTime`,
      value: this.courseInfo.activeRoute.startTime
    })
    values.push({
      path: `${navPath[0]}.nextPoint.href`,
      value: this.courseInfo.nextPoint.href
    })
    values.push({
      path: `${navPath[1]}.nextPoint.href`,
      value: this.courseInfo.nextPoint.href
    })
    values.push({
      path: `${navPath[0]}.nextPoint.position`,
      value: this.courseInfo.nextPoint.position
    })
    values.push({
      path: `${navPath[1]}.nextPoint.position`,
      value: this.courseInfo.nextPoint.position
    })
    values.push({
      path: `${navPath[0]}.nextPoint.type`,
      value: this.courseInfo.nextPoint.type
    })
    values.push({
      path: `${navPath[1]}.nextPoint.type`,
      value: this.courseInfo.nextPoint.type
    })
    values.push({
      path: `${navPath[0]}.nextPoint.arrivalCircle`,
      value: this.courseInfo.nextPoint.arrivalCircle
    })
    values.push({
      path: `${navPath[1]}.nextPoint.arrivalCircle`,
      value: this.courseInfo.nextPoint.arrivalCircle
    })
    values.push({
      path: `${navPath[0]}.previousPoint.href`,
      value: this.courseInfo.previousPoint.href
    })
    values.push({
      path: `${navPath[1]}.previousPoint.href`,
      value: this.courseInfo.previousPoint.href
    })
    values.push({
      path: `${navPath[0]}.previousPoint.position`,
      value: this.courseInfo.previousPoint.position
    })
    values.push({
      path: `${navPath[1]}.previousPoint.position`,
      value: this.courseInfo.previousPoint.position
    })
    values.push({
      path: `${navPath[0]}.previousPoint.type`,
      value: this.courseInfo.previousPoint.type
    })
    values.push({
      path: `${navPath[1]}.previousPoint.type`,
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

  private emitCourseInfo(noSave: boolean = false) {
    this.server.handleMessage('courseApi', this.buildDeltaMsg())
    if (!noSave) {
      this.store.write(this.courseInfo).catch(error => {
        console.log(error)
      })
    }
  }
}
