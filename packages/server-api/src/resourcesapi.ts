/** @category  Resources API */
export type SignalKResourceType =
  | 'routes'
  | 'waypoints'
  | 'notes'
  | 'regions'
  | 'charts'

/**
 * @hidden
 * @category  Resources API */
export const SIGNALKRESOURCETYPES: SignalKResourceType[] = [
  'routes',
  'waypoints',
  'notes',
  'regions',
  'charts'
]
/** @category  Resources API */
export const isSignalKResourceType = (s: string) =>
  SIGNALKRESOURCETYPES.includes(s as SignalKResourceType)

/** @category  Resources API */
export type ResourceType = SignalKResourceType | string

/** @category  Resources API */
export interface ResourcesApi {
  register(pluginId: string, provider: ResourceProvider): void
  unRegister(pluginId: string): void

  /**
   * Retrieve collection of resource entries of the supplied resource_type matching the provided criteria.
   *
   * > [!note]
   * > Requires a registered Resource Provider. See {@link ResourceProviderRegistry.registerResourceProvider}.
   *
   * @example
   * ```javascript
   * app.resourcesApi.listResources(
   *   'waypoints',
   *   {region: 'fishing_zone'}
   * ).then (data => {
   *   // success
   *   console.log(data);
   *   ...
   * }).catch (error) {
   *   // handle error
   *   console.log(error.message);
   *   ...
   * }
   * ```
   *
   * @param resType - A {@link SignalKResourceType} or user defined resource type.
   * @param params - Object containing `key | value` pairs representing the criteria by which to filter the returned entries.
   *   > [!note]
   *   > The registered Resource Provider must support the supplied parameters for results to be filtered.
   * @param providerId - The id of the Resource Provider plugin to use to complete the request.
   */
  listResources(
    resType: SignalKResourceType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: { [key: string]: any },
    providerId?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ [id: string]: any }>

  /**
   * Retrieve the resource with the supplied SignalK resource_type and resource_id.
   *
   * > [!note]
   * > Requires a registered Resource Provider. See {@link ResourceProviderRegistry.registerResourceProvider}.
   *
   * @example
   * ```javascript
   * try {
   *   const waypoint = await app.resourcesApi.getResource('waypoints', 'ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a');
   *   // success
   * } catch (error) {
   *   // handle error
   *   console.error(error);
   *   // ...
   * }
   * ```
   *
   * @param resType - A {@link SignalKResourceType} or user defined resource type.
   * @param resId - The resource identifier. _(e.g. `ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a`)_
   * @param providerId - The id of the Resource Provider plugin to use to complete the request. Most commonly used for creating a new resource entry when more than one provider is registered for the specified resource type.
   */
  getResource(
    resType: ResourceType,
    resId: string,
    providerId?: string
  ): Promise<object>

  /**
   * Create / update value of the resource with the supplied SignalK resource_type and resource_id.
   *
   * > [!note]
   * > Requires a registered Resource Provider. See {@link ResourceProviderRegistry.registerResourceProvider}.
   *
   * @example
   * ```javascript
   * app.resourcesApi.setResource(
   *   'waypoints',
   *   'ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a',
   *   {
   *     "name": "My Waypoint",
   *     "feature": {
   *       "type":"Feature",
   *       "geometry": {
   *         "type": "Point",
   *         "coordinates": [138.5, -38.6]
   *       },
   *       "properties":{}
   *     }
   *   }
   * ).then ( () => {
   *   // success
   *   ...
   * }).catch (error) {
   *   // handle error
   *   console.log(error.message);
   *   ...
   * }
   * ```
   *
   * @param resType - A {@link SignalKResourceType} or user defined resource type.
   * @param resId - The resource identifier. _(e.g. `ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a`)_
   * @param data - A complete and valid resource record.
   * @param providerId - The id of the Resource Provider plugin to use to complete the request. Most commonly used for creating a new resource entry when more than one provider is registered for the specified resource type.
   */
  setResource(
    resType: SignalKResourceType,
    resId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { [key: string]: any },
    providerId?: string
  ): Promise<void>

