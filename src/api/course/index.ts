<<<<<<< HEAD
import Debug from 'debug'
import { Application, Request, Response } from 'express'
=======
import {
  ResourceProvider,
  ResourceProviderMethods,
  SignalKResourceType
} from '@signalk/server-api'
import Debug from 'debug'
import { Application, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
>>>>>>> init courseApi

const debug = Debug('signalk:courseApi')

const SIGNALK_API_PATH: string = `/signalk/v1/api`
const COURSE_API_PATH: string = `${SIGNALK_API_PATH}/vessels/self/navigation/course`
<<<<<<< HEAD

const DELTA_INTERVAL: number = 30000
=======
const UUID_PREFIX: string = 'urn:mrn:signalk:uuid:'

const API_METHODS: string[] = []
>>>>>>> init courseApi

interface CourseApplication extends Application {
  handleMessage: (id: string, data: any) => void
  getSelfPath: (path: string) => any
<<<<<<< HEAD
  securityStrategy: {
    shouldAllowPut: (
      req: Application,
      context: string,
      source: any,
      path: string
    ) => boolean
  }
=======
>>>>>>> init courseApi
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
<<<<<<< HEAD
=======

>>>>>>> init courseApi
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

  constructor(app: CourseApplication) {
    this.server = app
    this.start(app)
  }

  private start(app: any) {
    debug(`** Initialise ${COURSE_API_PATH} path handler **`)
    this.server = app
    this.initResourceRoutes()
<<<<<<< HEAD
    setInterval(() => {
      if (this.courseInfo.nextPoint.position) {
        this.emitCourseInfo()
      }
    }, DELTA_INTERVAL)
  }

  private updateAllowed(): boolean {
    return this.server.securityStrategy.shouldAllowPut(
      this.server,
      'vessels.self',
      null,
      'navigation.course'
    )
=======
>>>>>>> init courseApi
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

<<<<<<< HEAD
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
=======
    // restart / arrivalCircle
    this.server.put(
      `${COURSE_API_PATH}/:action`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/:action`)
        if (req.params.restart) {
          // set previousPoint to vessel position
>>>>>>> init courseApi
          const position: any = this.server.getSelfPath('navigation.position')
          if (position && position.value) {
            this.courseInfo.previousPoint.position = position.value
            this.emitCourseInfo()
<<<<<<< HEAD
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
=======
            res.status(200).send(`Course restarted.`)
          } else {
            res.status(406).send(`Vessel position unavailable!`)
          }
        }
        if (req.params.arrivalCircle) {
          if (this.setArrivalCircle(req.params.arrivalCircle)) {
            this.emitCourseInfo()
            res.status(200).send(`Destination set successfully.`)
          } else {
            res.status(406).send(`Invalid Data`)
          }
>>>>>>> init courseApi
        }
      }
    )

    // set destination
    this.server.put(
      `${COURSE_API_PATH}/destination`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/destination`)
<<<<<<< HEAD
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
=======

>>>>>>> init courseApi
        if (!req.body.value) {
          res.status(406).send(`Invalid Data`)
          return
        }
        const result = await this.setDestination(req.body.value)
        if (result) {
          this.emitCourseInfo()
<<<<<<< HEAD
          res.status(200).send('OK')
=======
          res.status(200).send(`Destination set successfully.`)
>>>>>>> init courseApi
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
<<<<<<< HEAD
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
=======
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).send(`Destination cleared.`)
      }
    )

    // set / clear activeRoute
>>>>>>> init courseApi
    this.server.put(
      `${COURSE_API_PATH}/activeRoute`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/activeRoute`)
<<<<<<< HEAD
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
        const result = await this.activateRoute(req.body.value)
        if (result) {
          this.emitCourseInfo()
          res.status(200).send('OK')
=======

        const result = await this.activateRoute(req.body.value)
        if (result) {
          this.emitCourseInfo()
          res.status(200).send(`Active route set.`)
>>>>>>> init courseApi
        } else {
          this.clearDestination()
          this.emitCourseInfo()
          res.status(406).send(`Invalid Data`)
        }
      }
    )
<<<<<<< HEAD

    // clear activeRoute /destination
=======
>>>>>>> init courseApi
    this.server.delete(
      `${COURSE_API_PATH}/activeRoute`,
      async (req: Request, res: Response) => {
        debug(`** DELETE ${COURSE_API_PATH}/activeRoute`)
<<<<<<< HEAD
        if (!this.updateAllowed()) {
          res.status(403)
          return
        }
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).send('OK')
=======

        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).send(`Active route cleared.`)
>>>>>>> init courseApi
      }
    )

    this.server.put(
      `${COURSE_API_PATH}/activeRoute/:action`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/activeRoute`)
<<<<<<< HEAD
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
        // fetch active route data
=======

>>>>>>> init courseApi
        if (!this.courseInfo.activeRoute.href) {
          res.status(406).send(`Invalid Data`)
          return
        }
<<<<<<< HEAD
=======

>>>>>>> init courseApi
        const rte = await this.getRoute(this.courseInfo.activeRoute.href)
        if (!rte) {
          res.status(406).send(`Invalid Data`)
          return
        }

<<<<<<< HEAD
        if (req.params.action === 'nextPoint') {
=======
        if (req.params.nextPoint) {
>>>>>>> init courseApi
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
<<<<<<< HEAD
            return
          }
        }
        if (req.params.action === 'pointIndex') {
=======
          }
        }
        if (req.params.pointIndex) {
>>>>>>> init courseApi
          if (typeof req.body.value === 'number') {
            this.courseInfo.activeRoute.pointIndex = this.parsePointIndex(
              req.body.value,
              rte
            )
          } else {
            res.status(406).send(`Invalid Data`)
<<<<<<< HEAD
            return
          }
        }

        // set new destination
        this.courseInfo.nextPoint.position = this.getRoutePoint(
          rte,
          this.courseInfo.activeRoute.pointIndex,
          this.courseInfo.activeRoute.reverse
=======
          }
        }

        // set nextPoint
        this.courseInfo.nextPoint.position = this.getRoutePoint(
          rte,
          this.courseInfo.activeRoute.pointIndex
>>>>>>> init courseApi
        )
        this.courseInfo.nextPoint.type = `RoutePoint`
        this.courseInfo.nextPoint.href = null

        // set previousPoint
        if (this.courseInfo.activeRoute.pointIndex === 0) {
<<<<<<< HEAD
          try {
            const position: any = this.server.getSelfPath('navigation.position')
            if (position && position.value) {
              this.courseInfo.previousPoint.position = position.value
              this.courseInfo.previousPoint.type = `VesselPosition`
            } else {
              res.status(406).send(`Invalid Data`)
              return false
            }
          } catch (err) {
            res.status(406).send(`Invalid Data`)
=======
          const position: any = this.server.getSelfPath('navigation.position')
          if (position && position.value) {
            this.courseInfo.previousPoint.position = position.value
            this.courseInfo.previousPoint.type = `VesselPosition`
          } else {
>>>>>>> init courseApi
            return false
          }
        } else {
          this.courseInfo.previousPoint.position = this.getRoutePoint(
            rte,
<<<<<<< HEAD
            this.courseInfo.activeRoute.pointIndex - 1,
            this.courseInfo.activeRoute.reverse
=======
            this.courseInfo.activeRoute.pointIndex - 1
>>>>>>> init courseApi
          )
          this.courseInfo.previousPoint.type = `RoutePoint`
        }
        this.courseInfo.previousPoint.href = null
<<<<<<< HEAD
        res.status(200).send('OK')
=======

        res.status(200).send(`OK`)
>>>>>>> init courseApi
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

<<<<<<< HEAD
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
        const position: any = this.server.getSelfPath('navigation.position')
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
      newCourse.href = dest.href
      const href = this.parseHref(dest.href)
      if (href) {
        // fetch waypoint resource details
=======
    // set activeroute
    this.courseInfo.activeRoute.href = route.href

    if (typeof route.arrivalCircle === 'number') {
      this.setArrivalCircle(route.arrivalCircle)
    }

    this.courseInfo.activeRoute.reverse =
      typeof route.reverse === 'boolean' ? route.reverse : false

    this.courseInfo.activeRoute.pointIndex =
      typeof route.pointIndex === 'number'
        ? this.parsePointIndex(route.pointIndex, rte)
        : 0

    this.courseInfo.activeRoute.startTime = new Date().toISOString()

    // set nextPoint
    this.courseInfo.nextPoint.position = this.getRoutePoint(
      rte,
      this.courseInfo.activeRoute.pointIndex
    )
    this.courseInfo.nextPoint.type = `RoutePoint`
    this.courseInfo.nextPoint.href = null

    // set previousPoint
    if (this.courseInfo.activeRoute.pointIndex === 0) {
      const position: any = this.server.getSelfPath('navigation.position')
      if (position && position.value) {
        this.courseInfo.previousPoint.position = position.value
        this.courseInfo.previousPoint.type = `VesselPosition`
      } else {
        return false
      }
    } else {
      this.courseInfo.previousPoint.position = this.getRoutePoint(
        rte,
        this.courseInfo.activeRoute.pointIndex - 1
      )
      this.courseInfo.previousPoint.type = `RoutePoint`
    }
    this.courseInfo.previousPoint.href = null

    return true
  }

  private async setDestination(dest: Destination): Promise<boolean> {
    // set nextPoint
    if (typeof dest.arrivalCircle === 'number') {
      this.setArrivalCircle(dest.arrivalCircle)
    }

    this.courseInfo.nextPoint.type =
      typeof dest.type !== 'undefined' ? dest.type : null

    if (dest.href) {
      this.courseInfo.nextPoint.href = dest.href
      const href = this.parseHref(dest.href)
      if (href) {
>>>>>>> init courseApi
        try {
          const r = await this.server.resourcesApi.getResource(
            href.type,
            href.id
          )
<<<<<<< HEAD
          if (r.position && typeof r.position?.latitude !== 'undefined') {
            newCourse.nextPoint.position = r.position
          } else {
            return false
=======
          if (r.position && typeof r.position.value?.latitude !== 'undefined') {
            this.courseInfo.nextPoint.position = r.position.value
>>>>>>> init courseApi
          }
        } catch (err) {
          return false
        }
      }
    } else if (dest.position) {
<<<<<<< HEAD
      newCourse.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        newCourse.nextPoint.position = dest.position
=======
      this.courseInfo.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        this.courseInfo.nextPoint.position = dest.position
>>>>>>> init courseApi
      } else {
        return false
      }
    } else {
      return false
    }

    // set previousPoint
<<<<<<< HEAD
    try {
      const position: any = this.server.getSelfPath('navigation.position')
      if (position && position.value) {
        newCourse.previousPoint.position = position.value
        newCourse.previousPoint.type = `VesselPosition`
      } else {
        return false
      }
      newCourse.previousPoint.href = null
    } catch (err) {
      return false
    }

    this.courseInfo = newCourse
=======
    const position: any = this.server.getSelfPath('navigation.position')
    if (position && position.value) {
      this.courseInfo.previousPoint.position = position.value
      this.courseInfo.previousPoint.type = `VesselPosition`
    } else {
      return false
    }
    this.courseInfo.previousPoint.href = null

>>>>>>> init courseApi
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

<<<<<<< HEAD
  private isValidArrivalCircle(value: number): boolean {
    return typeof value === 'number' && value >= 0
  }

  private parsePointIndex(index: number, rte: any): number {
    if (typeof index !== 'number' || !rte) {
=======
  private setArrivalCircle(value: any): boolean {
    if (typeof value === 'number' && value >= 0) {
      this.courseInfo.nextPoint.arrivalCircle = value
      return true
    } else {
      return false
    }
  }

  private parsePointIndex(index: number, rte: any): number {
    if (!rte) {
>>>>>>> init courseApi
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
<<<<<<< HEAD
    if (!href) {
      return undefined
    }

    const ref: string[] = href.split('/').slice(-3)
=======
    if (href.length === 0) {
      return undefined
    }
    if (href[0] === '/') {
      href = href.slice(1)
    }
    const ref: string[] = href.split('/')
>>>>>>> init courseApi
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

<<<<<<< HEAD
  private getRoutePoint(rte: any, index: number, reverse: boolean) {
    const pos = reverse
=======
  private getRoutePoint(rte: any, index: number) {
    const pos = this.courseInfo.activeRoute.reverse
>>>>>>> init courseApi
      ? rte.feature.geometry.coordinates[
          rte.feature.geometry.coordinates.length - (index + 1)
        ]
      : rte.feature.geometry.coordinates[index]
    return {
      latitude: pos[1],
      longitude: pos[0],
<<<<<<< HEAD
      altitude: pos.length === 3 ? pos[2] : 0
=======
      altitude: pos.length == 3 ? pos[2] : 0
>>>>>>> init courseApi
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
<<<<<<< HEAD
    const values: Array<{ path: string; value: any }> = []
    const navPath = [
=======
    let values: Array<{path:string, value:any}> = []
    let root = [
>>>>>>> init courseApi
      'navigation.courseGreatCircle',
      'navigation.courseRhumbline'
    ]

    values.push({
<<<<<<< HEAD
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
=======
      path: `${root[0]}.activeRoute.href`,
      value: this.courseInfo.activeRoute.href
    })
    values.push({
      path: `${root[1]}.activeRoute.href`,
      value: this.courseInfo.activeRoute.href
    })
    values.push({
      path: `${root[0]}.activeRoute.startTime`,
      value: this.courseInfo.activeRoute.startTime
    })
    values.push({
      path: `${root[1]}.activeRoute.startTime`,
      value: this.courseInfo.activeRoute.startTime
    })
    values.push({
      path: `${root[0]}.nextPoint.href`,
      value: this.courseInfo.nextPoint.href
    })
    values.push({
      path: `${root[1]}.nextPoint.href`,
      value: this.courseInfo.nextPoint.href
    })
    values.push({
      path: `${root[0]}.nextPoint.position`,
      value: this.courseInfo.nextPoint.position
    })
    values.push({
      path: `${root[1]}.nextPoint.position`,
      value: this.courseInfo.nextPoint.position
    })
    values.push({
      path: `${root[0]}.nextPoint.type`,
      value: this.courseInfo.nextPoint.type
    })
    values.push({
      path: `${root[1]}.nextPoint.type`,
      value: this.courseInfo.nextPoint.type
    })
    values.push({
      path: `${root[0]}.nextPoint.arrivalCircle`,
      value: this.courseInfo.nextPoint.arrivalCircle
    })
    values.push({
      path: `${root[1]}.nextPoint.arrivalCircle`,
      value: this.courseInfo.nextPoint.arrivalCircle
    })
    values.push({
      path: `${root[0]}.previousPoint.href`,
      value: this.courseInfo.previousPoint.href
    })
    values.push({
      path: `${root[1]}.previousPoint.href`,
      value: this.courseInfo.previousPoint.href
    })
    values.push({
      path: `${root[0]}.previousPoint.position`,
      value: this.courseInfo.previousPoint.position
    })
    values.push({
      path: `${root[1]}.previousPoint.position`,
      value: this.courseInfo.previousPoint.position
    })
    values.push({
      path: `${root[0]}.previousPoint.type`,
      value: this.courseInfo.previousPoint.type
    })
    values.push({
      path: `${root[1]}.previousPoint.type`,
>>>>>>> init courseApi
      value: this.courseInfo.previousPoint.type
    })

    return {
      updates: [
        {
<<<<<<< HEAD
          values
=======
          values: values
>>>>>>> init courseApi
        }
      ]
    }
  }

  private emitCourseInfo() {
    this.server.handleMessage('courseApi', this.buildDeltaMsg())
  }
}
