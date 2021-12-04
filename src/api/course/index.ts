import Debug from 'debug'
import { Application, Request, Response } from 'express'

const debug = Debug('signalk:courseApi')

const SIGNALK_API_PATH: string = `/signalk/v1/api`
const COURSE_API_PATH: string = `${SIGNALK_API_PATH}/vessels/self/navigation/course`

interface CourseApplication extends Application {
  handleMessage: (id: string, data: any) => void
  getSelfPath: (path: string) => any
  registerPutHandler: (context:string, path:string, cb:any) => any
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

  private initResourceRoutes() {
    // return current course information
    this.server.get(
      `${COURSE_API_PATH}`,
      async (req: Request, res: Response) => {
        debug(`** GET ${COURSE_API_PATH}`)
        res.json(this.courseInfo)
      }
    )

    // 
    if(this.server.registerPutHandler) {
      debug('** Registering PUT Action Handler(s) **')    
      this.server.registerPutHandler(
          'vessels.self',
          'navigation.course.*',
          this.handleCourseApiPut
      ); 
    }

    // restart / arrivalCircle
    this.server.put(
      `${COURSE_API_PATH}/:action`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/:action`)
        if (req.params.restart) {
          //test for active destination
          if (!this.courseInfo.nextPoint.position) {
            return
          }
          // set previousPoint to vessel position
          const position: any = this.server.getSelfPath('navigation.position')
          if (position && position.value) {
            this.courseInfo.previousPoint.position = position.value
            this.emitCourseInfo()
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
        }
      }
    )

    // set destination
    this.server.put(
      `${COURSE_API_PATH}/destination`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/destination`)
        if (!req.body.value) {
          res.status(406).send(`Invalid Data`)
          return
        }
        const result = await this.setDestination(req.body.value)
        if (result) {
          this.emitCourseInfo()
          res.status(200).send(`Destination set successfully.`)
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
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).send(`Destination cleared.`)
      }
    )

    // set / clear activeRoute
    this.server.put(
      `${COURSE_API_PATH}/activeRoute`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/activeRoute`)

        const result = await this.activateRoute(req.body.value)
        if (result) {
          this.emitCourseInfo()
          res.status(200).send(`Active route set.`)
        } else {
          this.clearDestination()
          this.emitCourseInfo()
          res.status(406).send(`Invalid Data`)
        }
      }
    )
    this.server.delete(
      `${COURSE_API_PATH}/activeRoute`,
      async (req: Request, res: Response) => {
        debug(`** DELETE ${COURSE_API_PATH}/activeRoute`)

        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).send(`Active route cleared.`)
      }
    )

    this.server.put(
      `${COURSE_API_PATH}/activeRoute/:action`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/activeRoute`)
        if (!this.courseInfo.activeRoute.href) {
          res.status(406).send(`Invalid Data`)
          return
        }
        const rte = await this.getRoute(this.courseInfo.activeRoute.href)
        if (!rte) {
          res.status(406).send(`Invalid Data`)
          return
        }

        if (req.params.nextPoint) {
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
        if (req.params.pointIndex) {
          if (typeof req.body.value === 'number') {
            this.courseInfo.activeRoute.pointIndex = this.parsePointIndex(
              req.body.value,
              rte
            )
          } else {
            res.status(406).send(`Invalid Data`)
          }
        }

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

        res.status(200).send(`OK`)
      }
    )
  }

  private handleCourseApiPut(context:string, path:string, value:any, cb:any) {

    debug('** PUT handler **')
    return undefined
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
        try {
          const r = await this.server.resourcesApi.getResource(
            href.type,
            href.id
          )
          if (r.position && typeof r.position.value?.latitude !== 'undefined') {
            this.courseInfo.nextPoint.position = r.position.value
          }
        } catch (err) {
          return false
        }
      }
    } else if (dest.position) {
      this.courseInfo.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        this.courseInfo.nextPoint.position = dest.position
      } else {
        return false
      }
    } else {
      return false
    }

    // set previousPoint
    const position: any = this.server.getSelfPath('navigation.position')
    if (position && position.value) {
      this.courseInfo.previousPoint.position = position.value
      this.courseInfo.previousPoint.type = `VesselPosition`
    } else {
      return false
    }
    this.courseInfo.previousPoint.href = null

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
    if (href.length === 0) {
      return undefined
    }
    if (href[0] === '/') {
      href = href.slice(1)
    }
    const ref: string[] = href.split('/')
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

  private getRoutePoint(rte: any, index: number) {
    const pos = this.courseInfo.activeRoute.reverse
      ? rte.feature.geometry.coordinates[
          rte.feature.geometry.coordinates.length - (index + 1)
        ]
      : rte.feature.geometry.coordinates[index]
    return {
      latitude: pos[1],
      longitude: pos[0],
      altitude: pos.length == 3 ? pos[2] : 0
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
    let values: Array<{path:string, value:any}> = []
    let root = [
      'navigation.courseGreatCircle',
      'navigation.courseRhumbline'
    ]

    values.push({
      path: `navigation.course`,
      value: this.courseInfo
    })

    values.push({
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
      value: this.courseInfo.previousPoint.type
    })

    return {
      updates: [
        {
          values: values
        }
      ]
    }
  }

  private emitCourseInfo() {
    this.server.handleMessage('courseApi', this.buildDeltaMsg())
  }
}
