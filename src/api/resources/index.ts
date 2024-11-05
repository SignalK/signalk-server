/* eslint-disable @typescript-eslint/no-explicit-any */
import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:resources')

import {
  Delta,
  isSignalKResourceType,
  Path,
  ResourceProvider,
  ResourceProviderMethods,
  SignalKResourceType,
  SKVersion
} from '@signalk/server-api'

import { IRouter, NextFunction, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { WithSecurityStrategy } from '../../security'

import { Responses } from '../'
import { validate } from './validate'
import { SignalKMessageHub, WithConfig } from '../../app'
import { writeSettingsFile } from '../../config/config'

export const RESOURCES_API_PATH = `/signalk/v2/api/resources`

export const skUuid = () => `${uuidv4()}`

interface DefaultProviders {
  [index: string]: string
}

interface ResourceApplication
  extends IRouter,
    WithConfig,
    WithSecurityStrategy,
    SignalKMessageHub {}

interface ResourceSettings {
  defaultProviders: DefaultProviders
}

export class ResourcesApi {
  private resProvider: { [key: string]: Map<string, ResourceProviderMethods> } =
    {}
  private app: ResourceApplication
  private settings!: ResourceSettings

  constructor(app: ResourceApplication) {
    this.app = app
    this.initResourceRoutes(app)
    this.parseSettings()
  }

  async start() {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise<void>(async (resolve) => {
      resolve()
    })
  }

  async parseSettings() {
    const defaultSettings: ResourceSettings = {
      defaultProviders: {
        routes: 'resources-provider',
        waypoints: 'resources-provider',
        regions: 'resources-provider',
        notes: 'resources-provider',
        charts: 'resources-provider'
      }
    }

    if (!('resourcesApi' in this.app.config.settings)) {
      debug('***** Applying Default Settings ********'),
        ((this.app.config.settings as any)['resourcesApi'] = defaultSettings)
    } else {
      const s = (this.app.config.settings as any)['resourcesApi']
      Object.entries(defaultSettings.defaultProviders).forEach((k) => {
        if (!(k[0] in s.defaultProviders)) {
          s.defaultProviders[k[0]] = k[1]
        }
      })
    }
    this.settings = (this.app.config.settings as any)['resourcesApi']
    debug('** Parsed Settings ***', this.app.config.settings)
  }

  saveSettings() {
    if (this.settings) {
      writeSettingsFile(this.app as any, this.app.config.settings, () =>
        debug('***SETTINGS SAVED***')
      )
    }
  }

  register(pluginId: string, provider: ResourceProvider) {
    debug(`** Registering ${provider.type} provider => ${pluginId} `)

    if (!provider) {
      throw new Error(`Error registering provider ${pluginId}!`)
    }
    if (!provider.type) {
      throw new Error(`Invalid ResourceProvider.type value!`)
    }

    if (this.isResourceProvider(provider)) {
      if (!this.resProvider[provider.type]) {
        this.resProvider[provider.type] = new Map()
      }
      this.resProvider[provider.type].set(pluginId, provider.methods)
      if (this.settings?.defaultProviders) {
        if (!(provider.type in this.settings.defaultProviders)) {
          this.settings.defaultProviders[provider.type] = pluginId
          debug(`Added default provider for ${provider.type}`)
          this.saveSettings()
        }
      }
    } else {
      throw new Error(`Error missing ResourceProvider.methods!`)
    }
    debug(`Type = ${provider.type}`, this.resProvider[provider.type])
  }

  unRegister(pluginId: string) {
    if (!pluginId) {
      return
    }
    debug(`** Un-registering ${pluginId} plugin as a resource provider....`)
    for (const resourceType in this.resProvider) {
      if (this.resProvider[resourceType].has(pluginId)) {
        debug(`** Un-registering ${pluginId} as ${resourceType} provider....`)
        this.resProvider[resourceType].delete(pluginId)
        // update default provider
        if (
          this.settings.defaultProviders[resourceType] &&
          this.settings.defaultProviders[resourceType] === pluginId
        ) {
          const p = this.checkForProvider(resourceType as SignalKResourceType)
          if (p) {
            this.settings.defaultProviders[resourceType] = p
            debug(
              `Assigned ${pluginId} as default provider for ${resourceType}.`
            )
          } else {
            delete this.settings.defaultProviders[resourceType]
            debug(
              `Removed ${pluginId} as default provider for ${resourceType}.`
            )
          }
        }
      }
    }
    this.saveSettings()
    debug(this.resProvider)
  }

  isResourceProvider(provider: ResourceProvider) {
    return !provider.methods.listResources ||
      !provider.methods.getResource ||
      !provider.methods.setResource ||
      !provider.methods.deleteResource ||
      typeof provider.methods.listResources !== 'function' ||
      typeof provider.methods.getResource !== 'function' ||
      typeof provider.methods.setResource !== 'function' ||
      typeof provider.methods.deleteResource !== 'function'
      ? false
      : true
  }

  async getResource(
    resType: SignalKResourceType,
    resId: string,
    providerId?: string
  ) {
    debug(`** getResource(${resType}, ${resId})`)

    const provider = this.checkForProvider(resType, providerId)
    if (!provider) {
      return Promise.reject(new Error(`No provider for ${resType}`))
    }
    return this.getFromAll(resType, resId)
  }

  async listResources(
    resType: SignalKResourceType,
    params: { [key: string]: any },
    providerId?: string
  ) {
    debug(`** listResources(${resType}, ${JSON.stringify(params)})`)

    const provider = this.checkForProvider(resType, providerId)
    debug(`** provider = ${provider}`)
    if (!provider) {
      return Promise.reject(new Error(`No provider for ${resType}`))
    }
    return this.listFromAll(resType, params)
  }

  async setResource(
    resType: SignalKResourceType,
    resId: string,
    data: { [key: string]: any },
    providerId?: string
  ) {
    debug(`** setResource(${resType}, ${resId}, ${JSON.stringify(data)})`)

    if (isSignalKResourceType(resType)) {
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
      validate.resource(resType as SignalKResourceType, resId, 'PUT', data)
    } else {
      if (!resId) {
        return Promise.reject(new Error(`No resource id provided!`))
      }
    }

    const provider = await this.getProviderForWrite(resType, resId, providerId)
    if (provider) {
      this.resProvider[resType]
        ?.get(provider)
        ?.setResource(resId, data)
        .then((r) => {
          this.app.handleMessage(
            provider as string,
            this.buildDeltaMsg(resType, resId, data),
            SKVersion.v2
          )
          return r
        })
        .catch((e: Error) => {
          debug(e)
          return Promise.reject(new Error(`Error writing ${resType} ${resId}`))
        })
    } else {
      return Promise.reject(new Error(`No provider for ${resType}`))
    }
  }

  async deleteResource(
    resType: SignalKResourceType,
    resId: string,
    providerId?: string
  ) {
    debug(`** deleteResource(${resType}, ${resId})`)

    let provider: string | undefined = undefined
    if (providerId) {
      provider = this.checkForProvider(resType, providerId)
    } else {
      provider = await this.getProviderForResourceId(resType, resId)
    }
    if (provider) {
      this.resProvider[resType]
        ?.get(provider)
        ?.deleteResource(resId)
        .then((r) => {
          this.app.handleMessage(
            provider as string,
            this.buildDeltaMsg(resType, resId, null),
            SKVersion.v2
          )
          return r
        })
        .catch((e: Error) => {
          debug(e)
          return Promise.reject(new Error(`Error deleting ${resType} ${resId}`))
        })
    } else {
      return Promise.reject(new Error(`No provider for ${resType}`))
    }
  }

  /** Returns true if there is a registered provider for the resource type */
  private hasRegisteredProvider(resType: string): boolean {
    const result =
      this.resProvider[resType] && this.resProvider[resType].size !== 0
        ? true
        : false
    debug(`hasRegisteredProvider(${resType}).result = ${result}`)
    return result
  }

  /** Returns the provider id to use to write a resource entry */
  async getProviderForWrite(
    resType: SignalKResourceType,
    resId: string,
    providerId?: string
  ) {
    debug('***** getProviderForWrite()', resType, resId, providerId)

    let pv4resid: string | undefined
    if (resId) {
      pv4resid = await this.getProviderForResourceId(resType, resId)
    }

    if (resId && pv4resid) {
      if (providerId && pv4resid !== providerId) {
        debug(
          `Detected provider for resource does not match supplied provider!`
        )
      }
      debug('***** Using provider ->', pv4resid)
      return pv4resid
    }

    if (providerId) {
      debug(`***** Checking if provider ${providerId} is valid for ${resType}.`)
      const pv4restype = this.checkForProvider(resType, providerId)
      if (pv4restype) {
        debug('***** Using provider ->', pv4restype)
        return pv4restype
      } else {
        debug(`***** ProviderId supplied is INVALID for ${resType}!`)
        return undefined
      }
    }
    // use default provider for resType
    debug(
      `***** No providerId supplied...getting the default provider for ${resType}.`
    )
    if (this.settings.defaultProviders[resType]) {
      const pv = this.checkForProvider(
        resType,
        this.settings.defaultProviders[resType]
      )
      debug('***** Using default provider ->', pv)
      return pv
    } else {
      return undefined
    }
  }

  /** Validates providerId for a given resourceType */
  private checkForProvider(
    resType: SignalKResourceType,
    providerId?: string
  ): string | undefined {
    debug(`** checkForProvider(${resType}, ${providerId})`)
    let result: string | undefined = undefined
    if (!this.resProvider[resType]) {
      debug(`${resType} not found!`)
      return result
    }
    if (providerId) {
      result = this.resProvider[resType].has(providerId)
        ? providerId
        : undefined
    } else {
      result = this.resProvider[resType].keys().next().value
    }
    debug(`** checkForProvider().result = ${result}`)
    return result
  }

  /** Retrieve matching resources from ALL providers */
  private async listFromAll(resType: string, params: { [key: string]: any }) {
    debug(`listFromAll(${resType}, ${JSON.stringify(params)})`)

    const result = {}
    if (!this.resProvider[resType]) {
      return result
    }
    const req: Promise<any>[] = []
    this.resProvider[resType].forEach((v) => {
      req.push(v.listResources(params))
    })

    const resp = await Promise.allSettled(req)
    resp.forEach((r) => {
      if (r.status === 'fulfilled') {
        Object.assign(result, r.value)
      }
    })
    return result
  }

  /** Query ALL providers for supplied resource id */
  private async getFromAll(resType: string, resId: string, property?: string) {
    debug(`getFromAll(${resType}, ${resId})`)

    const result = {}
    if (!this.resProvider[resType]) {
      return result
    }
    const req: Promise<any>[] = []
    this.resProvider[resType].forEach((id) => {
      req.push(id.getResource(resId, property))
    })

    const resp = await Promise.allSettled(req)
    resp.forEach((r) => {
      if (r.status === 'fulfilled') {
        Object.assign(result, r.value)
      }
    })
    return result
  }

  /** Return providerId for supplied resource id */
  private async getProviderForResourceId(
    resType: string,
    resId: string,
    fallbackToDefault?: boolean
  ): Promise<string | undefined> {
    debug(
      `getProviderForResourceId(${resType}, ${resId}, ${fallbackToDefault})`
    )

    let result: string | undefined = undefined

    if (!this.resProvider[resType]) {
      return result
    }
    const req: Promise<any>[] = []
    const idList: string[] = []
    this.resProvider[resType].forEach((v, k) => {
      idList.push(k)
      req.push(v.getResource(resId))
    })

    const resp = await Promise.allSettled(req)
    let idx = 0
    resp.forEach((r) => {
      if (r.status === 'fulfilled') {
        result = !result ? idList[idx] : result
      }
      idx++
    })

    if (!result && fallbackToDefault) {
      result = this.resProvider[resType].keys().next().value
    }
    debug(`getProviderForResourceId().result = ${result}`)
    return result
  }

  /** Return array of provider ids for supplied resource type */
  private getProvidersForResourceType(resType: string): Array<string> {
    const result: string[] = this.resProvider[resType]
      ? Object.keys(this.resProvider[resType])
      : []
    debug(`getProvidersForResourceType().result = ${result}`)
    return result
  }

  private initResourceRoutes(server: ResourceApplication) {
    const updateAllowed = (req: Request): boolean => {
      return server.securityStrategy.shouldAllowPut(
        req,
        'vessels.self',
        null,
        'resources'
      )
    }

    // list all serviced paths under resources
    server.get(`${RESOURCES_API_PATH}`, (req: Request, res: Response) => {
      res.json(this.getResourcePaths())
    })

    // Providers: Return list of providers
    server.get(
      `${RESOURCES_API_PATH}/:resourceType/_providers`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        res.json(this.getProvidersForResourceType(req.params.resourceType))
      }
    )

    // Providers: Return the default provider for the supplied resource type
    server.get(
      `${RESOURCES_API_PATH}/:resourceType/_providers/_default`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)
        if (!this.settings.defaultProviders[req.params.resourceType]) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Resource type not found! (${req.params.resourceType})`
          })
        } else {
          res.json(this.settings.defaultProviders[req.params.resourceType])
        }
      }
    )

    // Providers: Set the default write provider for a resource type
    server.post(
      `${RESOURCES_API_PATH}/:resourceType/_providers/_default/:providerId`,
      async (req: Request, res: Response) => {
        debug(`** ${req.method} ${req.path}`)

        if (!updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        if (!this.hasRegisteredProvider(req.params.resourceType)) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `Invalid resource type (${req.params.resourceType}) supplied!`
          })
          return
        }

        if (
          !this.checkForProvider(
            req.params.resourceType as SignalKResourceType,
            req.params.providerId
          )
        ) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `Resource provider not found for ${req.params.resourceType}!`
          })
          return
        }

        this.settings.defaultProviders[req.params.resourceType] =
          req.params.providerId
        this.saveSettings()
        res.status(201).json({
          state: 'COMPLETED',
          statusCode: 201,
          message: `${req.params.providerId}`
        })
      }
    )

    // facilitate retrieval of a specific resource
    server.get(
      `${RESOURCES_API_PATH}/:resourceType/:resourceId`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** GET ${RESOURCES_API_PATH}/:resourceType/:resourceId`)

        if (!this.hasRegisteredProvider(req.params.resourceType)) {
          next()
          return
        }

        try {
          if (req.query.provider) {
            const provider = this.checkForProvider(
              req.params.resourceType as SignalKResourceType,
              req.query.provider ? (req.query.provider as string) : undefined
            )
            if (!provider) {
              debug('** No provider found... calling next()...')
              next()
              return
            }
            const retVal = await this.resProvider[req.params.resourceType]
              ?.get(provider)
              ?.getResource(req.params.resourceId)
            res.json(retVal)
          } else {
            const retVal = await this.getFromAll(
              req.params.resourceType,
              req.params.resourceId
            )
            res.json(retVal)
          }
        } catch (err) {
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Resource not found! (${req.params.resourceId})`
          })
        }
      }
    )

    // facilitate retrieval of a specific resource property
    server.get(
      `${RESOURCES_API_PATH}/:resourceType/:resourceId/*`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** GET ${RESOURCES_API_PATH}/:resourceType/:resourceId/*`)

        if (req.path.match(`/charts/(\\w*\\W*)+/[0-9]*/[0-9]*/[0-9]*`)) {
          debug('*** CHART TILE request -> next()')
          next()
          return
        }

        if (!this.hasRegisteredProvider(req.params.resourceType)) {
          next()
          return
        }

        try {
          const property = req.params['0']
            ? req.params['0'].split('/').join('.')
            : undefined

          if (req.query.provider) {
            const provider = this.checkForProvider(
              req.params.resourceType as SignalKResourceType,
              req.query.provider ? (req.query.provider as string) : undefined
            )
            if (!provider) {
              debug('** No provider found... calling next()...')
              next()
              return
            }
            const retVal = await this.resProvider[req.params.resourceType]
              ?.get(provider)
              ?.getResource(req.params.resourceId, property)
            res.json(retVal)
          } else {
            const retVal = await this.getFromAll(
              req.params.resourceType,
              req.params.resourceId,
              property
            )
            res.json(retVal)
          }
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
    server.get(
      `${RESOURCES_API_PATH}/:resourceType`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** GET ${RESOURCES_API_PATH}/:resourceType`)

        if (!this.hasRegisteredProvider(req.params.resourceType)) {
          next()
          return
        }

        const parsedQuery = Object.entries(req.query).reduce(
          (acc: any, [name, value]) => {
            try {
              acc[name] = JSON.parse(value as string)
              return acc
            } catch (error) {
              acc[name] = value
              return acc
            }
          },
          {}
        )

        if (isSignalKResourceType(req.params.resourceType)) {
          try {
            validate.query(
              req.params.resourceType as SignalKResourceType,
              undefined,
              req.method,
              parsedQuery
            )
          } catch (e) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: (e as Error).message
            })
            return
          }
        }

        try {
          if (req.query.provider) {
            const provider = this.checkForProvider(
              req.params.resourceType as SignalKResourceType,
              req.query.provider ? (req.query.provider as string) : undefined
            )
            if (!provider) {
              debug('** No provider found... calling next()...')
              next()
              return
            }
            const retVal = await this.resProvider[req.params.resourceType]
              ?.get(provider)
              ?.listResources(parsedQuery)
            res.json(retVal)
          } else {
            const retVal = await this.listFromAll(
              req.params.resourceType,
              parsedQuery
            )
            res.json(retVal)
          }
        } catch (err) {
          console.error(err)
          res.status(404).json({
            state: 'FAILED',
            statusCode: 404,
            message: `Error retrieving resources!`
          })
        }
      }
    )

    // facilitate creation of new resource entry of supplied type
    server.post(
      `${RESOURCES_API_PATH}/:resourceType`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** POST ${req.path}`)

        if (!this.hasRegisteredProvider(req.params.resourceType)) {
          next()
          return
        }

        const provider = await this.getProviderForWrite(
          req.params.resourceType as SignalKResourceType,
          '',
          req.query.provider ? (req.query.provider as string) : undefined
        )
        if (!provider) {
          debug('** No provider found... calling next()...')
          next()
          return
        }

        if (!updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }
        if (isSignalKResourceType(req.params.resourceType)) {
          try {
            validate.resource(
              req.params.resourceType as SignalKResourceType,
              undefined,
              req.method,
              req.body
            )
          } catch (e) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: (e as Error).message
            })
            return
          }
        }

        let id: string
        if (req.params.resourceType === 'charts') {
          id = req.body.identifier ?? skUuid()
        } else {
          id = skUuid()
        }

        try {
          await this.resProvider[req.params.resourceType]
            ?.get(provider)
            ?.setResource(id, req.body)

          server.handleMessage(
            provider as string,
            this.buildDeltaMsg(
              req.params.resourceType as SignalKResourceType,
              id,
              req.body
            ),
            SKVersion.v2
          )
          res.status(201).json({
            state: 'COMPLETED',
            statusCode: 201,
            id
          })
        } catch (err) {
          res.status(400).json({
            state: 'FAILED',
            statusCode: 400,
            message: `Error saving ${req.params.resourceType} resource (${id})!`
          })
        }
      }
    )

    // facilitate creation / update of resource entry at supplied id
    server.put(
      `${RESOURCES_API_PATH}/:resourceType/:resourceId`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** PUT ${RESOURCES_API_PATH}/:resourceType/:resourceId`)

        if (!this.hasRegisteredProvider(req.params.resourceType)) {
          next()
          return
        }

        if (!updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        if (isSignalKResourceType(req.params.resourceType)) {
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

          debug(req.body)
          try {
            validate.resource(
              req.params.resourceType as SignalKResourceType,
              req.params.resourceId,
              req.method,
              req.body
            )
          } catch (e) {
            res.status(400).json({
              state: 'FAILED',
              statusCode: 400,
              message: (e as Error).message
            })
            return
          }
        }

        try {
          const provider = await this.getProviderForWrite(
            req.params.resourceType as SignalKResourceType,
            req.params.resourceId,
            req.query.provider ? (req.query.provider as string) : undefined
          )
          if (!provider) {
            debug('** No provider found... calling next()...')
            next()
            return
          }
          await this.resProvider[req.params.resourceType]
            ?.get(provider)
            ?.setResource(req.params.resourceId, req.body)

          server.handleMessage(
            provider as string,
            this.buildDeltaMsg(
              req.params.resourceType as SignalKResourceType,
              req.params.resourceId,
              req.body
            ),
            SKVersion.v2
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
    server.delete(
      `${RESOURCES_API_PATH}/:resourceType/:resourceId`,
      async (req: Request, res: Response, next: NextFunction) => {
        debug(`** DELETE ${RESOURCES_API_PATH}/:resourceType/:resourceId`)

        if (!this.hasRegisteredProvider(req.params.resourceType)) {
          next()
          return
        }

        if (!updateAllowed(req)) {
          res.status(403).json(Responses.unauthorised)
          return
        }

        try {
          let provider: string | undefined = undefined
          if (req.query.provider) {
            provider = this.checkForProvider(
              req.params.resourceType as SignalKResourceType,
              req.query.provider ? (req.query.provider as string) : undefined
            )
          } else {
            provider = await this.getProviderForResourceId(
              req.params.resourceType,
              req.params.resourceId
            )
          }
          if (!provider) {
            debug('** No provider found... calling next()...')
            next()
            return
          }

          await this.resProvider[req.params.resourceType]
            ?.get(provider)
            ?.deleteResource(req.params.resourceId)

          server.handleMessage(
            provider as string,
            this.buildDeltaMsg(
              req.params.resourceType as SignalKResourceType,
              req.params.resourceId,
              null
            ),
            SKVersion.v2
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
  }

  private getResourcePaths(): { [key: string]: any } {
    const resPaths: { [key: string]: any } = {}
    for (const i in this.resProvider) {
      // eslint-disable-next-line no-prototype-builtins
      if (this.resProvider.hasOwnProperty(i)) {
        resPaths[i] = {
          description: `Path containing ${
            i.slice(-1) === 's' ? i.slice(0, i.length - 1) : i
          } resources`
        }
      }
    }
    return resPaths
  }

  private buildDeltaMsg(
    resType: SignalKResourceType,
    resid: string,
    resValue: any
  ): Delta {
    return {
      updates: [
        {
          values: [
            {
              path: `resources.${resType}.${resid}` as Path,
              value: resValue
            }
          ]
        }
      ]
    }
  }
}
