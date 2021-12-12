<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
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
=======
import Debug from 'debug'
import { Application, Request, Response } from 'express'
>>>>>>> update detlas
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
=======
import Debug from 'debug'
import { Application, Request, Response } from 'express'
>>>>>>> update detlas
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
=======
import Debug from 'debug'
import { Application, Request, Response } from 'express'
>>>>>>> update detlas
=======

=======
>>>>>>> init courseApi
import {
  ResourceProvider,
  ResourceProviderMethods,
  SignalKResourceType
} from '@signalk/server-api'
import Debug from 'debug'
import { Application, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
<<<<<<< HEAD
>>>>>>> init courseApi
=======
import Debug from 'debug'
import { Application, Request, Response } from 'express'
>>>>>>> update detlas
=======
>>>>>>> init courseApi
=======
import Debug from 'debug'
import { Application, Request, Response } from 'express'
>>>>>>> update detlas
=======

=======
>>>>>>> init courseApi
import {
  ResourceProvider,
  ResourceProviderMethods,
  SignalKResourceType
} from '@signalk/server-api'
import Debug from 'debug'
import { Application, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
<<<<<<< HEAD
>>>>>>> init courseApi
=======
import Debug from 'debug'
import { Application, Request, Response } from 'express'
>>>>>>> update detlas
=======
>>>>>>> init courseApi
=======
import Debug from 'debug'
import { Application, Request, Response } from 'express'
>>>>>>> update detlas
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
=======
import Debug from 'debug'
import { Application, Request, Response } from 'express'
>>>>>>> update detlas

const debug = Debug('signalk:courseApi')

const SIGNALK_API_PATH: string = `/signalk/v1/api`
const COURSE_API_PATH: string = `${SIGNALK_API_PATH}/vessels/self/navigation/course`
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD

const DELTA_INTERVAL: number = 30000
=======
const UUID_PREFIX: string = 'urn:mrn:signalk:uuid:'

const API_METHODS: string[] = []
>>>>>>> init courseApi
=======
>>>>>>> update detlas
=======
const UUID_PREFIX: string = 'urn:mrn:signalk:uuid:'
>>>>>>> init courseApi

const API_METHODS: string[] = []
=======
>>>>>>> update detlas

const DELTA_INTERVAL: number = 30000
=======
const UUID_PREFIX: string = 'urn:mrn:signalk:uuid:'

const API_METHODS: string[] = []
>>>>>>> init courseApi
=======
>>>>>>> update detlas

const DELTA_INTERVAL: number = 30000
=======
const UUID_PREFIX: string = 'urn:mrn:signalk:uuid:'

const API_METHODS: string[] = []
>>>>>>> init courseApi
=======
>>>>>>> update detlas

const DELTA_INTERVAL: number = 30000

interface CourseApplication extends Application {
  handleMessage: (id: string, data: any) => void
  getSelfPath: (path: string) => any
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  securityStrategy: {
    shouldAllowPut: (
      req: Application,
<<<<<<< HEAD
=======
  securityStrategy: {
    shouldAllowPut: (
<<<<<<< HEAD
      req: any,
>>>>>>> enable put processing
=======
      req: Application,
>>>>>>> chore: lint
=======
  securityStrategy: {
    shouldAllowPut: (
<<<<<<< HEAD
      req: any,
>>>>>>> enable put processing
=======
      req: Application,
>>>>>>> chore: lint
=======
  securityStrategy: {
    shouldAllowPut: (
      req: any,
>>>>>>> enable put processing
=======
>>>>>>> chore: lint
=======
  securityStrategy: {
    shouldAllowPut: (
<<<<<<< HEAD
      req: any,
>>>>>>> enable put processing
=======
      req: Application,
>>>>>>> chore: lint
      context: string,
      source: any,
      path: string
    ) => boolean
  }
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> init courseApi
=======
  registerPutHandler: (context:string, path:string, cb:any) => any
>>>>>>> update detlas
=======

>>>>>>> init courseApi
=======
  registerPutHandler: (context:string, path:string, cb:any) => any
>>>>>>> update detlas
=======
>>>>>>> enable put processing
=======
>>>>>>> init courseApi
=======
  registerPutHandler: (context:string, path:string, cb:any) => any
>>>>>>> update detlas
=======

>>>>>>> init courseApi
=======
  registerPutHandler: (context:string, path:string, cb:any) => any
>>>>>>> update detlas
=======
>>>>>>> enable put processing
=======
>>>>>>> init courseApi
=======
  registerPutHandler: (context:string, path:string, cb:any) => any
>>>>>>> update detlas
=======

>>>>>>> init courseApi
=======
  registerPutHandler: (context:string, path:string, cb:any) => any
>>>>>>> update detlas
=======
>>>>>>> enable put processing
=======
>>>>>>> init courseApi
=======
  registerPutHandler: (context:string, path:string, cb:any) => any
>>>>>>> update detlas
=======

>>>>>>> init courseApi
=======
  registerPutHandler: (context:string, path:string, cb:any) => any
>>>>>>> update detlas
=======
>>>>>>> enable put processing
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======

>>>>>>> init courseApi
=======
>>>>>>> update detlas
=======

>>>>>>> init courseApi
=======
>>>>>>> update detlas
=======

>>>>>>> init courseApi
=======
>>>>>>> update detlas
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
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
=======
    setInterval( ()=> {
      if(this.courseInfo.nextPoint.position) {
=======
    setInterval(() => {
      if (this.courseInfo.nextPoint.position) {
>>>>>>> chore: lint
=======
    setInterval(() => {
      if (this.courseInfo.nextPoint.position) {
>>>>>>> chore: lint
        this.emitCourseInfo()
      }
    }, DELTA_INTERVAL)
>>>>>>> add 30sec delta interval
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
=======
=======
>>>>>>> add 30sec delta interval
    setInterval( ()=> {
      if(this.courseInfo.nextPoint.position) {
=======
    setInterval(() => {
      if (this.courseInfo.nextPoint.position) {
>>>>>>> chore: lint
        this.emitCourseInfo()
      }
    }, DELTA_INTERVAL)
<<<<<<< HEAD
>>>>>>> add 30sec delta interval
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
=======
>>>>>>> add 30sec delta interval
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
=======
    setInterval( ()=> {
      if(this.courseInfo.nextPoint.position) {
=======
    setInterval(() => {
      if (this.courseInfo.nextPoint.position) {
>>>>>>> chore: lint
        this.emitCourseInfo()
      }
    }, DELTA_INTERVAL)
>>>>>>> add 30sec delta interval
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

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> enable put processing
=======
=======
=======
>>>>>>> update detlas
=======
>>>>>>> update detlas
=======
>>>>>>> update detlas
=======
>>>>>>> update detlas
=======
>>>>>>> update detlas
    // 
    if(this.server.registerPutHandler) {
      debug('** Registering PUT Action Handler(s) **')    
      this.server.registerPutHandler(
          'vessels.self',
          'navigation.course.*',
          this.handleCourseApiPut
      ); 
    }

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> update detlas
=======
>>>>>>> init courseApi
=======
>>>>>>> update detlas
    // restart / arrivalCircle
>>>>>>> init courseApi
=======
=======
>>>>>>> enable put processing
=======
>>>>>>> enable put processing
    this.server.put(
      `${COURSE_API_PATH}/restart`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/restart`)
        if (!this.updateAllowed()) {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
          res.status(403).send('Unauthorised')
=======
          res.status(403)
>>>>>>> enable put processing
=======
          res.status(403)
>>>>>>> enable put processing
          return
        }
        if (!this.courseInfo.nextPoint.position) {
          res.status(406).send(`No active destination!`)
          return
        }
        // set previousPoint to vessel position
<<<<<<< HEAD
<<<<<<< HEAD
        try {
          const position: any = this.server.getSelfPath('navigation.position')
          if (position && position.value) {
            this.courseInfo.previousPoint.position = position.value
            this.emitCourseInfo()
            res.status(200).send('OK')
          }
        } catch (err) {
=======
=======
>>>>>>> enable put processing
        const position: any = this.server.getSelfPath('navigation.position')
        if (position && position.value) {
          this.courseInfo.previousPoint.position = position.value
          this.emitCourseInfo()
          res.status(200)
        } else {
<<<<<<< HEAD
>>>>>>> enable put processing
=======
>>>>>>> enable put processing
          res.status(406).send(`Vessel position unavailable!`)
        }
      }
    )
<<<<<<< HEAD
<<<<<<< HEAD

>>>>>>> enable put processing
    this.server.put(
      `${COURSE_API_PATH}/arrivalCircle`,
      async (req: Request, res: Response) => {
<<<<<<< HEAD
<<<<<<< HEAD
        debug(`** PUT ${COURSE_API_PATH}/restart`)
        if (!this.updateAllowed()) {
<<<<<<< HEAD
<<<<<<< HEAD
          res.status(403).send('Unauthorised')
=======
          res.status(403)
>>>>>>> enable put processing
=======
          res.status(403).send('Unauthorised')
>>>>>>> add 30sec delta interval
=======
          res.status(403).send('Unauthorised')
>>>>>>> add 30sec delta interval
=======
          res.status(403).send('Unauthorised')
>>>>>>> add 30sec delta interval
          return
        }
        if (!this.courseInfo.nextPoint.position) {
          res.status(406).send(`No active destination!`)
          return
        }
        // set previousPoint to vessel position
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        try {
=======
=======
=======
>>>>>>> update detlas
    // 
    if(this.server.registerPutHandler) {
      debug('** Registering PUT Action Handler(s) **')    
      this.server.registerPutHandler(
          'vessels.self',
          'navigation.course.*',
          this.handleCourseApiPut
      ); 
    }

<<<<<<< HEAD
>>>>>>> update detlas
=======
>>>>>>> init courseApi
=======
>>>>>>> update detlas
    // restart / arrivalCircle
=======
        const position: any = this.server.getSelfPath('navigation.position')
        if (position && position.value) {
          this.courseInfo.previousPoint.position = position.value
          this.emitCourseInfo()
          res.status(200)
        } else {
=======
=======
>>>>>>> chore: lint
=======
>>>>>>> chore: lint
        try {
          const position: any = this.server.getSelfPath('navigation.position')
          if (position && position.value) {
            this.courseInfo.previousPoint.position = position.value
            this.emitCourseInfo()
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
            res.status(200).send('OK')
          }
        } catch (err) {
>>>>>>> chore: lint
=======
            res.status(200)
=======
            res.status(200).send('OK')
>>>>>>> add 30sec delta interval
=======
            res.status(200).send('OK')
>>>>>>> add 30sec delta interval
          }
        } catch (err) {
>>>>>>> chore: lint
=======
            res.status(200)
          }
        } catch (err) {
>>>>>>> chore: lint
          res.status(406).send(`Vessel position unavailable!`)
        }
      }
    )

>>>>>>> enable put processing
    this.server.put(
      `${COURSE_API_PATH}/arrivalCircle`,
      async (req: Request, res: Response) => {
<<<<<<< HEAD
        debug(`** PUT ${COURSE_API_PATH}/:action`)
        if (req.params.restart) {
          //test for active destination
          if (!this.courseInfo.nextPoint.position) {
            return
          }
          // set previousPoint to vessel position
>>>>>>> init courseApi
=======
        debug(`** PUT ${COURSE_API_PATH}/:action`)
        if (req.params.restart) {
          //test for active destination
          if (!this.courseInfo.nextPoint.position) {
            return
          }
          // set previousPoint to vessel position
>>>>>>> init courseApi
=======
=======
>>>>>>> update detlas
=======
>>>>>>> init courseApi
=======
>>>>>>> update detlas
    // restart / arrivalCircle
=======

>>>>>>> enable put processing
    this.server.put(
      `${COURSE_API_PATH}/arrivalCircle`,
      async (req: Request, res: Response) => {
<<<<<<< HEAD
        debug(`** PUT ${COURSE_API_PATH}/:action`)
        if (req.params.restart) {
          //test for active destination
          if (!this.courseInfo.nextPoint.position) {
            return
          }
          // set previousPoint to vessel position
>>>>>>> init courseApi
=======
=======
>>>>>>> update detlas
=======
>>>>>>> init courseApi
=======
>>>>>>> update detlas
    // restart / arrivalCircle
=======

>>>>>>> enable put processing
    this.server.put(
      `${COURSE_API_PATH}/arrivalCircle`,
      async (req: Request, res: Response) => {
<<<<<<< HEAD
        debug(`** PUT ${COURSE_API_PATH}/:action`)
        if (req.params.restart) {
          //test for active destination
          if (!this.courseInfo.nextPoint.position) {
            return
          }
          // set previousPoint to vessel position
>>>>>>> init courseApi
          const position: any = this.server.getSelfPath('navigation.position')
          if (position && position.value) {
            this.courseInfo.previousPoint.position = position.value
            this.emitCourseInfo()
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
            res.status(200).send('OK')
=======
            res.status(200).send(`Course restarted.`)
          } else {
            res.status(406).send(`Vessel position unavailable!`)
>>>>>>> init courseApi
          }
        }
<<<<<<< HEAD
        if (this.isValidArrivalCircle(req.body.value)) {
          this.courseInfo.nextPoint.arrivalCircle = req.body.value
          this.emitCourseInfo()
          res.status(200).send('OK')
        } else {
          res.status(406).send(`Invalid Data`)
=======
=======
>>>>>>> init courseApi
=======
>>>>>>> init courseApi
            res.status(200).send(`Course restarted.`)
          } else {
            res.status(406).send(`Vessel position unavailable!`)
          }
        }
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> init courseApi
=======
>>>>>>> init courseApi
=======
>>>>>>> init courseApi
        if (req.params.arrivalCircle) {
          if (this.setArrivalCircle(req.params.arrivalCircle)) {
            this.emitCourseInfo()
            res.status(200).send(`Destination set successfully.`)
          } else {
            res.status(406).send(`Invalid Data`)
          }
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> init courseApi
=======
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
>>>>>>> enable put processing
=======
>>>>>>> init courseApi
=======
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
>>>>>>> enable put processing
=======
>>>>>>> init courseApi
=======
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
>>>>>>> enable put processing
=======
>>>>>>> init courseApi
=======
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
>>>>>>> enable put processing
        }
      }
    )

    // set destination
    this.server.put(
      `${COURSE_API_PATH}/destination`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/destination`)
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
=======

>>>>>>> init courseApi
=======
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
>>>>>>> enable put processing
=======
>>>>>>> init courseApi
=======
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
>>>>>>> enable put processing
=======

>>>>>>> init courseApi
=======
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
>>>>>>> enable put processing
=======

>>>>>>> init courseApi
=======
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
>>>>>>> enable put processing
        if (!req.body.value) {
          res.status(406).send(`Invalid Data`)
          return
        }
        const result = await this.setDestination(req.body.value)
        if (result) {
          this.emitCourseInfo()
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
          res.status(200).send('OK')
=======
          res.status(200).send(`Destination set successfully.`)
>>>>>>> init courseApi
=======
          res.status(200)
>>>>>>> enable put processing
=======
          res.status(200).send('OK')
>>>>>>> add 30sec delta interval
=======
          res.status(200).send(`Destination set successfully.`)
>>>>>>> init courseApi
=======
          res.status(200)
>>>>>>> enable put processing
=======
          res.status(200).send('OK')
>>>>>>> add 30sec delta interval
=======
          res.status(200).send(`Destination set successfully.`)
>>>>>>> init courseApi
=======
          res.status(200)
>>>>>>> enable put processing
=======
          res.status(200).send('OK')
>>>>>>> add 30sec delta interval
=======
          res.status(200).send(`Destination set successfully.`)
>>>>>>> init courseApi
=======
          res.status(200)
>>>>>>> enable put processing
=======
          res.status(200).send('OK')
>>>>>>> add 30sec delta interval
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
=======
>>>>>>> init courseApi
=======
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
>>>>>>> enable put processing
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).send('OK')
      }
    )

<<<<<<< HEAD
<<<<<<< HEAD
    // set activeRoute
=======
=======
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
<<<<<<< HEAD
>>>>>>> enable put processing
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).send('OK')
=======
        const result = await this.activateRoute(req.body.value)
        if (result) {
          this.emitCourseInfo()
          res.status(200).send('OK')
        } else {
          this.clearDestination()
          this.emitCourseInfo()
          res.status(406).send(`Invalid Data`)
        }
>>>>>>> add 30sec delta interval
      }
    )

<<<<<<< HEAD
    // set / clear activeRoute
>>>>>>> init courseApi
=======
    // set activeRoute
>>>>>>> enable put processing
=======
    // set / clear activeRoute
>>>>>>> init courseApi
=======
    // set activeRoute
>>>>>>> enable put processing
=======
=======
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
>>>>>>> enable put processing
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).send('OK')
      }
    )

<<<<<<< HEAD
    // set / clear activeRoute
>>>>>>> init courseApi
=======
    // set activeRoute
>>>>>>> enable put processing
=======
=======
        if (!this.updateAllowed()) {
          res.status(403)
          return
        }
>>>>>>> enable put processing
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200)
      }
    )

<<<<<<< HEAD
    // set / clear activeRoute
>>>>>>> init courseApi
=======
    // set activeRoute
>>>>>>> enable put processing
    this.server.put(
      `${COURSE_API_PATH}/activeRoute`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/activeRoute`)
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
<<<<<<< HEAD
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
=======
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
=======
        // fetch active route data
        if (!this.courseInfo.activeRoute.href) {
          res.status(406).send(`Invalid Data`)
>>>>>>> chore: lint
          return
        }
        const result = await this.activateRoute(req.body.value)
        if (result) {
          this.emitCourseInfo()
<<<<<<< HEAD
          res.status(200)
>>>>>>> enable put processing
=======
          res.status(200).send('OK')
>>>>>>> add 30sec delta interval
=======
=======
>>>>>>> init courseApi
=======
>>>>>>> init courseApi

        const result = await this.activateRoute(req.body.value)
        if (result) {
          this.emitCourseInfo()
          res.status(200).send(`Active route set.`)
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> init courseApi
=======
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
        const result = await this.activateRoute(req.body.value)
        if (result) {
          this.emitCourseInfo()
<<<<<<< HEAD
          res.status(200)
>>>>>>> enable put processing
=======
          res.status(200).send('OK')
>>>>>>> add 30sec delta interval
=======
>>>>>>> init courseApi
=======
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
        const result = await this.activateRoute(req.body.value)
        if (result) {
          this.emitCourseInfo()
<<<<<<< HEAD
          res.status(200)
>>>>>>> enable put processing
=======
          res.status(200).send('OK')
>>>>>>> add 30sec delta interval
=======
>>>>>>> init courseApi
=======
        if (!this.updateAllowed()) {
          res.status(403)
          return
        }
        const result = await this.activateRoute(req.body.value)
        if (result) {
          this.emitCourseInfo()
          res.status(200)
>>>>>>> enable put processing
        } else {
          this.clearDestination()
          this.emitCourseInfo()
          res.status(406).send(`Invalid Data`)
        }
      }
    )
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD

    // clear activeRoute /destination
=======
>>>>>>> init courseApi
=======

    // clear activeRoute /destination
>>>>>>> enable put processing
=======
>>>>>>> init courseApi
=======

    // clear activeRoute /destination
>>>>>>> enable put processing
=======
>>>>>>> init courseApi
=======

    // clear activeRoute /destination
>>>>>>> enable put processing
=======
>>>>>>> init courseApi
=======

    // clear activeRoute /destination
>>>>>>> enable put processing
    this.server.delete(
      `${COURSE_API_PATH}/activeRoute`,
      async (req: Request, res: Response) => {
        debug(`** DELETE ${COURSE_API_PATH}/activeRoute`)
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> enable put processing
=======
>>>>>>> enable put processing
=======
>>>>>>> enable put processing
=======
>>>>>>> enable put processing
        if (!this.updateAllowed()) {
          res.status(403)
          return
        }
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).send('OK')
=======

        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).send(`Active route cleared.`)
>>>>>>> init courseApi
=======
        this.clearDestination()
        this.emitCourseInfo()
<<<<<<< HEAD
        res.status(200)
>>>>>>> enable put processing
=======
        res.status(200).send('OK')
>>>>>>> add 30sec delta interval
=======
=======
>>>>>>> init courseApi
=======
>>>>>>> init courseApi

        this.clearDestination()
        this.emitCourseInfo()
        res.status(200).send(`Active route cleared.`)
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> init courseApi
=======
        this.clearDestination()
        this.emitCourseInfo()
<<<<<<< HEAD
<<<<<<< HEAD
        res.status(200)
>>>>>>> enable put processing
=======
        res.status(200).send('OK')
>>>>>>> add 30sec delta interval
=======
>>>>>>> init courseApi
=======
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200)
>>>>>>> enable put processing
=======
        res.status(200).send('OK')
>>>>>>> add 30sec delta interval
=======
>>>>>>> init courseApi
=======
        this.clearDestination()
        this.emitCourseInfo()
        res.status(200)
>>>>>>> enable put processing
      }
    )

    this.server.put(
      `${COURSE_API_PATH}/activeRoute/:action`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${COURSE_API_PATH}/activeRoute`)
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
        // fetch active route data
=======

>>>>>>> init courseApi
=======
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
<<<<<<< HEAD
        // fetch route data
>>>>>>> enable put processing
=======
        // fetch active route data
>>>>>>> chore: lint
=======
>>>>>>> init courseApi
=======
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
<<<<<<< HEAD
        // fetch route data
>>>>>>> enable put processing
=======
        // fetch active route data
>>>>>>> chore: lint
=======

>>>>>>> init courseApi
=======
=======
>>>>>>> enable put processing
        if (!this.updateAllowed()) {
          res.status(403).send('Unauthorised')
          return
        }
<<<<<<< HEAD
<<<<<<< HEAD
        // fetch route data
>>>>>>> enable put processing
=======
        // fetch active route data
>>>>>>> chore: lint
=======

>>>>>>> init courseApi
=======
        // fetch route data
>>>>>>> enable put processing
        if (!this.courseInfo.activeRoute.href) {
          res.status(406).send(`Invalid Data`)
          return
        }
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======

>>>>>>> init courseApi
=======
>>>>>>> enable put processing
=======

>>>>>>> init courseApi
=======
>>>>>>> enable put processing
=======

>>>>>>> init courseApi
=======
>>>>>>> enable put processing
        const rte = await this.getRoute(this.courseInfo.activeRoute.href)
        if (!rte) {
          res.status(406).send(`Invalid Data`)
          return
        }

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        if (req.params.action === 'nextPoint') {
=======
        if (req.params.nextPoint) {
>>>>>>> init courseApi
=======
        if (req.params.action === 'nextPoint') {
>>>>>>> enable put processing
=======
        if (req.params.nextPoint) {
>>>>>>> init courseApi
=======
        if (req.params.action === 'nextPoint') {
>>>>>>> enable put processing
=======
        if (req.params.nextPoint) {
>>>>>>> init courseApi
=======
        if (req.params.action === 'nextPoint') {
>>>>>>> enable put processing
=======
        if (req.params.nextPoint) {
>>>>>>> init courseApi
=======
        if (req.params.action === 'nextPoint') {
>>>>>>> enable put processing
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> add 30sec delta interval
=======
>>>>>>> add 30sec delta interval
            return
          }
        }
        if (req.params.action === 'pointIndex') {
=======
          }
        }
<<<<<<< HEAD
<<<<<<< HEAD
        if (req.params.pointIndex) {
>>>>>>> init courseApi
=======
        if (req.params.action === 'pointIndex') {
>>>>>>> enable put processing
=======
          }
        }
<<<<<<< HEAD
        if (req.params.pointIndex) {
>>>>>>> init courseApi
=======
        if (req.params.action === 'pointIndex') {
>>>>>>> enable put processing
=======
=======
            return
>>>>>>> add 30sec delta interval
=======
            return
>>>>>>> add 30sec delta interval
          }
        }
<<<<<<< HEAD
        if (req.params.pointIndex) {
>>>>>>> init courseApi
=======
        if (req.params.action === 'pointIndex') {
>>>>>>> enable put processing
=======
          }
        }
        if (req.params.pointIndex) {
>>>>>>> init courseApi
=======
        if (req.params.action === 'pointIndex') {
>>>>>>> enable put processing
          if (typeof req.body.value === 'number') {
            this.courseInfo.activeRoute.pointIndex = this.parsePointIndex(
              req.body.value,
              rte
            )
          } else {
            res.status(406).send(`Invalid Data`)
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> add 30sec delta interval
            return
=======
>>>>>>> init courseApi
=======
            return
>>>>>>> add 30sec delta interval
          }
        }

        // set new destination
        this.courseInfo.nextPoint.position = this.getRoutePoint(
          rte,
<<<<<<< HEAD
<<<<<<< HEAD
          this.courseInfo.activeRoute.pointIndex,
          this.courseInfo.activeRoute.reverse
=======
=======
            return
>>>>>>> add 30sec delta interval
          }
        }

        // set new destination
        this.courseInfo.nextPoint.position = this.getRoutePoint(
          rte,
<<<<<<< HEAD
<<<<<<< HEAD
          this.courseInfo.activeRoute.pointIndex
>>>>>>> init courseApi
=======
          this.courseInfo.activeRoute.pointIndex,
          this.courseInfo.activeRoute.reverse
>>>>>>> chore: lint
=======
          this.courseInfo.activeRoute.pointIndex
>>>>>>> init courseApi
=======
          this.courseInfo.activeRoute.pointIndex,
          this.courseInfo.activeRoute.reverse
>>>>>>> chore: lint
=======
          }
        }

        // set new destination
        this.courseInfo.nextPoint.position = this.getRoutePoint(
          rte,
<<<<<<< HEAD
          this.courseInfo.activeRoute.pointIndex
>>>>>>> init courseApi
=======
=======
            return
>>>>>>> add 30sec delta interval
          }
        }

        // set new destination
        this.courseInfo.nextPoint.position = this.getRoutePoint(
          rte,
          this.courseInfo.activeRoute.pointIndex
>>>>>>> init courseApi
=======
          this.courseInfo.activeRoute.pointIndex,
          this.courseInfo.activeRoute.reverse
>>>>>>> chore: lint
        )
        this.courseInfo.nextPoint.type = `RoutePoint`
        this.courseInfo.nextPoint.href = null

        // set previousPoint
        if (this.courseInfo.activeRoute.pointIndex === 0) {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> chore: lint
=======
>>>>>>> chore: lint
=======
>>>>>>> chore: lint
          try {
            const position: any = this.server.getSelfPath('navigation.position')
            if (position && position.value) {
              this.courseInfo.previousPoint.position = position.value
              this.courseInfo.previousPoint.type = `VesselPosition`
            } else {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
              res.status(406).send(`Invalid Data`)
              return false
            }
          } catch (err) {
            res.status(406).send(`Invalid Data`)
=======
=======
>>>>>>> init courseApi
=======
>>>>>>> init courseApi
=======
>>>>>>> init courseApi
          const position: any = this.server.getSelfPath('navigation.position')
          if (position && position.value) {
            this.courseInfo.previousPoint.position = position.value
            this.courseInfo.previousPoint.type = `VesselPosition`
          } else {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> init courseApi
=======
              return false
            }
          } catch (err) {
>>>>>>> chore: lint
=======
=======
>>>>>>> add 30sec delta interval
              res.status(406).send(`Invalid Data`)
              return false
            }
          } catch (err) {
            res.status(406).send(`Invalid Data`)
<<<<<<< HEAD
>>>>>>> add 30sec delta interval
=======
>>>>>>> init courseApi
=======
              return false
            }
          } catch (err) {
>>>>>>> chore: lint
=======
>>>>>>> add 30sec delta interval
=======
>>>>>>> init courseApi
=======
              res.status(406).send(`Invalid Data`)
              return false
            }
          } catch (err) {
            res.status(406).send(`Invalid Data`)
>>>>>>> add 30sec delta interval
=======
>>>>>>> init courseApi
=======
              return false
            }
          } catch (err) {
>>>>>>> chore: lint
=======
              res.status(406).send(`Invalid Data`)
              return false
            }
          } catch (err) {
            res.status(406).send(`Invalid Data`)
>>>>>>> add 30sec delta interval
            return false
          }
        } else {
          this.courseInfo.previousPoint.position = this.getRoutePoint(
            rte,
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
            this.courseInfo.activeRoute.pointIndex - 1,
            this.courseInfo.activeRoute.reverse
=======
            this.courseInfo.activeRoute.pointIndex - 1
>>>>>>> init courseApi
=======
            this.courseInfo.activeRoute.pointIndex - 1,
            this.courseInfo.activeRoute.reverse
>>>>>>> chore: lint
=======
            this.courseInfo.activeRoute.pointIndex - 1
>>>>>>> init courseApi
=======
            this.courseInfo.activeRoute.pointIndex - 1,
            this.courseInfo.activeRoute.reverse
>>>>>>> chore: lint
=======
            this.courseInfo.activeRoute.pointIndex - 1
>>>>>>> init courseApi
=======
            this.courseInfo.activeRoute.pointIndex - 1
>>>>>>> init courseApi
=======
            this.courseInfo.activeRoute.pointIndex - 1,
            this.courseInfo.activeRoute.reverse
>>>>>>> chore: lint
          )
          this.courseInfo.previousPoint.type = `RoutePoint`
        }
        this.courseInfo.previousPoint.href = null
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        res.status(200).send('OK')
=======

<<<<<<< HEAD
<<<<<<< HEAD
        res.status(200).send(`OK`)
>>>>>>> init courseApi
=======
        res.status(200)
>>>>>>> enable put processing
=======
        res.status(200).send('OK')
>>>>>>> add 30sec delta interval
=======

<<<<<<< HEAD
        res.status(200).send(`OK`)
>>>>>>> init courseApi
=======
        res.status(200)
>>>>>>> enable put processing
=======
        res.status(200).send('OK')
>>>>>>> add 30sec delta interval
=======

        res.status(200).send(`OK`)
>>>>>>> init courseApi
=======
        res.status(200)
>>>>>>> enable put processing
=======
        res.status(200).send('OK')
>>>>>>> add 30sec delta interval
=======

<<<<<<< HEAD
        res.status(200).send(`OK`)
>>>>>>> init courseApi
=======
        res.status(200)
>>>>>>> enable put processing
=======
        res.status(200).send('OK')
>>>>>>> add 30sec delta interval
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
    const newCourse: any = {}
    Object.assign(newCourse, this.courseInfo)

=======
>>>>>>> init courseApi
=======
    const newDest: any = {}
    Object.assign(newDest, this.courseInfo)
=======
    const newCourse: any = {}
    Object.assign(newCourse, this.courseInfo)
>>>>>>> add 30sec delta interval
=======
    const newCourse: any = {}
    Object.assign(newCourse, this.courseInfo)
>>>>>>> add 30sec delta interval
=======
    const newCourse: any = {}
    Object.assign(newCourse, this.courseInfo)
>>>>>>> add 30sec delta interval

>>>>>>> chore: lint
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

<<<<<<< HEAD
<<<<<<< HEAD
    newCourse.nextPoint.type =
      typeof dest.type !== 'undefined' ? dest.type : null
=======
    newCourse.nextPoint.type = typeof dest.type !== 'undefined' ? dest.type : null
>>>>>>> add 30sec delta interval
=======
    newCourse.nextPoint.type =
      typeof dest.type !== 'undefined' ? dest.type : null
>>>>>>> chore: lint

    if (dest.href) {
      newCourse.href = dest.href
      const href = this.parseHref(dest.href)
      if (href) {
<<<<<<< HEAD
<<<<<<< HEAD
        // fetch waypoint resource details
<<<<<<< HEAD
=======
=======
    const newDest: any = {}
    Object.assign(newDest, this.courseInfo)
=======
    const newCourse: any = {}
    Object.assign(newCourse, this.courseInfo)
>>>>>>> add 30sec delta interval
=======
        try {
          const r = await this.server.resourcesApi.getResource(
            href.type,
            href.id
          )
          if (r.position && typeof r.position?.latitude !== 'undefined') {
            newCourse.nextPoint.position = r.position
          } else {
            return false
          }
        } catch (err) {
          return false
        }
      }
    } else if (dest.position) {
      newCourse.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        newCourse.nextPoint.position = dest.position
      } else {
        return false
      }
    } else {
      return false
    }
>>>>>>> add 30sec delta interval

>>>>>>> chore: lint
    // set activeroute
    newCourse.activeRoute.href = route.href

    if (this.isValidArrivalCircle(route.arrivalCircle as number)) {
      newCourse.nextPoint.arrivalCircle = route.arrivalCircle
    }
=======
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
>>>>>>> chore: lint

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

<<<<<<< HEAD
    if (dest.href) {
      newCourse.href = dest.href
      const href = this.parseHref(dest.href)
      if (href) {
<<<<<<< HEAD
>>>>>>> init courseApi
=======
        // fetch waypoint resource details
>>>>>>> chore: lint
=======
>>>>>>> init courseApi
=======
        // fetch waypoint resource details
>>>>>>> chore: lint
=======
=======
    const newDest: any = {}
    Object.assign(newDest, this.courseInfo)

>>>>>>> chore: lint
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
<<<<<<< HEAD
>>>>>>> init courseApi
=======
        // fetch waypoint resource details
>>>>>>> chore: lint
=======
=======
    const newDest: any = {}
    Object.assign(newDest, this.courseInfo)

>>>>>>> chore: lint
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
<<<<<<< HEAD
>>>>>>> init courseApi
=======
        // fetch waypoint resource details
>>>>>>> chore: lint
        try {
          const r = await this.server.resourcesApi.getResource(
            href.type,
            href.id
          )
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
          if (r.position && typeof r.position?.latitude !== 'undefined') {
            newCourse.nextPoint.position = r.position
          } else {
            return false
=======
          if (r.position && typeof r.position.value?.latitude !== 'undefined') {
            this.courseInfo.nextPoint.position = r.position.value
>>>>>>> init courseApi
=======
          if (r.position && typeof r.position?.latitude !== 'undefined') {
            newCourse.nextPoint.position = r.position
          } else {
            return false
>>>>>>> chore: lint
=======
          if (r.position && typeof r.position.value?.latitude !== 'undefined') {
            this.courseInfo.nextPoint.position = r.position.value
>>>>>>> init courseApi
=======
          if (r.position && typeof r.position?.latitude !== 'undefined') {
            newCourse.nextPoint.position = r.position
          } else {
            return false
>>>>>>> chore: lint
=======
          if (r.position && typeof r.position.value?.latitude !== 'undefined') {
            this.courseInfo.nextPoint.position = r.position.value
>>>>>>> init courseApi
=======
          if (r.position && typeof r.position?.latitude !== 'undefined') {
            newCourse.nextPoint.position = r.position
          } else {
            return false
>>>>>>> chore: lint
=======
          if (r.position && typeof r.position.value?.latitude !== 'undefined') {
            this.courseInfo.nextPoint.position = r.position.value
>>>>>>> init courseApi
=======
          if (r.position && typeof r.position?.latitude !== 'undefined') {
            newDest.nextPoint.position = r.position
          } else {
            return false
>>>>>>> chore: lint
          }
        } catch (err) {
          return false
        }
      }
    } else if (dest.position) {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      newCourse.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        newCourse.nextPoint.position = dest.position
=======
      this.courseInfo.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        this.courseInfo.nextPoint.position = dest.position
>>>>>>> init courseApi
=======
      newDest.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        newDest.nextPoint.position = dest.position
>>>>>>> chore: lint
=======
      newCourse.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        newCourse.nextPoint.position = dest.position
>>>>>>> add 30sec delta interval
=======
      this.courseInfo.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        this.courseInfo.nextPoint.position = dest.position
>>>>>>> init courseApi
=======
      newDest.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        newDest.nextPoint.position = dest.position
>>>>>>> chore: lint
=======
      newCourse.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        newCourse.nextPoint.position = dest.position
>>>>>>> add 30sec delta interval
=======
      this.courseInfo.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        this.courseInfo.nextPoint.position = dest.position
>>>>>>> init courseApi
=======
      newDest.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        newDest.nextPoint.position = dest.position
>>>>>>> chore: lint
=======
      newCourse.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        newCourse.nextPoint.position = dest.position
>>>>>>> add 30sec delta interval
=======
      this.courseInfo.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        this.courseInfo.nextPoint.position = dest.position
>>>>>>> init courseApi
=======
      newDest.nextPoint.href = null
      if (typeof dest.position.latitude !== 'undefined') {
        newDest.nextPoint.position = dest.position
>>>>>>> chore: lint
      } else {
        return false
      }
    } else {
      return false
    }

    // set previousPoint
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
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
=======
>>>>>>> init courseApi
=======
>>>>>>> init courseApi
=======
>>>>>>> init courseApi
    const position: any = this.server.getSelfPath('navigation.position')
    if (position && position.value) {
      this.courseInfo.previousPoint.position = position.value
      this.courseInfo.previousPoint.type = `VesselPosition`
    } else {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
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
>>>>>>> chore: lint
=======
>>>>>>> init courseApi
=======
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
>>>>>>> chore: lint
      return false
    }

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> init courseApi
=======
    this.courseInfo = newDest
>>>>>>> chore: lint
=======
    this.courseInfo = newCourse
>>>>>>> add 30sec delta interval
=======
>>>>>>> init courseApi
=======
    this.courseInfo = newDest
>>>>>>> chore: lint
=======
    this.courseInfo = newCourse
>>>>>>> add 30sec delta interval
=======
=======
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
>>>>>>> chore: lint
      return false
    }

<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> init courseApi
=======
    this.courseInfo = newDest
>>>>>>> chore: lint
=======
    this.courseInfo = newCourse
>>>>>>> add 30sec delta interval
=======
=======
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
>>>>>>> chore: lint
      return false
    }

<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> init courseApi
=======
    this.courseInfo = newDest
>>>>>>> chore: lint
=======
    this.courseInfo = newCourse
>>>>>>> add 30sec delta interval
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  private isValidArrivalCircle(value: number): boolean {
    return typeof value === 'number' && value >= 0
  }

  private parsePointIndex(index: number, rte: any): number {
    if (typeof index !== 'number' || !rte) {
=======
=======
>>>>>>> init courseApi
=======
>>>>>>> init courseApi
=======
>>>>>>> init courseApi
  private setArrivalCircle(value: any): boolean {
    if (typeof value === 'number' && value >= 0) {
      this.courseInfo.nextPoint.arrivalCircle = value
      return true
    } else {
      return false
    }
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  }

  private parsePointIndex(index: number, rte: any): number {
    if (!rte) {
>>>>>>> init courseApi
=======
  private isValidArrivalCircle(value: number): boolean {
    return typeof value === 'number' && value >= 0
  }

  private parsePointIndex(index: number, rte: any): number {
    if (typeof index !== 'number' || !rte) {
>>>>>>> chore: lint
=======
=======
>>>>>>> init courseApi
=======
>>>>>>> init courseApi
  }

  private parsePointIndex(index: number, rte: any): number {
    if (!rte) {
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> init courseApi
=======
  private isValidArrivalCircle(value: number): boolean {
    return typeof value === 'number' && value >= 0
  }

  private parsePointIndex(index: number, rte: any): number {
    if (typeof index !== 'number' || !rte) {
>>>>>>> chore: lint
=======
>>>>>>> init courseApi
=======
  private isValidArrivalCircle(value: number): boolean {
    return typeof value === 'number' && value >= 0
  }

  private parsePointIndex(index: number, rte: any): number {
    if (typeof index !== 'number' || !rte) {
>>>>>>> chore: lint
=======
>>>>>>> init courseApi
=======
  private isValidArrivalCircle(value: number): boolean {
    return typeof value === 'number' && value >= 0
  }

  private parsePointIndex(index: number, rte: any): number {
    if (typeof index !== 'number' || !rte) {
>>>>>>> chore: lint
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
    if (!href) {
      return undefined
    }

    const ref: string[] = href.split('/').slice(-3)
=======
    if (href.length === 0) {
      return undefined
    }
=======
    if (href.length === 0) {
      return undefined
    }
>>>>>>> init courseApi
=======
    if (href.length === 0) {
      return undefined
    }
>>>>>>> init courseApi
=======
    if (href.length === 0) {
      return undefined
    }
>>>>>>> init courseApi
    if (href[0] === '/') {
      href = href.slice(1)
    }
    const ref: string[] = href.split('/')
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> init courseApi
=======
    if (!href) {
      return undefined
    }

    const ref: string[] = href.split('/').slice(-3)
>>>>>>> chore: lint
=======
>>>>>>> init courseApi
=======
    if (!href) {
      return undefined
    }

    const ref: string[] = href.split('/').slice(-3)
>>>>>>> chore: lint
=======
>>>>>>> init courseApi
=======
    if (!href) {
      return undefined
    }

    const ref: string[] = href.split('/').slice(-3)
>>>>>>> chore: lint
=======
>>>>>>> init courseApi
=======
    if (!href) {
      return undefined
    }

    const ref: string[] = href.split('/').slice(-3)
>>>>>>> chore: lint
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  private getRoutePoint(rte: any, index: number, reverse: boolean) {
    const pos = reverse
=======
  private getRoutePoint(rte: any, index: number) {
    const pos = this.courseInfo.activeRoute.reverse
>>>>>>> init courseApi
=======
  private getRoutePoint(rte: any, index: number, reverse: boolean) {
    const pos = reverse
>>>>>>> chore: lint
=======
  private getRoutePoint(rte: any, index: number) {
    const pos = this.courseInfo.activeRoute.reverse
>>>>>>> init courseApi
=======
  private getRoutePoint(rte: any, index: number, reverse: boolean) {
    const pos = reverse
>>>>>>> chore: lint
=======
  private getRoutePoint(rte: any, index: number) {
    const pos = this.courseInfo.activeRoute.reverse
>>>>>>> init courseApi
=======
  private getRoutePoint(rte: any, index: number, reverse: boolean) {
    const pos = reverse
>>>>>>> chore: lint
=======
  private getRoutePoint(rte: any, index: number) {
    const pos = this.courseInfo.activeRoute.reverse
>>>>>>> init courseApi
=======
  private getRoutePoint(rte: any, index: number, reverse: boolean) {
    const pos = reverse
>>>>>>> chore: lint
      ? rte.feature.geometry.coordinates[
          rte.feature.geometry.coordinates.length - (index + 1)
        ]
      : rte.feature.geometry.coordinates[index]
    return {
      latitude: pos[1],
      longitude: pos[0],
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      altitude: pos.length === 3 ? pos[2] : 0
=======
      altitude: pos.length == 3 ? pos[2] : 0
>>>>>>> init courseApi
=======
      altitude: pos.length === 3 ? pos[2] : 0
>>>>>>> chore: lint
=======
      altitude: pos.length == 3 ? pos[2] : 0
>>>>>>> init courseApi
=======
      altitude: pos.length === 3 ? pos[2] : 0
>>>>>>> chore: lint
=======
      altitude: pos.length == 3 ? pos[2] : 0
>>>>>>> init courseApi
=======
      altitude: pos.length === 3 ? pos[2] : 0
>>>>>>> chore: lint
=======
      altitude: pos.length == 3 ? pos[2] : 0
>>>>>>> init courseApi
=======
      altitude: pos.length === 3 ? pos[2] : 0
>>>>>>> chore: lint
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
    const values: Array<{ path: string; value: any }> = []
    const navPath = [
=======
    let values: Array<{path:string, value:any}> = []
    let root = [
>>>>>>> init courseApi
=======
    const values: Array<{ path: string; value: any }> = []
    const navPath = [
>>>>>>> chore: lint
=======
    let values: Array<{path:string, value:any}> = []
    let root = [
>>>>>>> init courseApi
=======
    const values: Array<{ path: string; value: any }> = []
    const navPath = [
>>>>>>> chore: lint
=======
    let values: Array<{path:string, value:any}> = []
    let root = [
>>>>>>> init courseApi
=======
    const values: Array<{ path: string; value: any }> = []
    const navPath = [
>>>>>>> chore: lint
=======
    let values: Array<{path:string, value:any}> = []
    let root = [
>>>>>>> init courseApi
=======
    const values: Array<{ path: string; value: any }> = []
    const navPath = [
>>>>>>> chore: lint
      'navigation.courseGreatCircle',
      'navigation.courseRhumbline'
    ]

    values.push({
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> update detlas
=======
>>>>>>> update detlas
=======
>>>>>>> update detlas
=======
>>>>>>> update detlas
      path: `navigation.course`,
      value: this.courseInfo
    })

    values.push({
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      path: `${navPath[0]}.activeRoute.href`,
=======
=======
>>>>>>> update detlas
      path: `${root[0]}.activeRoute.href`,
>>>>>>> init courseApi
=======
      path: `${navPath[0]}.activeRoute.href`,
>>>>>>> chore: lint
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
<<<<<<< HEAD
<<<<<<< HEAD
      path: `${navPath[1]}.previousPoint.type`,
=======
=======
>>>>>>> update detlas
      path: `${root[0]}.activeRoute.href`,
=======
      path: `${navPath[0]}.activeRoute.href`,
>>>>>>> chore: lint
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
<<<<<<< HEAD
      path: `${root[1]}.previousPoint.type`,
>>>>>>> init courseApi
=======
      path: `${navPath[1]}.previousPoint.type`,
>>>>>>> chore: lint
=======
      path: `${root[1]}.previousPoint.type`,
>>>>>>> init courseApi
=======
      path: `${navPath[1]}.previousPoint.type`,
>>>>>>> chore: lint
=======
=======
>>>>>>> update detlas
      path: `${root[0]}.activeRoute.href`,
=======
      path: `${navPath[0]}.activeRoute.href`,
>>>>>>> chore: lint
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
<<<<<<< HEAD
      path: `${root[1]}.previousPoint.type`,
>>>>>>> init courseApi
=======
      path: `${navPath[1]}.previousPoint.type`,
>>>>>>> chore: lint
=======
=======
>>>>>>> update detlas
      path: `${root[0]}.activeRoute.href`,
=======
      path: `${navPath[0]}.activeRoute.href`,
>>>>>>> chore: lint
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
<<<<<<< HEAD
      path: `${root[1]}.previousPoint.type`,
>>>>>>> init courseApi
=======
      path: `${navPath[1]}.previousPoint.type`,
>>>>>>> chore: lint
      value: this.courseInfo.previousPoint.type
    })

    return {
      updates: [
        {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
          values
=======
          values: values
>>>>>>> init courseApi
=======
          values
>>>>>>> chore: lint
=======
          values: values
>>>>>>> init courseApi
=======
          values
>>>>>>> chore: lint
=======
          values: values
>>>>>>> init courseApi
=======
          values
>>>>>>> chore: lint
=======
          values: values
>>>>>>> init courseApi
=======
          values
>>>>>>> chore: lint
        }
      ]
    }
  }

  private emitCourseInfo() {
    this.server.handleMessage('courseApi', this.buildDeltaMsg())
  }
}
