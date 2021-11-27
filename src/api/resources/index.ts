import Debug from 'debug'
import { v4 as uuidv4 } from 'uuid'
import { buildResource } from './resources'
import { validate } from './validate'

import {
  ResourceProvider,
  ResourceProviderMethods,
  SignalKResourceType
} from '@signalk/server-api'
import { Application, Handler, NextFunction, Request, Response } from 'express'

const debug = Debug('signalk:resources')

const SIGNALK_API_PATH = `/signalk/v1/api`
const UUID_PREFIX = 'urn:mrn:signalk:uuid:'

const API_METHODS = [
  'setWaypoint',
  'deleteWaypoint',
  'setRoute',
  'deleteRoute',
  'setNote',
  'deleteNote',
  'setRegion',
  'deleteRegion'
]

interface ResourceApplication extends Application {
  handleMessage: (id: string, data: any) => void
}

export class Resources {
  private resProvider: { [key: string]: ResourceProviderMethods | null } = {}
  private server: ResourceApplication

  private signalkResTypes: SignalKResourceType[] = [
    'routes',
    'waypoints',
    'notes',
    'regions',
    'charts'
  ]

  constructor(app: ResourceApplication) {
    this.server = app
    this.start(app)
  }

  register(pluginId: string, provider: ResourceProvider) {
    debug(`** Registering provider(s)....${provider?.types}`)
    if (!provider) {
      return
    }
    if (provider.types && !Array.isArray(provider.types)) {
      return
    }
    provider.types.forEach((i: string) => {
      if (!this.resProvider[i]) {
        provider.methods.pluginId = pluginId
        this.resProvider[i] = provider.methods
      }
    })
    debug(this.resProvider)
  }

  unRegister(pluginId: string) {
    if (!pluginId) {
      return
    }
    debug(`** Un-registering ${pluginId} resource provider(s)....`)
    for (const resourceType in this.resProvider) {
      if (this.resProvider[resourceType]?.pluginId === pluginId) {
        debug(`** Un-registering ${resourceType}....`)
        delete this.resProvider[resourceType]
      }
    }
    debug(JSON.stringify(this.resProvider))
  }

  getResource(resType: SignalKResourceType, resId: string) {
    debug(`** getResource(${resType}, ${resId})`)
    if (!this.checkForProvider(resType)) {
      return Promise.reject(new Error(`No provider for ${resType}`))
    }
    return this.resProvider[resType]?.getResource(resType, resId)
  }

  private start(app: any) {
    debug(`** Initialise ${SIGNALK_API_PATH}/resources path handler **`)
    this.server = app
    this.initResourceRoutes()
  }

