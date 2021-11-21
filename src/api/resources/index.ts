import Debug from 'debug'
import { v4 as uuidv4 } from 'uuid'
<<<<<<< HEAD
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
=======
import { validate } from './validate'
import { buildResource } from './resources'

const debug = Debug('signalk:resources')

interface ResourceRequest {
    method: 'GET' | 'PUT' | 'POST' | 'DELETE'
    body: any
    query: {[key:string]: any}
    resourceType: string
    resourceId: string,
    apiMethod?: string | null
}

interface ResourceProvider {
    types: Array<string>
    methods: ResourceProviderMethods
}

interface ResourceProviderMethods {
    pluginId: string
    listResources: (type:string, query: {[key:string]:any})=> Promise<any>
    getResource: (type:string, id:string)=> Promise<any>
    setResource: (type:string, id:string, value:{[key:string]:any})=> Promise<any>
    deleteResource: (type:string, id:string)=> Promise<any>
}

const SIGNALK_API_PATH= `/signalk/v1/api`
const UUID_PREFIX= 'urn:mrn:signalk:uuid:'

const API_METHODS= [
    'setWaypoint',
    'deleteWaypoint',
    'setRoute',
    'deleteRoute',
    'setNote',
    'deleteNote',
    'setRegion',
    'deleteRegion'
]

export class Resources {

    // ** in-scope resource types **
    private resourceTypes:Array<string>= [
        'routes',
        'waypoints',
        'notes',
        'regions',
        'charts'
    ]

    resProvider: {[key:string]: ResourceProviderMethods | null}= {}
    server: any

    constructor(app:any) { 
        this.start(app)
    }

    // ** initialise resourcesApi **
    private start(app:any) {
        debug(`** Initialise ${SIGNALK_API_PATH}/resources path handler **`)
        this.server= app
        this.initResourceRoutes()
    }

    // ** register resource provider **
    public register(pluginId:string, provider:ResourceProvider) {
        debug(`** Registering provider(s)....${provider?.types}`)
        if(!provider ) { return }
        if(provider.types && !Array.isArray(provider.types)) { return }
        provider.types.forEach( (i:string)=>{
            if(!this.resProvider[i]) {
                provider.methods.pluginId= pluginId
                this.resProvider[i]= provider.methods
            }
        })
        debug(this.resProvider)
    }

    // ** un-register resource provider for the supplied types **
    public unRegister(pluginId:string) {
        if(!pluginId) { return }
        debug(`** Un-registering ${pluginId} resource provider(s)....`)
        for( let i in this.resProvider ) {
            if(this.resProvider[i]?.pluginId===pluginId) {
                debug(`** Un-registering ${i}....`)
                delete this.resProvider[i]
            }
        }
        debug(JSON.stringify(this.resProvider))
    }

    // ** return resource with supplied type and id **
    public getResource(type:string, id:string) {
        debug(`** getResource(${type}, ${id})`)
        return this.actionResourceRequest({
            method: 'GET',
            body: {},
            query: {},
            resourceType: type,
            resourceId: id
        })
    }

    // ** initialise handler for in-scope resource types **
    private initResourceRoutes() {
        this.server.get(`${SIGNALK_API_PATH}/resources`, (req:any, res:any) => {
            // list all serviced paths under resources
            res.json(this.getResourcePaths())
        })
        this.server.use(`${SIGNALK_API_PATH}/resources/*`, async (req:any, res:any, next: any) => {
            let result= this.parseResourceRequest(req)
            if(result) {
                let ar= await this.actionResourceRequest(result)
                if(typeof ar.statusCode!== 'undefined'){
                    debug(`${JSON.stringify(ar)}`)
                    res.status= ar.statusCode
                    res.send(ar.message)
                }
                else {
                    res.json(ar)
                }
            }
            else {
                debug('** No provider found... calling next()...')
                next()
            }
        })
    }

