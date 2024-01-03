import path from 'node:path'

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

export enum SKVersion {
  v1 = 'v1',
  v2 = 'v2'
}

export type Brand<K, T> = K & { __brand: T }

export * from './deltas'
export * from './coursetypes'
export * from './resourcetypes'
export * from './resourcesapi'
export { ResourceProviderRegistry } from './resourcesapi'
import { ResourceProviderRegistry } from './resourcesapi'
import { PointDestination, RouteDestination, CourseInfo } from './coursetypes'

export * from './autopilotapi'

export {
  PropertyValue,
  PropertyValues,
  PropertyValuesCallback
} from './propertyvalues'

type Unsubscribe = () => void
export interface PropertyValuesEmitter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emitPropertyValue: (name: string, value: any) => void
  onPropertyValues: (name: string, cb: PropertyValuesCallback) => Unsubscribe
}

/**
 * This is the API that the server exposes in the app object that
 * is passed in Plugin "constructor" call.
 * 
 *
 * INCOMPLETE, work in progress.
 */

export interface PluginServerApp
  extends PropertyValuesEmitter,
    ServerAPI {}

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
   * Called to start the plugin with the latest saved configuration. Called
   * - for enabled (by configuration or by default) plugins during server startup
   * - when the configuration of an enabled plugin has been updated
   * in the admin UI. The server first stops the plugin and then restarts it
   * with the new configuration
   * - when a plugin is Enabled in the admin UI
   * @param configuration 
   * @param restart is a function that a plugin's code can call to set configuration
   * to new values to restart the plugin
   */
  start: (configuration: object, restart: (newConfiguration: object) => void) => void

  /**
   * Called to stop the plugin. Called when the user disables the plugin in the admin UI.
   * Also called when new configuration is saved from the Admin UI to first stop the
   * plugin, followed by a `start` call.
   */
  stop: () => void

  /**
   * 
   * @returns A JSON Schema object or a function returning one. The schema describes
   * the structure of the Plugin's configuration and is used to render the plugin configuration
   * form in *Server => Plugin Config*
   */
  schema: () => object | object

  /**
   * Optional additional configuration UI customisation
   * 
   * @returns An object defining the attributes of the UI components displayed in the Plugin Config screen
   */
  uiSchema?: () => object | object

  /**
   * Register additional HTTP routes handled by the plugin
   * @param router Express Router object
   * @returns 
   */
  registerWithRouter?: (router: IRouter) => void
  signalKApiRoutes?: (router: IRouter) => IRouter
  enabledByDefault?: boolean

  /**
   * A plugin can provide OpenApi documentation for http methods it exposes
   * @returns OpenApi description of the plugin's http endpoints.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getOpenApi?: () => any
}

export type DeltaInputHandler = (
  delta: object,
  next: (delta: object) => void
) => void

export interface Ports {
  byId: string[]
  byPath: string[]
  byOpenPlotter: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serialports: any
}

export interface Metadata {
  units?: string
  description?: string
}

/**
 * These are the methods that a Plugin can use to interact with
 * the server: get and produce data, log debug and error messages,
 * report the plugin's status and handle plugin's configuration.
 */
export interface ServerAPI extends ResourceProviderRegistry {
  /**
   * Get the value by path for self vessel.
   * @param path 
   * @returns 
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSelfPath: (path: string) => any

  /**
   * 
   * @param path 
   * @returns 
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getPath: (path: string) => any
  getMetadata: (path: string) => Metadata | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  putSelfPath: (aPath: string, value: any, updateCb: () => void) => Promise<any>
  putPath: (
    aPath: string,
    value: number | string | object | boolean,
    updateCb: (err?: Error) => void,
    source: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>
  //TSTODO convert queryRequest to ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryRequest: (requestId: string) => Promise<any>

  /**
   * Log an error 
   * @group Logging & Status Reporting
   * @param msg 
   */
  error: (msg: string) => void

  /**
   * Log a diagnostic debug message. Ignored, unless plugin's debug logging
   * is enabled in *Plugin Config*.
   * @group Logging & Status Reporting
   * @param msg 
   */
  debug: (msg: string) => void

  /**
   * A plugin can report that it has handled output messages. This will
   * update the output message rate and icon in the Dashboard.
   *
   * This is for traffic that the plugin is sending outside the server,
   * for example network packets, http calls or messages sent to
   * a broker. This should NOT be used for deltas that the plugin
   * sends with handleMessage, they are reported as input from the
   * server's perspective.
   * @group Logging & Status Reporting
   *
   * @param count optional count of handled messages between the last
   * call and this one. If omitted the call will count as one output
   * message.
   */
  reportOutputMessages: (count?: number) => void

  /**
   * Set plugin status message (displayed in the Dashboard)
   * @group Logging & Status Reporting
   * @param msg 
   */
  setPluginStatus: (msg: string) => void

  /**
   * Set plugin error message (displayed in the Dashboard)
   * @group Logging & Status Reporting
   * @param msg Pass undefined to erase a previously set error status
   */
  setPluginError: (msg?: string) => void

  registerDeltaInputHandler: (handler: DeltaInputHandler) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleMessage: (id: string, msg: any, skVersion?: SKVersion) => void
  savePluginOptions: (
    configuration: object,
    cb: (err: NodeJS.ErrnoException | null) => void
  ) => void
  readPluginOptions: () => object
  getDataDirPath: () => string
  registerPutHandler: (
    context: string,
    path: string,
    callback: () => void,
    source: string
  ) => void
  registerActionHandler: (
    context: string,
    path: string,
    callback: () => void,
    source: string
  ) => void
  registerHistoryProvider: (provider: {
    hasAnydata: (options: object, cb: (hasResults: boolean) => void) => void
    getHistory: (
      date: Date,
      path: string,
      cb: (deltas: object[]) => void
    ) => void
    streamHistory: (
      // TSTODO propert type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spark: any,
      options: object,
      onDelta: (delta: object) => void
    ) => void
  }) => void
  getSerialPorts: () => Promise<Ports>

  /**
   * Get information about the current course
   * @group Course
   */
  getCourse: () => Promise<CourseInfo>

  /**
   * Clear current destination
   * @group Course
   */
  clearDestination: () => Promise<void>

  /**
   * Set destination
   * @group Course
   * @param destination PointDestination: either a waypoint with href to the 
   * waypoint resource or a position with longitude and latitude. 
   * @returns 
   */
  setDestination: (
    destination: (PointDestination & { arrivalCircle?: number }) | null
  ) => Promise<void>

  /**
   * Activate a route
   * @group Course
   * @param dest A route resource href with options to rever the route,
   * set next point in the route and set arrival circle.
   * @returns Promise that is fulfilled when the route has been successfully
   * activated.
   */
  activateRoute: (dest: RouteDestination | null) => Promise<void>
}

export const SERVER_API_DOCS_PATH = path.resolve(__dirname, '../docs')