  private initResourceRoutes() {
    // list all serviced paths under resources
    this.server.get(
      `${SIGNALK_API_PATH}/resources`,
      (req: Request, res: Response) => {
        res.json(this.getResourcePaths())
      }
    )

    // facilitate retrieval of a specific resource
    this.server.get(
      `${SIGNALK_API_PATH}/resources/:resourceType/:resourceId`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** GET ${SIGNALK_API_PATH}/resources/:resourceType/:resourceId`)
        if (
          !this.checkForProvider(req.params.resourceType as SignalKResourceType)
        ) {
          debug('** No provider found... calling next()...')
          next()
          return
        }
        try {
          const retVal = await this.resProvider[
            req.params.resourceType
          ]?.getResource(req.params.resourceType, req.params.resourceId)
          res.json(retVal)
        } catch (err) {
          res.status(404).send(`Resource not found! (${req.params.resourceId})`)
        }
      }
    )

    // facilitate retrieval of a collection of resource entries
    this.server.get(
      `${SIGNALK_API_PATH}/resources/:resourceType`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** GET ${SIGNALK_API_PATH}/resources/:resourceType`)
        if (
          !this.checkForProvider(req.params.resourceType as SignalKResourceType)
        ) {
          debug('** No provider found... calling next()...')
          next()
          return
        }
        try {
          const retVal = await this.resProvider[
            req.params.resourceType
          ]?.listResources(req.params.resourceType, req.query)
          res.json(retVal)
        } catch (err) {
          res.status(404).send(`Error retrieving resources!`)
        }
      }
    )

    // facilitate creation of new resource entry of supplied type
    this.server.post(
      `${SIGNALK_API_PATH}/resources/:resourceType`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** POST ${SIGNALK_API_PATH}/resources/:resourceType`)
        if (
          !this.checkForProvider(req.params.resourceType as SignalKResourceType)
        ) {
          debug('** No provider found... calling next()...')
          next()
          return
        }

        if (
          this.signalkResTypes.includes(
            req.params.resourceType as SignalKResourceType
          )
        ) {
          if (!validate.resource(req.params.resourceType, req.body)) {
            res.status(406).send(`Invalid resource data supplied!`)
            return
          }
        }

        let id: string
        if (req.params.resourceType === 'charts') {
          id = req.body.identifier
        } else {
          id = UUID_PREFIX + uuidv4()
        }

        try {
          const retVal = await this.resProvider[
            req.params.resourceType
          ]?.setResource(req.params.resourceType, id, req.body)

          this.server.handleMessage(
            this.resProvider[req.params.resourceType]?.pluginId as string,
            this.buildDeltaMsg(
              req.params.resourceType as SignalKResourceType,
              id,
              req.body
            )
          )
          res
            .status(200)
            .send(`New ${req.params.resourceType} resource (${id}) saved.`)
        } catch (err) {
          res
            .status(404)
            .send(`Error saving ${req.params.resourceType} resource (${id})!`)
        }
      }
    )

<<<<<<< HEAD
    this.server.use(
<<<<<<< HEAD
=======
    // facilitate creation / update of resource entry at supplied id
    this.server.put(
>>>>>>> Use Express routing params for processing requests
      `${SIGNALK_API_PATH}/resources/:resourceType/:resourceId`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** PUT ${SIGNALK_API_PATH}/resources/:resourceType/:resourceId`)
        if (
          !this.checkForProvider(req.params.resourceType as SignalKResourceType)
        ) {
          debug('** No provider found... calling next()...')
          next()
          return
        }

        if (
          this.signalkResTypes.includes(
            req.params.resourceType as SignalKResourceType
          )
        ) {
          let isValidId: boolean
          if (req.params.resourceType === 'charts') {
            isValidId = validate.chartId(req.params.resourceId)
          } else {
            isValidId = validate.uuid(req.params.resourceId)
          }
          if (isValidId) {
            res
              .status(406)
              .send(`Invalid resource id provided (${req.params.resourceId})`)
            return
          }

          if (!validate.resource(req.params.resourceType, req.body)) {
            res.status(406).send(`Invalid resource data supplied!`)
            return
          }
        }

        try {
          const retVal = await this.resProvider[
            req.params.resourceType
          ]?.setResource(
            req.params.resourceType,
            req.params.resourceId,
            req.body
          )

          this.server.handleMessage(
            this.resProvider[req.params.resourceType]?.pluginId as string,
            this.buildDeltaMsg(
              req.params.resourceType as SignalKResourceType,
              req.params.resourceId,
              req.body
            )
          )
          res
            .status(200)
            .send(
              `${req.params.resourceType} resource (${req.params.resourceId}) saved.`
            )
        } catch (err) {
          res
            .status(404)
            .send(
              `Error saving ${req.params.resourceType} resource (${req.params.resourceId})!`
            )
        }
      }
    )

    // facilitate deletion of specific of resource entry at supplied id
    this.server.delete(
      `${SIGNALK_API_PATH}/resources/:resourceType/:resourceId`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(
          `** DELETE ${SIGNALK_API_PATH}/resources/:resourceType/:resourceId`
        )
        if (
          !this.checkForProvider(req.params.resourceType as SignalKResourceType)
        ) {
          debug('** No provider found... calling next()...')
          next()
          return
        }

        try {
          const retVal = await this.resProvider[
            req.params.resourceType
          ]?.deleteResource(req.params.resourceType, req.params.resourceId)

          this.server.handleMessage(
            this.resProvider[req.params.resourceType]?.pluginId as string,
            this.buildDeltaMsg(
              req.params.resourceType as SignalKResourceType,
              req.params.resourceId,
              null
            )
          )
          res.status(200).send(`Resource (${req.params.resourceId}) deleted.`)
        } catch (err) {
          res
            .status(400)
            .send(`Error deleting resource (${req.params.resourceId})!`)
        }
      }
    )

