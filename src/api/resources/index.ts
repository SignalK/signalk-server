import Debug from 'debug'
import { v4 as uuidv4 } from 'uuid'
import { buildResource } from './resources'
import { validate } from './validate'

import { SignalKResourceType, ResourceProvider, ResourceProviderMethods } from '@signalk/server-api'
import { Application, Handler, NextFunction, Request, Response } from 'express'

const debug = Debug('signalk:resources')

interface ResourceRequest {
  method: 'GET' | 'PUT' | 'POST' | 'DELETE'
  body: any
  query: { [key: string]: any }
  resourceType: SignalKResourceType
  resourceId: string
  apiMethod?: string | null
}

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

// FIXME use types from https://github.com/SignalK/signalk-server/pull/1358
interface ResourceApplication extends Application {
  handleMessage: any
}
export class Resources {
  private resProvider: { [key: string]: ResourceProviderMethods | null } = {}
  private server: ResourceApplication

  // in-scope resource types
  private resourceTypes: SignalKResourceType[] = [
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

  getResource(type: SignalKResourceType, id: string) {
    debug(`** getResource(${type}, ${id})`)
    return this.actionResourceRequest({
      method: 'GET',
      body: {},
      query: {},
      resourceType: type,
      resourceId: id
    })
  }

  private start(app: any) {
    debug(`** Initialise ${SIGNALK_API_PATH}/resources path handler **`)
    this.server = app
    this.initResourceRoutes()
  }

  private initResourceRoutes() {
    // list all serviced paths under resources
    this.server.get(`${SIGNALK_API_PATH}/resources`, (req: Request, res: Response) => {
      res.json(this.getResourcePaths())
    })

    this.server.get(
      `${SIGNALK_API_PATH}/resources/:resourceType/:resourceId/*`,
      async (req: any, res: any, next: any) => {
        const result = this.parseResourceRequest(req)
        if (result) {
          const ar = await this.actionResourceRequest(result)
          if (typeof ar.statusCode !== 'undefined') {
            debug(`${JSON.stringify(ar)}`)
            res.status = ar.statusCode
            res.send(ar.message)
          } else {
            res.json(ar)
          }
        } else {
          debug('** No provider found... calling next()...')
          next()
        }
      }
    )

    this.server.use(
<<<<<<< HEAD
      `${SIGNALK_API_PATH}/resources/:resourceType/:resourceId`,
      async (req: any, res: any, next: any) => {
        const result = this.parseResourceRequest(req)
        if (result) {
          const ar = await this.actionResourceRequest(result)
          if (typeof ar.statusCode !== 'undefined') {
            debug(`${JSON.stringify(ar)}`)
            res.status = ar.statusCode
            res.send(ar.message)
          } else {
            res.json(ar)
          }
        } else {
          debug('** No provider found... calling next()...')
          next()
        }
      }
    )

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
          } else {
            res.json(ar)
          }
        } else {
          debug('** No provider found... calling next()...')
          next()
        }
      }
    )
  }

  private getResourcePaths(): { [key: string]: any } {
    const resPaths: { [key: string]: any } = {}
    Object.entries(this.resProvider).forEach((p: any) => {
      if (p[1]) {
        resPaths[p[0]] = `Path containing ${p[0]}, each named with a UUID`
      }
    })
    // check for other plugins servicing paths under ./resources
    this.server._router.stack.forEach((i: any) => {
      if (i.route && i.route.path && typeof i.route.path === 'string') {
        if (i.route.path.indexOf(`${SIGNALK_API_PATH}/resources`) !== -1) {
          const r = i.route.path.split('/')
          if (r.length > 5 && !(r[5] in resPaths)) {
            resPaths[
              r[5]
            ] = `Path containing ${r[5]} resources (provided by plug-in)`
          }
        }
      }
    })
    return resPaths
  }

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
  }

  private async actionResourceRequest(req: ResourceRequest): Promise<any> {
    debug('********* action request *************')
    debug(req)

    // check for registered resource providers
    if (!this.resProvider) {
      return { statusCode: 501, message: `No Provider` }
    }

    if (
      !this.resourceTypes.includes(req.resourceType) ||
      !this.resProvider[req.resourceType]
    ) {
      return { statusCode: 501, message: `No Provider` }
    }

    // check for API method request
    if (req.apiMethod && API_METHODS.includes(req.apiMethod)) {
      debug(`API Method (${req.apiMethod})`)
      req = this.transformApiRequest(req)
    }

    return await this.execResourceRequest(req)
  }

  private transformApiRequest(req: ResourceRequest): ResourceRequest {
    if (req.apiMethod?.indexOf('delete') !== -1) {
      req.method = 'DELETE'
    }
    if (req.apiMethod?.indexOf('set') !== -1) {
      if (!req.body.id) {
        req.method = 'POST'
      } else {
        req.resourceId = req.body.id
      }
      req.body = { value: buildResource(req.resourceType, req.body) ?? {} }
    }
    return req
  }

  private async execResourceRequest(req: ResourceRequest): Promise<any> {
    debug('********* execute request *************')
    debug(req)
    if (req.method === 'GET') {
      let retVal: any
      if (!req.resourceId) {
        retVal = await this.resProvider[req.resourceType]?.listResources(
          req.resourceType,
          req.query
        )
        return retVal
          ? retVal
          : { statusCode: 404, message: `Error retrieving resources!` }
      }
      if (!validate.uuid(req.resourceId)) {
        return {
          statusCode: 406,
          message: `Invalid resource id provided (${req.resourceId})`
        }
      }
      retVal = await this.resProvider[req.resourceType]?.getResource(
        req.resourceType,
        req.resourceId
      )
      return retVal
        ? retVal
        : {
            statusCode: 404,
            message: `Resource not found (${req.resourceId})!`
          }
    }

    if (req.method === 'DELETE' || req.method === 'PUT') {
      if (!req.resourceId) {
        return { statusCode: 406, value: `No resource id provided!` }
      }
      if (!validate.uuid(req.resourceId)) {
        return {
          statusCode: 406,
          message: `Invalid resource id provided (${req.resourceId})!`
        }
      }
      if (
        req.method === 'DELETE' ||
        (req.method === 'PUT' &&
          typeof req.body.value !== 'undefined' &&
          req.body.value == null)
      ) {
        const retVal = await this.resProvider[req.resourceType]?.deleteResource(
          req.resourceType,
          req.resourceId
        )
        if (retVal) {
          this.sendDelta(
            this.resProvider[req.resourceType]?.pluginId as string,
            req.resourceType,
            req.resourceId,
            null
          )
          return {
            statusCode: 200,
            message: `Resource (${req.resourceId}) deleted.`
          }
        } else {
          return {
            statusCode: 400,
            message: `Error deleting resource (${req.resourceId})!`
          }
        }
      }
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      if (typeof req.body.value === 'undefined' || req.body.value == null) {
        return { statusCode: 406, message: `No resource data supplied!` }
      }

      if (!validate.resource(req.resourceType, req.body.value)) {
        return { statusCode: 406, message: `Invalid resource data supplied!` }
      }

      if (req.method === 'POST') {
        const id = UUID_PREFIX + uuidv4()
        const retVal = await this.resProvider[req.resourceType]?.setResource(
          req.resourceType,
          id,
          req.body.value
        )
        if (retVal) {
          this.sendDelta(
            this.resProvider[req.resourceType]?.pluginId as string,
            req.resourceType,
            id,
            req.body.value
          )
          return { statusCode: 200, message: `Resource (${id}) saved.` }
        } else {
          return { statusCode: 400, message: `Error saving resource (${id})!` }
        }
      }
      if (req.method === 'PUT') {
        if (!req.resourceId) {
          return { statusCode: 406, message: `No resource id provided!` }
        }
        const retVal = await this.resProvider[req.resourceType]?.setResource(
          req.resourceType,
          req.resourceId,
          req.body.value
        )
        if (retVal) {
          this.sendDelta(
            this.resProvider[req.resourceType]?.pluginId as string,
            req.resourceType,
            req.resourceId,
            req.body.value
          )
          return {
            statusCode: 200,
            message: `Resource (${req.resourceId}) updated.`
          }
        } else {
          return {
            statusCode: 400,
            message: `Error updating resource (${req.resourceId})!`
          }
        }
      }
    }
  }

  private sendDelta(
    providerId: string,
    type: string,
    id: string,
    value: any
  ): void {
    debug(`** Sending Delta: resources.${type}.${id}`)
    this.server.handleMessage(providerId, {
      updates: [
        {
          values: [
            {
              path: `resources.${type}.${id}`,
              value
            }
          ]
        }
      ]
    })
  }
}