  /**
   * Delete the resource with the supplied SignalK resource_type and resource_id.
   *
   * > [!note]
   * > Requires a registered Resource Provider. See {@link ResourceProviderRegistry.registerResourceProvider}.
   *
   * @example
   * ```javascript
   * app.resourcesApi.deleteResource(
   *   'notes',
   *   'ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'
   * ).then ( () => {
   *   // success
   *   ...
   * }).catch (error) {
   *   // handle error
   *   console.log(error.message);
   *   ...
   * }
   * ```
   *
   * @param resType - A {@link SignalKResourceType} or user defined resource type.
   * @param resId - The resource identifier. _(e.g. `ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a`)_
   * @param providerId - The id of the Resource Provider plugin to use to complete the request.
   */
  deleteResource(
    resType: SignalKResourceType,
    resId: string,
    providerId?: string
  ): Promise<void>
}

/** @category  Resources API */
export interface WithResourcesApi {
  resourcesApi: ResourcesApi
}

/** @category  Resources API */
export interface ResourceProvider {
  /**
   * The resource type provided for by the plugin.These can be either __Standard__ _(Signal K defined)_ types defined in {@link SignalKResourceType},  or __Custom__ _(user defined)_ resource types _(e.g. `'fishingZones'`)_
   */
  type: ResourceType

  /**
   * An object implementing the `ResourceProviderMethods` interface defining the functions to which resource requests are passed by the SignalK server.
   */
  methods: ResourceProviderMethods
}

