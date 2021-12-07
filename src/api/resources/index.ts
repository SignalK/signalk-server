import {
  ResourceProvider,
  ResourceProviderMethods,
  SignalKResourceType
} from '@signalk/server-api'
import Debug from 'debug'
import { Application, NextFunction, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'

import { buildResource } from './resources'
import { validate } from './validate'

const debug = Debug('signalk:resources')

const SIGNALK_API_PATH = `/signalk/v1/api`
const UUID_PREFIX = 'urn:mrn:signalk:uuid:'

interface ResourceApplication extends Application {
  handleMessage: (id: string, data: any) => void
  securityStrategy: {
    shouldAllowPut: (
      req: any,
      context: string,
      source: any,
      path: string
    ) => boolean
  }
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

  private updateAllowed(): boolean {
    return this.server.securityStrategy.shouldAllowPut(
      this.server,
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
    this.server.put(
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

        if (!this.updateAllowed()) {
          res.status(403)
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

        if (!this.updateAllowed()) {
          res.status(403)
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

        if (!this.updateAllowed()) {
          res.status(403)
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

    // facilitate API requests
    this.server.put(
      `${SIGNALK_API_PATH}/resources/set/:resourceType`,
      async (req: Request, res: Response) => {
        debug(`** PUT ${SIGNALK_API_PATH}/resources/set/:resourceType`)

        if (!this.updateAllowed()) {
          res.status(403)
          return
        }

        const apiData = this.processApiRequest(req)

        if (!this.checkForProvider(apiData.type)) {
          res.status(501).send(`No provider for ${apiData.type}!`)
          return
        }
        if (!apiData.value) {
          res.status(406).send(`Invalid resource data supplied!`)
          return
        }
        if (apiData.type === 'charts') {
          if (!validate.chartId(apiData.id)) {
            res.status(406).send(`Invalid chart resource id supplied!`)
            return
          }
        } else {
          if (!validate.uuid(apiData.id)) {
            res.status(406).send(`Invalid resource id supplied!`)
            return
          }
        }

        try {
          const retVal = await this.resProvider[apiData.type]?.setResource(
            apiData.type,
            apiData.id,
            apiData.value
          )
          this.server.handleMessage(
            this.resProvider[apiData.type]?.pluginId as string,
            this.buildDeltaMsg(apiData.type, apiData.id, apiData.value)
          )
          res.status(200).send(`SUCCESS: ${req.params.resourceType} complete.`)
        } catch (err) {
          res.status(404).send(`ERROR: ${req.params.resourceType} incomplete!`)
        }
      }
    )
    this.server.put(
      `${SIGNALK_API_PATH}/resources/set/:resourceType/:resourceId`,
      async (req: Request, res: Response) => {
        debug(
          `** PUT ${SIGNALK_API_PATH}/resources/set/:resourceType/:resourceId`
        )

        if (!this.updateAllowed()) {
          res.status(403)
          return
        }

        const apiData = this.processApiRequest(req)

        if (!this.checkForProvider(apiData.type)) {
          res.status(501).send(`No provider for ${apiData.type}!`)
          return
        }
        if (!apiData.value) {
          res.status(406).send(`Invalid resource data supplied!`)
          return
        }
        if (apiData.type === 'charts') {
          if (!validate.chartId(apiData.id)) {
            res.status(406).send(`Invalid chart resource id supplied!`)
            return
          }
        } else {
          if (!validate.uuid(apiData.id)) {
            res.status(406).send(`Invalid resource id supplied!`)
            return
          }
        }

        try {
          const retVal = await this.resProvider[apiData.type]?.setResource(
            apiData.type,
            apiData.id,
            apiData.value
          )
          this.server.handleMessage(
            this.resProvider[apiData.type]?.pluginId as string,
            this.buildDeltaMsg(apiData.type, apiData.id, apiData.value)
          )
          res.status(200).send(`SUCCESS: ${req.params.resourceType} complete.`)
        } catch (err) {
          res.status(404).send(`ERROR: ${req.params.resourceType} incomplete!`)
        }
      }
    )
  }

  private processApiRequest(req: Request) {
    let resType: SignalKResourceType = 'waypoints'
    if (req.params.resourceType.toLowerCase() === 'waypoint') {
      resType = 'waypoints'
    }
    if (req.params.resourceType.toLowerCase() === 'route') {
      resType = 'routes'
    }
    if (req.params.resourceType.toLowerCase() === 'note') {
      resType = 'notes'
    }
    if (req.params.resourceType.toLowerCase() === 'region') {
      resType = 'regions'
    }
    if (req.params.resourceType.toLowerCase() === 'charts') {
      resType = 'charts'
    }

    const resValue: any = buildResource(resType, req.body)

    const resId: string = req.params.resourceId
      ? req.params.resourceId
      : (resType = 'charts' ? resValue.identifier : UUID_PREFIX + uuidv4())

    return {
      type: resType,
      id: resId,
      value: resValue
    }
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
