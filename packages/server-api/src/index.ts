import { IRouter } from 'express'
import { PropertyValuesCallback } from './propertyvalues'

export { PropertyValue, PropertyValues, PropertyValuesCallback } from './propertyvalues'

export type SignalKResourceType= 'routes' | 'waypoints' |'notes' |'regions' |'charts'
export type ResourceType = SignalKResourceType | string

export interface ResourcesApi {
  register: (pluginId: string, provider: ResourceProvider) => void;
  unRegister: (pluginId: string) => void;
  getResource: (resType: SignalKResourceType, resId: string) => any;
}

export interface ResourceProvider {
  types: ResourceType[]
  methods: ResourceProviderMethods
}

export interface ResourceProviderMethods {
  pluginId?: string
  listResources: (type: ResourceType, query: { [key: string]: any }) => Promise<{[id: string]: any}>
  getResource: (type: ResourceType, id: string) => Promise<{[id: string]: any}>
  setResource: (
    type: ResourceType,
    id: string,
    value: { [key: string]: any }
  ) => Promise<void>
  deleteResource: (type: ResourceType, id: string) => Promise<void>
}

export interface ResourceProviderRegistry {
  registerResourceProvider: (provider: ResourceProvider) => void;
}

type Unsubscribe = () => {}
export interface PropertyValuesEmitter {
  emitPropertyValue: (name: string, value: any) => void
  onPropertyValues: (name: string, cb: PropertyValuesCallback) => Unsubscribe
}

/**
 * This is the API that the server exposes in the app object that
 * is passed in Plugin "constructor" call.
 *
 * INCOMPLETE, work in progress.
 */

 export interface PluginServerApp extends PropertyValuesEmitter, ResourceProviderRegistry {}

/**
 * This is the API that a [server plugin](https://github.com/SignalK/signalk-server/blob/master/SERVERPLUGINS.md) must implement.
 *
 * Typing is INCOMPLETE.
 */
export interface Plugin {
  /**
   * Used to identify the plugin in the server, for example
   * when storing the plugin's configuration and in http endpoints.
   */
  id: string

  /**
   * Human oriented name for the plugin. This is used in the
   * server's plugin configuration user interface.
   */
  name: string

  /**
   * Called to start the plugin with latest saved configuration. Called
   * - for enabled (by configuration or by default) plugins during server startup
   * - after stop() when the configuration of an enabled plugin has been updated
   * in the admin UI
   * - when a plugin is Enabled in the admin UI
   */
  start: (config: object, restart: (newConfiguration: object) => void) => any

  /**
   * Called to stop the plugin. Called when the user disables the plugin in the admin UI.
   */
  stop: () => void
  schema: () => object | object
  uiSchema?: () => object | object
  registerWithRouter?: (router: IRouter) => void
  signalKApiRoutes?: (router: IRouter) => IRouter
  enabledByDefault?: boolean
}