<<<<<<< HEAD
    this.server.use(
      `${SIGNALK_API_PATH}/resources/:resourceType`,
      async (req: any, res: any, next: any) => {
=======
      `${SIGNALK_API_PATH}/resources/*`,
      async (req: Request, res: Response, next: NextFunction) => {
>>>>>>> refactor: use Express types
        const result = this.parseResourceRequest(req)
        if (result) {
          const ar = await this.actionResourceRequest(result)
          if (typeof ar.statusCode !== 'undefined') {
            debug(`${JSON.stringify(ar)}`)
            res.status = ar.statusCode
            res.send(ar.message)
=======
    // facilitate API requests
    this.server.put(
      `${SIGNALK_API_PATH}/resources/:apiFunction`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** PUT ${SIGNALK_API_PATH}/resources/:apiFunction`)

        // check for valid API method request
        if (!API_METHODS.includes(req.params.apiFunction)) {
          res.status(501).send(`Invalid API method ${req.params.apiFunction}!`)
          return
        }
        let resType: SignalKResourceType = 'waypoints'
        if (req.params.apiFunction.toLowerCase().indexOf('waypoint') !== -1) {
          resType = 'waypoints'
        }
        if (req.params.apiFunction.toLowerCase().indexOf('route') !== -1) {
          resType = 'routes'
        }
        if (req.params.apiFunction.toLowerCase().indexOf('note') !== -1) {
          resType = 'notes'
        }
        if (req.params.apiFunction.toLowerCase().indexOf('region') !== -1) {
          resType = 'regions'
        }
        if (!this.checkForProvider(resType)) {
          res.status(501).send(`No provider for ${resType}!`)
          return
        }
        let resId: string = ''
        let resValue: any = null

        if (req.params.apiFunction.toLowerCase().indexOf('set') !== -1) {
          resValue = buildResource(resType, req.body)
          if (!resValue) {
            res.status(406).send(`Invalid resource data supplied!`)
            return
          }
          if (!req.body.id) {
            resId = UUID_PREFIX + uuidv4()
>>>>>>> Use Express routing params for processing requests
          } else {
            if (!validate.uuid(req.body.id)) {
              res.status(406).send(`Invalid resource id supplied!`)
              return
            }
            resId = req.body.id
          }
        }
        if (req.params.apiFunction.toLowerCase().indexOf('delete') !== -1) {
          resValue = null
          if (!req.body.id) {
            res.status(406).send(`No resource id supplied!`)
            return
          }
          if (!validate.uuid(req.body.id)) {
            res.status(406).send(`Invalid resource id supplied!`)
            return
          }
          resId = req.body.id
        }

        try {
          const retVal = await this.resProvider[resType]?.setResource(
            resType,
            resId,
            resValue
          )
          this.server.handleMessage(
            this.resProvider[resType]?.pluginId as string,
            this.buildDeltaMsg(resType, resId, resValue)
          )
          res.status(200).send(`SUCCESS: ${req.params.apiFunction} complete.`)
        } catch (err) {
          res.status(404).send(`ERROR: ${req.params.apiFunction} incomplete!`)
        }
      }
    )
  }

  private getResourcePaths(): { [key: string]: any } {
    const resPaths: { [key: string]: any } = {}
    for (const i in this.resProvider) {
      resPaths[i] = {
        description: `Path containing ${
          i.slice(-1) === 's' ? i.slice(0, i.length - 1) : i
        } resources`,
        $source: this.resProvider[i]?.pluginId
      }
    }
    return resPaths
  }

<<<<<<< HEAD
<<<<<<< HEAD
  private parseResourceRequest(req: any): ResourceRequest | undefined {
    debug('********* parse request *************')
=======
  // parse api path request and return ResourceRequest object
  private parseResourceRequest(req: Request): ResourceRequest | undefined {
    debug('** req.originalUrl:', req.originalUrl)
>>>>>>> refactor: use Express types
    debug('** req.method:', req.method)
    debug('** req.body:', req.body)
    debug('** req.query:', req.query)
    debug('** req.params:', req.params)

    const resReq:any = {
      method: req.method,
      body: req.body,
      query: req.query,
      resourceType: req.params.resourceType ?? null,
      resourceId: req.params.resourceId ?? null,
      apiMethod: API_METHODS.includes(req.params.resourceType) ? req.params.resourceType : null
    }

    if (resReq.apiMethod) {
      if (resReq.apiMethod.toLowerCase().indexOf('waypoint') !== -1) {
        resReq.resourceType = 'waypoints'
      }
      if (resReq.apiMethod.toLowerCase().indexOf('route') !== -1) {
        resReq.resourceType = 'routes'
      }
      if (resReq.apiMethod.toLowerCase().indexOf('note') !== -1) {
        resReq.resourceType = 'notes'
      }
      if (resReq.apiMethod.toLowerCase().indexOf('region') !== -1) {
        resReq.resourceType = 'regions'
      }
    } else {
      const resAttrib = req.params['0'] ? req.params['0'].split('/') : []
      req.query.attrib = resAttrib
    }

    debug('** resReq:', resReq)

    if (
      this.resourceTypes.includes(resReq.resourceType) && 
      this.resProvider[resReq.resourceType]
    ) {
      return resReq
    } else {
      debug('Invalid resource type or no provider for this type!')
      return undefined
    }
=======
  private checkForProvider(resType: SignalKResourceType): boolean {
<<<<<<< HEAD
    return this.resourceTypes.includes(resType) && this.resProvider[resType]
      ? true
      : false
>>>>>>> Use Express routing params for processing requests
=======
    debug(`** checkForProvider(${resType})`)
    debug(this.resProvider[resType])

    if (this.resProvider[resType]) {
      if (
        !this.resProvider[resType]?.listResources ||
        !this.resProvider[resType]?.getResource ||
        !this.resProvider[resType]?.setResource ||
        !this.resProvider[resType]?.deleteResource ||
        typeof this.resProvider[resType]?.listResources !== 'function' ||
        typeof this.resProvider[resType]?.getResource !== 'function' ||
        typeof this.resProvider[resType]?.setResource !== 'function' ||
        typeof this.resProvider[resType]?.deleteResource !== 'function'
      ) {
        return false
      } else {
        return true
      }
    } else {
      return false
    }
>>>>>>> allow registering  custom resource types
  }

  private buildDeltaMsg(
    resType: SignalKResourceType,
    resid: string,
    resValue: any
  ): any {
    return {
      updates: [
        {
          values: [
            {
              path: `resources.${resType}.${resid}`,
              value: resValue
            }
          ]
        }
      ]
    }
  }
}