/** @category  Resources API */
export interface ResourceProviderMethods {
  /**
   * This method is called when a request is made for resource entries that match a specific criteria.
   *
   * > [!NOTE]
   * > It is the responsibility of the resource provider plugin to filter the resources returned as per the supplied query parameters._
   *
   * @example
   * Return waypoints within the bounded area with lower left corner at E5.4 N25.7 & upper right corner E6.9 & N31.2:
   * ```
   * GET /signalk/v2/api/resources/waypoints?bbox=[5.4,25.7,6.9,31.2]
   * ```
   * _ResourceProvider method invocation:_
   * ```javascript
   * listResources(
   *   {
   *     bbox: '5.4,25.7,6.9,31.2'
   *   }
   * );
   * ```
   *
   * _Returns:_
   * ```JSON
   * {
   *   "07894aba-f151-4099-aa4f-5e5773734b69": {
   *     "name":"my Point",
   *     "description":"A Signal K waypoint",
   *     "distance":124226.65183615577,
   *     "feature":{
   *       "type":"Feature",
   *       "geometry":{
   *         "type":"Point",
   *         "coordinates":[5.7,26.4]
   *       },
   *       "properties":{}
   *     },
   *     "timestamp":"2023-01-01T05:02:54.561Z",
   *     "$source":"resources-provider"
   *   },
   *   "0c894aba-d151-4099-aa4f-be5773734e99": {
   *     "name":"another point",
   *     "description":"Another Signal K waypoint",
   *     "distance":107226.84,
   *     "feature":{
   *       "type":"Feature",
   *       "geometry":{
   *         "type":"Point",
   *         "coordinates":[6.1,29.43]
   *       },
   *       "properties":{}
   *     },
   *     "timestamp":"2023-01-01T05:02:54.561Z",
   *     "$source":"resources-provider"
   *   }
   * }
   * ```
   *
   * @param query - Object containing `key | value` pairs representing the parameters by which to filter the returned entries. _e.g. {region: 'fishing_zone'}_
   */
  listResources(query: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<{ [id: string]: any }>

  /**
   * This method is called when a request is made for a specific resource entry with the supplied `id`. If `property` is supplied then the value of the resource property is returned. If there is no resource associated with the id the call should return Promise.reject.
   *
   * @param id - String containing the target resource entry id. _(e.g. '07894aba-f151-4099-aa4f-5e5773734b99')_
   * @param property -  Name of resource property for which to return the value (in dot notation). _e.g. feature.geometry.coordinates_
   *
   * @example Resource request:
   *
   * ```
   * GET /signalk/v2/api/resources/routes/07894aba-f151-4099-aa4f-5e5773734b99
   * ```
   * _ResourceProvider method invocation:_
   * ```javascript
   * getResource(
   *   '07894aba-f151-4099-aa4f-5e5773734b99'
   * );
   * ```
   *
   * _Returns:_
   * ```JSON
   * {
   *   "name":"myRoute",
   *   "description":"A Signal K route",
   *   "distance":124226.65183615577,
   *   "feature":{
   *     "type":"Feature",
   *     "geometry":{
   *       "type":"LineString",
   *       "coordinates":[[-8,-8],[-8.5,-8],[-8.5,-8.4],[-8.7,-8.3]]
   *     },
   *     "properties":{}
   *   },
   *   "timestamp":"2023-01-01T05:02:54.561Z",
   *   "$source":"resources-provider"
   * }
   * ```
   *
   * @example resource property value request:
   * ```
   * GET /signalk/v2/api/resources/routes/07894aba-f151-4099-aa4f-5e5773734b99/feature/geometry/type
   * ```
   * _ResourceProvider method invocation:_
   * ```javascript
   * getResource(
   *   '07894aba-f151-4099-aa4f-5e5773734b99',
   *   'feature.geometry.type'
   * );
   * ```
   *
   * _Returns:_
   * ```JSON
   * {
   *   "value": "LineString",
   *   "timestamp":"2023-01-01T05:02:54.561Z",
   *   "$source":"resources-provider"
   * }
   * ```
   *
   */
  getResource(id: string, property?: string): Promise<object>

  /**
   * This method is called when a request is made to save / update a resource entry with the supplied id. The supplied data is a complete resource record.
   *
   * @param id - String containing the id of the resource entry created / updated. _e.g. '07894aba-f151-4099-aa4f-5e5773734b99'_
   * @param value - Resource data to be stored.
   *
   * @example PUT resource request:
   * ```
   * PUT /signalk/v2/api/resources/routes/07894aba-f151-4099-aa4f-5e5773734b99 {resource_data}
   * ```
   * _ResourceProvider method invocation:_
   *
   * ```javascript
   * setResource(
   *   '07894aba-f151-4099-aa4f-5e5773734b99',
   *   {
   *     name: 'test route',
   *     distance': 8000,
   *     feature: {
   *       type: 'Feature',
   *       geometry: {
   *         type: 'LineString',
   *         coordinates: [[138.5, -38.6], [138.7, -38.2], [138.9, -38.0]]
   *       },
   *       properties:{}
   *     }
   *   }
   * );
   * ```
   *
   * @example POST resource request:
   * ```
   * POST /signalk/v2/api/resources/routes {resource_data}
   * ```
   * _ResourceProvider method invocation:_
   *
   * ```javascript
   * setResource(
   *   '<server_generated_id>',
   *   {
   *     name: 'test route',
   *     distance': 8000,
   *     feature: {
   *       type: 'Feature',
   *       geometry: {
   *         type: 'LineString',
   *         coordinates: [[138.5, -38.6], [138.7, -38.2], [138.9, -38.0]]
   *       },
   *       properties:{}
   *     }
   *   }
   * );
   * ```
   *
   */
  setResource(
    id: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: { [key: string]: any }
  ): Promise<void>

  /**
   * This method is called when a request is made to remove the specific resource entry with the supplied resource id.
   *
   * @param id - String containing the target resource entry id. _e.g. '07894aba-f151-4099-aa4f-5e5773734b99'_
   *
   * @example: resource request:
   *
   * ```
   * DELETE /signalk/v2/api/resources/routes/07894aba-f151-4099-aa4f-5e5773734b99
   * ```
   * _ResourceProvider method invocation:_
   *
   * ```javascript
   * deleteResource(
   *   '07894aba-f151-4099-aa4f-5e5773734b99'
   * );
   * ```
   */
  deleteResource(id: string): Promise<void>
}

/** @category  Resources API */
export interface ResourceProviderRegistry {
  /**
   * Used by _Resource Provider plugins_ to register each resource type it handles.
   * See [`Resource Provider Plugins`](../../../docs/develop/plugins/resource_provider_plugins.md#registering-as-a-resource-provider) for details.
   *
   * @category Resources API
   */
  registerResourceProvider(provider: ResourceProvider): void

  /**
   * Access the Resources API to list, get, set, and delete resources.
   *
   * @category Resources API
   */
  resourcesApi: ResourcesApi
}
