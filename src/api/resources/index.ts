import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:resourcesApi')

import {
  ResourceProvider,
  ResourceProviderMethods,
  SignalKResourceType
} from '@signalk/server-api'

import { Application, NextFunction, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
// import { SignalKMessageHub } from '../../app'
import { WithSecurityStrategy } from '../../security'

import { Responses } from '../'
import { buildResource } from './resources'
import { validate } from './validate'

const SIGNALK_API_PATH = `/signalk/v1/api`
const UUID_PREFIX = 'urn:mrn:signalk:uuid:'

interface ResourceApplication extends Application, WithSecurityStrategy {
  handleMessage: (id: string, data: any) => void
}

export class ResourcesApi {
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
    debug(`** Registering provider(s)....${pluginId} ${provider?.type}`)
    if (!provider) {
      throw new Error(`Error registering provider ${pluginId}!`)
    }
    if (!provider.type) {
      throw new Error(`Invalid ResourceProvider.type value!`)
    }
    if (!this.resProvider[provider.type]) {
      if (
        !provider.methods.listResources ||
        !provider.methods.getResource ||
        !provider.methods.setResource ||
        !provider.methods.deleteResource ||
        typeof provider.methods.listResources !== 'function' ||
        typeof provider.methods.getResource !== 'function' ||
        typeof provider.methods.setResource !== 'function' ||
        typeof provider.methods.deleteResource !== 'function'
      ) {
        throw new Error(`Error missing ResourceProvider.methods!`)
      } else {
        provider.methods.pluginId = pluginId
        this.resProvider[provider.type] = provider.methods
      }
      debug(this.resProvider[provider.type])
    } else {
      const msg = `Error: ${provider?.type} alreaady registered!`
      debug(msg)
      throw new Error(msg)
    }
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
    return this.resProvider[resType]?.getResource(resId)
  }

  listResources(resType: SignalKResourceType, params: { [key: string]: any }) {
    debug(`** listResources(${resType}, ${JSON.stringify(params)})`)
    if (!this.checkForProvider(resType)) {
      return Promise.reject(new Error(`No provider for ${resType}`))
    }
    return this.resProvider[resType]?.listResources(params)
  }

  setResource(
    resType: SignalKResourceType,
    resId: string,
    data: { [key: string]: any }
  ) {
    debug(`** setResource(${resType}, ${resId}, ${JSON.stringify(data)})`)
    if (!this.checkForProvider(resType)) {
      return Promise.reject(new Error(`No provider for ${resType}`))
    }
    if (this.signalkResTypes.includes(resType as SignalKResourceType)) {
      let isValidId: boolean
      if (resType === 'charts') {
        isValidId = validate.chartId(resId)
      } else {
        isValidId = validate.uuid(resId)
      }
      if (!isValidId) {
        return Promise.reject(
          new Error(`Invalid resource id provided (${resId})`)
        )
      }
      if (!validate.resource(resType, data)) {
        return Promise.reject(new Error(`Invalid resource data!`))
      }
    }

    return this.resProvider[resType]?.setResource(resId, data)
  }

  deleteResource(resType: SignalKResourceType, resId: string) {
    debug(`** setResource(${resType}, ${resId})`)
    if (!this.checkForProvider(resType)) {
      return Promise.reject(new Error(`No provider for ${resType}`))
    }

    return this.resProvider[resType]?.deleteResource(resId)
  }

  private start(app: any) {
    debug(`** Initialise ${SIGNALK_API_PATH}/resources path handler **`)
    this.server = app
    this.initResourceRoutes()
  }

  private updateAllowed(req: Request): boolean {
    return this.server.securityStrategy.shouldAllowPut(
      req,
      'vessels.self',
      null,
      'resources'
    )
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
          ]?.getResource(req.params.resourceId)
          res.json(retVal)
        } catch (err) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Resource not found! (${req.params.resourceId})`
          })
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
          ]?.listResources(req.query)
          res.json(retVal)
        } catch (err) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Error retrieving resources!`
          })
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

        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        if (
          this.signalkResTypes.includes(
            req.params.resourceType as SignalKResourceType
          )
        ) {
          if (!validate.resource(req.params.resourceType, req.body)) {
            res.status(400).json(Responses.invalid)
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
          ]?.setResource(id, req.body)

          this.server.handleMessage(
            this.resProvider[req.params.resourceType]?.pluginId as string,
            this.buildDeltaMsg(
              req.params.resourceType as SignalKResourceType,
              id,
              req.body
            )
          )
          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            id
          })
        } catch (err) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Error saving ${req.params.resourceType} resource (${id})!`
          })
        }
      }
    )

    // facilitate creation / update of resource entry at supplied id
    this.server.put(
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

        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
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
          if (!isValidId) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: `Invalid resource id provided (${req.params.resourceId})`
            })
            return
          }

          debug('req.body')
          debug(req.body)
          if (!validate.resource(req.params.resourceType, req.body)) {
            res.status(400).json(Responses.invalid)
            return
          }
        }

        try {
          const retVal = await this.resProvider[
            req.params.resourceType
          ]?.setResource(req.params.resourceId, req.body)

          this.server.handleMessage(
            this.resProvider[req.params.resourceType]?.pluginId as string,
            this.buildDeltaMsg(
              req.params.resourceType as SignalKResourceType,
              req.params.resourceId,
              req.body
            )
          )
          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: req.params.resourceId
          })
        } catch (err) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Error saving ${req.params.resourceType} resource (${req.params.resourceId})!`
          })
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

        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        try {
          const retVal = await this.resProvider[
            req.params.resourceType
          ]?.deleteResource(req.params.resourceId)

          this.server.handleMessage(
            this.resProvider[req.params.resourceType]?.pluginId as string,
            this.buildDeltaMsg(
              req.params.resourceType as SignalKResourceType,
              req.params.resourceId,
              null
            )
          )
          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: req.params.resourceId
          })
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `Error deleting resource (${req.params.resourceId})!`
          })
        }
      }
    )

    // facilitate API requests
    this.server.post(
      `${SIGNALK_API_PATH}/resources/set/:resourceType`,
      async (req: Request, res: Response) => {
        debug(`** POST ${SIGNALK_API_PATH}/resources/set/:resourceType`)

        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        const apiData = this.processApiRequest(req)
        debug(apiData)

        if (!this.checkForProvider(apiData.type)) {
          res.status(501).json({
            state: 'FAILED',
            statusCode: 501,
            message: `No provider for ${apiData.type}!`
          })
          return
        }
        if (!apiData.value) {
          res.status(400).json(Responses.invalid)
          return
        }
        if (apiData.type === 'charts') {
          if (!validate.chartId(apiData.id)) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: `Invalid chart resource id supplied!`
            })
            return
          }
        } else {
          if (!validate.uuid(apiData.id)) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: `Invalid resource id supplied!`
            })
            return
          }
        }

        try {
          await this.resProvider[apiData.type]?.setResource(
            apiData.id,
            apiData.value
          )
          this.server.handleMessage(
            this.resProvider[apiData.type]?.pluginId as string,
            this.buildDeltaMsg(apiData.type, apiData.id, apiData.value)
          )
          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: apiData.id
          })
        } catch (err) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `ERROR: Could not create ${req.params.resourceType} resource!`
          })
        }
      }
    )
    this.server.put(
      `${SIGNALK_API_PATH}/resources/set/:resourceType/:resourceId`,
      async (req: Request, res: Response) => {
        debug(
          `** PUT ${SIGNALK_API_PATH}/resources/set/:resourceType/:resourceId`
        )

        if (!this.updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        const apiData = this.processApiRequest(req)

        if (!this.checkForProvider(apiData.type)) {
          res.status(501).json({
            state: 'FAILED',
            statusCode: 501,
            message: `No provider for ${apiData.type}!`
          })
          return
        }
        if (!apiData.value) {
          res.status(400).json(Responses.invalid)
          return
        }
        if (apiData.type === 'charts') {
          if (!validate.chartId(apiData.id)) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: `Invalid chart resource id supplied!`
            })
            return
          }
        } else {
          if (!validate.uuid(apiData.id)) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: `Invalid resource id supplied!`
            })
            return
          }
        }

        try {
          await this.resProvider[apiData.type]?.setResource(
            apiData.id,
            apiData.value
          )
          this.server.handleMessage(
            this.resProvider[apiData.type]?.pluginId as string,
            this.buildDeltaMsg(apiData.type, apiData.id, apiData.value)
          )
          res.status(200).json({
            state: 'COMPLETED',
            statusCode: 200,
            message: apiData.id
          })
        } catch (err) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `ERROR: ${req.params.resourceType}/${apiData.id} could not be updated!`
          })
        }
      }
    )
  }

  private processApiRequest(req: Request) {
    const apiReq: any = {
      type: undefined,
      id: undefined,
      value: undefined
    }

    if (req.params.resourceType.toLowerCase() === 'waypoint') {
      apiReq.type = 'waypoints'
    }
    if (req.params.resourceType.toLowerCase() === 'route') {
      apiReq.type = 'routes'
    }
    if (req.params.resourceType.toLowerCase() === 'note') {
      apiReq.type = 'notes'
    }
    if (req.params.resourceType.toLowerCase() === 'region') {
      apiReq.type = 'regions'
    }
    if (req.params.resourceType.toLowerCase() === 'charts') {
      apiReq.type = 'charts'
    }

    apiReq.value = buildResource(apiReq.type, req.body)

    apiReq.id = req.params.resourceId
      ? req.params.resourceId
      : apiReq.type === 'charts'
      ? apiReq.value.identifier
      : UUID_PREFIX + uuidv4()

    return apiReq
  }

  private getResourcePaths(): { [key: string]: any } {
    const resPaths: { [key: string]: any } = {}
    for (const i in this.resProvider) {
      if (this.resProvider.hasOwnProperty(i)) {
        resPaths[i] = {
          description: `Path containing ${
            i.slice(-1) === 's' ? i.slice(0, i.length - 1) : i
          } resources`,
          $source: this.resProvider[i]?.pluginId
        }
      }
    }
    return resPaths
  }

  private checkForProvider(resType: SignalKResourceType): boolean {
    debug(`** checkForProvider(${resType})`)
    debug(this.resProvider[resType])
    return this.resProvider[resType] ? true : false
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
