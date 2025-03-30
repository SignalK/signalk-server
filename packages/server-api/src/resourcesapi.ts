export type SignalKResourceType =
  | 'routes'
  | 'waypoints'
  | 'notes'
  | 'regions'
  | 'charts'

export const SIGNALKRESOURCETYPES: SignalKResourceType[] = [
  'routes',
  'waypoints',
  'notes',
  'regions',
  'charts'
]
export const isSignalKResourceType = (s: string) =>
  SIGNALKRESOURCETYPES.includes(s as SignalKResourceType)

export type ResourceType = SignalKResourceType | string

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

export interface ResourceProvider {
  type: ResourceType
  methods: ResourceProviderMethods
}

export interface ResourceProviderMethods {
  listResources: (query: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) => Promise<{ [id: string]: any }>
  getResource: (id: string, property?: string) => Promise<object>
  setResource: (
    id: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: { [key: string]: any }
  ) => Promise<void>
  deleteResource: (id: string) => Promise<void>
}

export interface ResourceProviderRegistry {
  /**
   * Used by _Resource Provider plugins_ to register each resource type it handles.
   * See [`Resource Provider Plugins`](../../../docs/src/develop/plugins/resource_provider_plugins.md#registering-as-a-resource-provider) for details.
   *
   * @category Resources API
   */
  registerResourceProvider: (provider: ResourceProvider) => void

  /**
   * Access the Resources API to list, get, set, and delete resources.
   *
   * @category Resources API
   */
  resourcesApi: ResourcesApi
}