    // ** return all paths serviced under SIGNALK_API_PATH/resources **
    private getResourcePaths(): {[key:string]:any} {
        let resPaths:{[key:string]:any}= {}
        Object.entries(this.resProvider).forEach( (p:any)=> {
            if(p[1]) { resPaths[p[0]]= `Path containing ${p[0]}, each named with a UUID` }
        })
        // check for other plugins servicing paths under ./resources
        this.server._router.stack.forEach((i:any)=> {
            if(i.route && i.route.path && typeof i.route.path==='string') {
                if(i.route.path.indexOf(`${SIGNALK_API_PATH}/resources`)!==-1) {
                    let r= i.route.path.split('/')
                    if( r.length>5 && !(r[5] in resPaths) ) { 
                        resPaths[r[5]]= `Path containing ${r[5]} resources (provided by plug-in)`
                    }
                }
            }
        })
        return resPaths
    }

    // ** parse api path request and return ResourceRequest object **
    private parseResourceRequest(req:any):ResourceRequest | undefined {
        debug('** req.originalUrl:', req.originalUrl)
        debug('** req.method:', req.method)
        debug('** req.body:', req.body)
        debug('** req.query:', req.query)
        debug('** req.params:', req.params)
        let p= req.params[0].split('/')
        let resType= (typeof req.params[0]!=='undefined') ? p[0] : ''
        let resId= p.length>1 ? p[1] : ''
        let resAttrib= p.length>2 ? p.slice(2) : []
        req.query.resAttrib= resAttrib
        debug('** resType:', resType)
        debug('** resId:', resId)
        debug('** resAttrib:', resAttrib)
        debug('** req.params + attribs:', req.query)
        
        let apiMethod= (API_METHODS.includes(resType)) ? resType : null
        if(apiMethod) {
            if(apiMethod.toLowerCase().indexOf('waypoint')!==-1) {
                resType= 'waypoints'
            }
            if(apiMethod.toLowerCase().indexOf('route')!==-1) {
                resType= 'routes'
            }
            if(apiMethod.toLowerCase().indexOf('note')!==-1) {
                resType= 'notes'
            }
            if(apiMethod.toLowerCase().indexOf('region')!==-1) {
                resType= 'regions'
            }
        }

        let retReq= {
            method: req.method,
            body: req.body,
            query: req.query,
            resourceType: resType,
            resourceId: resId,
            apiMethod: apiMethod
        }

        if(this.resourceTypes.includes(resType) && this.resProvider[resType]) {
            return retReq
        }
        else { 
            debug('Invalid resource type or no provider for this type!')
            return undefined 
        }    
    }

    // ** action an in-scope resource request **
    private async actionResourceRequest (req:ResourceRequest):Promise<any> {
        debug('********* action request *************')
        debug(req)
        
        // check for registered resource providers
        if(!this.resProvider) { 
            return {statusCode: 501, message: `No Provider`} 
        }
        
        if(!this.resourceTypes.includes(req.resourceType) || !this.resProvider[req.resourceType]) {
            return {statusCode: 501, message: `No Provider`} 
        }

        // check for API method request
        if(req.apiMethod && API_METHODS.includes(req.apiMethod)) {
            debug(`API Method (${req.apiMethod})`)
            req= this.transformApiRequest(req)
        }

        return await this.execResourceRequest(req)
    }

    // ** transform API request to ResourceRequest **
    private transformApiRequest(req: ResourceRequest):ResourceRequest {
        if(req.apiMethod?.indexOf('delete')!==-1) {
            req.method= 'DELETE'
        }
        if(req.apiMethod?.indexOf('set')!==-1) {
            if(!req.body.id) { 
                req.method= 'POST' 
            }
            else { 
                req.resourceId= req.body.id 
            }
            req.body= { value: buildResource(req.resourceType, req.body) ?? {} }
        }
        return req
    }

