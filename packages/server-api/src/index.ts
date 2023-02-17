import { IRouter } from 'express'
import { PropertyValuesCallback } from './propertyvalues'

export interface Position {
  latitude: number
  longitude: number
  altitude?: number
}

export interface ActionResult {
  state: 'COMPLETED' | 'PENDING' | 'FAILED'
  statusCode: number
  message?: string
  resultStatus?: number
}

export * from './deltas'
import { DeltaMessage, DeltaSubscription } from './deltas'

export * from './resourcetypes'
export * from './resourcesapi'
import { ResourceProviderRegistry } from './resourcesapi'

export * from './autopilotapi'
import { AutopilotProviderRegistry } from './autopilotapi'

export { PropertyValue, PropertyValues, PropertyValuesCallback } from './propertyvalues'

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

export interface PluginServerApp extends PropertyValuesEmitter {
  config: {
    configPath: string,
    vesselName: string | null,
    vesselUUID: string | null,
    settings: object
  }
  error: (msg: string) => void
  debug: (msg: string) => void
  readPluginOptions: () => object
  savePluginOptions: (options: object, callback: () => void) => void
  getDataDirPath: () => string
  getSelfPath: (path: string) => any
  getPath: (path: string) => any
  getSerialPorts: () => Promise<{
    byId: string[]
    byPath: string[]
    byOpenPlotter: string[]
    serialports: any
  }>
  getOpenApi: () => string
  setPluginStatus: (status: string) => void
  setPluginError: (status: string) => void
  handleMessage: (
    id: string | null,
    msg: DeltaMessage,
    version?: 'v1' | 'v2'
  ) => void
  subscriptionmanager: {
    subscribe: (
      subscribe: DeltaSubscription,
      unsubscribes: Array<() => void>,
      errorCallback: (error: any) => void,
      deltaCallback: (delta: DeltaMessage) => void
    ) => void
  }
  registerPutHandler: (
    context: string,
    path: string,
    callback: (
      context: string,
      path: string,
      value: any,
      actionResultCallback: (actionResult: ActionResult) => void
    ) => ActionResult
  ) => void
  registerDeltaInputHandler: (
    delta: DeltaMessage, 
    next: (delta: DeltaMessage) => void
  ) => void
  streambundle: {
    getSelfBus: (path: string | void) => any,
    getSelfStream : (path: string | void) => any,
    getBus : (path: string | void) => any,
    getAvailablePaths: () => Array<string>
  }

  /**
   * FIX ME: Should these be included as they are mentioned in PLUGINS.md?
   */
  emit: (type: string, value: string | object) => void
  on: (msgType: string, callback: () => void) => void
}

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
