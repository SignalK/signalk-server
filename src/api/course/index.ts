import Debug from 'debug'
import { Application, Request, Response } from 'express'

const debug = Debug('signalk:courseApi')

const SIGNALK_API_PATH: string = `/signalk/v1/api`
const COURSE_API_PATH: string = `${SIGNALK_API_PATH}/vessels/self/navigation/course`

interface CourseApplication extends Application {
  handleMessage: (id: string, data: any) => void
  getSelfPath: (path: string) => any
  securityStrategy: {
    shouldAllowPut: (
      req: Application,
      context: string,
      source: any,
      path: string
    ) => boolean
  }
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

  constructor(app: CourseApplication) {
    this.server = app
    this.start(app)
  }

  private start(app: any) {
    debug(`** Initialise ${COURSE_API_PATH} path handler **`)
    this.server = app
    this.initResourceRoutes()
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
          res.status(403)
          return
        }
        if (!this.courseInfo.nextPoint.position) {
          res.status(406).send(`No active destination!`)
          return
        }
        // set previousPoint to vessel position
        try {
          const position: any = this.server.getSelfPath('navigation.position')
          if (position && position.value) {
            this.courseInfo.previousPoint.position = position.value
            this.emitCourseInfo()
            res.status(200)
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
          res.status(403)
          return
        }
        if (this.isValidArrivalCircle(req.body.value)) {
          this.courseInfo.nextPoint.arrivalCircle = req.body.value
          this.emitCourseInfo()
          res.status(200)
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
          res.status(403)
          return
        }
        if (!req.body.value) {
          res.status(406).send(`Invalid Data`)
          return
        }
        const result = await this.setDestination(req.body.value)
        if (result) {
          this.emitCourseInfo()
          res.status(200)
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
          res.status(403)
          return
        }
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200)
      }
    )

    // set activeRoute
    this.server.put(
      `${COURSE_API_PATH}/activeRoute`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/activeRoute`)
        if (!this.updateAllowed()) {
          res.status(403)
          return
        }
        const result = await this.activateRoute(req.body.value)
        if (result) {
          this.emitCourseInfo()
          res.status(200)
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
        res.status(200)
      }
    )

    this.server.put(
      `${COURSE_API_PATH}/activeRoute/:action`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/activeRoute`)
        if (!this.updateAllowed()) {
          res.status(403)
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
          this.courseInfo.previousPoint.position = this.getRoutePoint(
            rte,
            this.courseInfo.activeRoute.pointIndex - 1,
            this.courseInfo.activeRoute.reverse
          )
          this.courseInfo.previousPoint.type = `RoutePoint`
        }
        this.courseInfo.previousPoint.href = null

        res.status(200)
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

    const newDest: any = {}
    Object.assign(newDest, this.courseInfo)

    // set activeroute
    newDest.activeRoute.href = route.href

    if (this.isValidArrivalCircle(route.arrivalCircle as number)) {
      newDest.nextPoint.arrivalCircle = route.arrivalCircle
    }

    newDest.activeRoute.startTime = new Date().toISOString()

    if (typeof route.reverse === 'boolean') {
      newDest.activeRoute.reverse = route.reverse
    }

    newDest.activeRoute.pointIndex = this.parsePointIndex(
      route.pointIndex as number,
      rte
    )

    // set nextPoint
    newDest.nextPoint.position = this.getRoutePoint(
      rte,
      newDest.activeRoute.pointIndex,
      newDest.activeRoute.reverse
    )
    newDest.nextPoint.type = `RoutePoint`
    newDest.nextPoint.href = null

    // set previousPoint
    if (newDest.activeRoute.pointIndex === 0) {
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
      newDest.previousPoint.position = this.getRoutePoint(
        rte,
        newDest.activeRoute.pointIndex - 1,
        newDest.activeRoute.reverse
      )
      newDest.previousPoint.type = `RoutePoint`
    }
    newDest.previousPoint.href = null

    this.courseInfo = newDest
    return true
  }

  private async setDestination(dest: any): Promise<boolean> {
    const newDest: any = {}
    Object.assign(newDest, this.courseInfo)

    // set nextPoint
    if (this.isValidArrivalCircle(dest.arrivalCircle)) {
      newDest.nextPoint.arrivalCircle = dest.arrivalCircle
    }

    newDest.nextPoint.type = typeof dest.type !== 'undefined' ? dest.type : null

    if (dest.href) {
      newDest.href = dest.href
      const href = this.parseHref(dest.href)
      if (href) {
        // fetch waypoint resource details
        try {
          const r = await this.server.resourcesApi.getResource(
            href.type,
            href.id
          )
          if (r.position && typeof r.position?.latitude !== 'undefined') {
            newDest.nextPoint.position = r.position
          } else {
            return false
          }
        } catch (err) {
          return false
        }
      }
    } else if (dest.position) {
      newDest.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        newDest.nextPoint.position = dest.position
      } else {
        return false
      }
    } else {
      return false
    }

    // set previousPoint
    try {
      const position: any = this.server.getSelfPath('navigation.position')
      if (position && position.value) {
        newDest.previousPoint.position = position.value
        newDest.previousPoint.type = `VesselPosition`
      } else {
        return false
      }
      newDest.previousPoint.href = null
    } catch (err) {
      return false
    }

    this.courseInfo = newDest
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

  private emitCourseInfo() {
    this.server.handleMessage('courseApi', this.buildDeltaMsg())
  }
}