    // ** action an in-scope resource request **
    private async execResourceRequest (req:ResourceRequest):Promise<any> {
        debug('********* execute request *************')
        debug(req)
        if(req.method==='GET') {
            let retVal: any
            if(!req.resourceId) {
                retVal= await this.resProvider[req.resourceType]?.listResources(req.resourceType, req.query)
                return (retVal) ?
                    retVal :
                    {statusCode: 404, message: `Error retrieving resources!` }
            }
            if(!validate.uuid(req.resourceId)) {
                return {statusCode: 406, message: `Invalid resource id provided (${req.resourceId})` }
            }
            retVal= await this.resProvider[req.resourceType]?.getResource(req.resourceType, req.resourceId)
            return (retVal) ?
                retVal :
                {statusCode: 404, message: `Resource not found (${req.resourceId})!` }
        }

        if(req.method==='DELETE' || req.method==='PUT') {
            if(!req.resourceId) {
                return {statusCode: 406, value: `No resource id provided!` }
            }
            if(!validate.uuid(req.resourceId)) {
                return {statusCode: 406, message: `Invalid resource id provided (${req.resourceId})!` }
            }
            if( 
                req.method==='DELETE' || 
                (req.method==='PUT' && typeof req.body.value!=='undefined' && req.body.value==null) 
            ) {
                let retVal= await this.resProvider[req.resourceType]?.deleteResource(req.resourceType, req.resourceId)
                if(retVal){
                    this.sendDelta(
                        this.resProvider[req.resourceType]?.pluginId as string, 
                        req.resourceType, req.resourceId, 
                        null
                    )
                    return {statusCode: 200, message: `Resource (${req.resourceId}) deleted.`}
                }
                else {
                    return {statusCode: 400, message: `Error deleting resource (${req.resourceId})!` }
                }
            }

        }
        
        if(req.method==='POST' || req.method==='PUT') {
            // check for supplied value
            if( typeof req.body.value==='undefined' || req.body.value==null) {
                return {statusCode: 406, message: `No resource data supplied!`}
            }
            // validate supplied request data
            if(!validate.resource(req.resourceType, req.body.value)) {
                return {statusCode: 406, message: `Invalid resource data supplied!`}
            }
            if(req.method==='POST') {
                let id= UUID_PREFIX + uuidv4()
                let retVal= await this.resProvider[req.resourceType]?.setResource(req.resourceType, id, req.body.value)
                if(retVal){
                    this.sendDelta(
                        this.resProvider[req.resourceType]?.pluginId as string,
                        req.resourceType, 
                        id, 
                        req.body.value
                    )
                    return {statusCode: 200, message: `Resource (${id}) saved.`}  
                }
                else {
                    return {statusCode: 400, message: `Error saving resource (${id})!` }
                }
            }
            if(req.method==='PUT') {
                if(!req.resourceId) {
                    return {statusCode: 406, message: `No resource id provided!` }
                }
                let retVal= await this.resProvider[req.resourceType]?.setResource(req.resourceType, req.resourceId, req.body.value)
                if(retVal){
                    this.sendDelta(
                        this.resProvider[req.resourceType]?.pluginId as string,
                        req.resourceType, 
                        req.resourceId, 
                        req.body.value
                    )
                    return {statusCode: 200, message: `Resource (${req.resourceId}) updated.`}  
                }
                else {
                    return {statusCode: 400, message: `Error updating resource (${req.resourceId})!` }
                }
            }
        }
    }

    // ** send delta message with resource  PUT, POST, DELETE action result
    private sendDelta(providerId:string, type:string, id:string, value:any):void {
        debug(`** Sending Delta: resources.${type}.${id}`)
        this.server.handleMessage(providerId, {
            updates: [ 
                {
                    values: [
                        {
                            path: `resources.${type}.${id}`, 
                            value: value
                        }
                    ]
                } 
            ] 
        })
    }

<<<<<<< HEAD
    // ** Get provider methods for supplied resource type. Returns null if none found **
    private getResourceProviderFor(resType:string): ResourceProviderMethods | null {
        if(!this.server.plugins) { return null}
        let pSource: ResourceProviderMethods | null= null
        this.server.plugins.forEach((plugin:any)=> {
            if(typeof plugin.resourceProvider !== 'undefined') {
                pSource= plugin.resourceProvider.types.includes(resType) ?
                    plugin.resourceProvider.methods :
                    null
            }
        })
        debug(`** Checking for ${resType} provider.... ${pSource ? 'Found' : 'Not found'}`)
        return pSource
    }

>>>>>>> Add Signal K standard resource path handling
=======
>>>>>>> add pluginId to unRegister function
}
