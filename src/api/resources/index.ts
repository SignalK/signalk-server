import Debug from 'debug'
import { v4 as uuidv4 } from 'uuid'
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
    public register(provider:ResourceProvider) {
        debug(`** Registering provider(s)....${provider?.types}`)
        if(!provider ) { return }
        if(provider.types && !Array.isArray(provider.types)) { return }
        provider.types.forEach( (i:string)=>{
            if(!this.resProvider[i]) {
                this.resProvider[i]= provider.methods
            }
        })
        debug(this.resProvider)
    }

    // ** un-register resource provider for the supplied types **
    public unRegister(resourceTypes:string[]) {
        debug(`** Un-registering provider(s)....${resourceTypes}`)
        if(!Array.isArray(resourceTypes)) { return }
        resourceTypes.forEach( (i:string)=>{
            if(this.resProvider[i]) {
                delete this.resProvider[i]
            }
        })
        debug(JSON.stringify(this.resProvider))

        //** scan plugins in case there is more than one plugin that can service a particular resource type. **
        debug('** RESCANNING **')
        this.checkForProviders()
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

    // Scan plugins for resource providers and register them 
    // rescan= false: only add providers for types where no provider is registered
    // rescan= true: clear providers for all types prior to commencing scan.
    private checkForProviders(rescan:boolean= false) {
        if(rescan) { this.resProvider= {} } 
        debug(`** Checking for providers....(rescan=${rescan})`)
        this.resProvider= {}  
        this.resourceTypes.forEach( (rt:string)=> {
            this.resProvider[rt]= this.getResourceProviderFor(rt)
        })
        debug(this.resProvider)
        
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
        debug('** resType:', resType)
        debug('** resId:', resId)
        
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
                    this.sendDelta(req.resourceType, req.resourceId, null)
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
                    this.sendDelta(req.resourceType, id, req.body.value)
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
                    this.sendDelta(req.resourceType, req.resourceId, req.body.value)
                    return {statusCode: 200, message: `Resource (${req.resourceId}) updated.`}  
                }
                else {
                    return {statusCode: 400, message: `Error updating resource (${req.resourceId})!` }
                }
            }
        }
    }

    // ** send delta message with resource  PUT, POST, DELETE action result
    private sendDelta(type:string, id:string, value:any):void {
        debug(`** Sending Delta: resources.${type}.${id}`)
        this.server.handleMessage('signalk-resources', {
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

}
