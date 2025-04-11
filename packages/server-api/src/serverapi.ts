import {
  SKVersion,
  AutopilotProviderRegistry,
  Features,
  PropertyValuesEmitter,
  ResourceProviderRegistry,
  WeatherProviderRegistry,
} from '.'
import { CourseApi } from './course'

/**
 * SignalK server provides an interface to allow {@link Plugin | Plugins } to:
 *
 * - Discover Features.
 * - Access / update the full data model
 * - send / receive deltas (updates)
 * - Interact with APIs
 * - Expose HTTP endpoints
 *
 * These functions are available via the app object passed to the plugin when it is invoked.
 *
 * > [!WARNING]
 * > Typing is incomplete. If you find a missing or inaccurate type, please [report it](https://github.com/SignalK/signalk-server/issues/1917).
 */
export interface ServerAPI
  extends PropertyValuesEmitter,
    ResourceProviderRegistry,
    AutopilotProviderRegistry,
    WeatherProviderRegistry,
    Features,
    CourseApi {
  /**
   * Returns the entry for the provided path starting from `vessels.self` in the full data model.
   *
   * @example
   * ```ts
   * let uuid = app.getSelfPath('uuid');
   * // Note: This is synonymous with app.getPath('vessels.self.uuid')
   *
   * app.debug(uuid);
   * // urn:mrn:signalk:uuid:a9d2c3b1-611b-4b00-8628-0b89d014ed60
   * ```
   *
   * @category Data Model
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSelfPath(path: string): any

  /**
   * Returns the entry for the provided path starting from the `root` of the full data model.
   *
   * @example
   * ```javascript
   * let baseStations = app.getPath('shore.basestations');
   *
   * // baseStations:
   * {
   *   'urn:mrn:imo:mmsi:2766140': {
   *     url: 'basestations',
   *     navigation: { position: {latitude: 45.2, longitude: 76.4} },
   *     mmsi: '2766140'
   *   },
   *   'urn:mrn:imo:mmsi:2766160': {
   *     url: 'basestations',
   *     navigation: { position: {latitude: 46.9, longitude: 72.22} },
   *     mmsi: '2766160'
   *   }
   * }
   * ```
   *
   * @category Data Model
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getPath(path: string): any // TODO: return SignalK data model type

  /**
   * @category Data Model
   */
  getMetadata(path: string): Metadata | undefined

  /**
   * @category Data Model
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  putSelfPath(aPath: string, value: any, updateCb: () => void): Promise<any>

  /**
   * @category Data Model
   */
  putPath(
    aPath: string,
    value: number | string | object | boolean,
    updateCb: (err?: Error) => void,
    source: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any>

  //TSTODO convert queryRequest to ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryRequest(requestId: string): Promise<any>

  /**
   * @category Status and Debugging
   */
  error(msg: string): void

  /**
   * Log debug messages.
   *
   * This function exposes the `debug` method from the [debug module](https://www.npmjs.com/package/debug).
   * The npm module name is used as the debug name.
   *
   * `app.debug()` can take any type and will serialize it before outputting.
   *
   * > [!note]
   * > Do not use `debug` from the debug module directly! Using `app.debug()` provided by the server ensures that the plugin taps into the server's debug logging system, including the helper switches in Admin UI's Server Log page.
   *
   * @category Status and Debugging
   */
  debug(msg: string): void

  /**
   * Register a function to intercept all delta messages _before_ they are processed by the server.
   *
   * The callback function should call `next(delta)` with either:
   * - A modified delta (if it wants to alter the incoming delta)
   * - With the original delta to process it normally.
   *
   * > [!important]
   * > Not calling `next(delta)` will cause the incoming delta to be dropped and will only show in delta statistics.
   *
   * Other, non-delta messages produced by provider pipe elements are emitted normally.
   *
   * @example
   * ```javascript
   * app.registerDeltaInputHandler((delta, next) => {
   *   delta.updates.forEach(update => {
   *     update.values.forEach(pathValue => {
   *       if(pathValue.startsWith("foo")) {
   *         pathValue.path = "bar"
   *       }
   *     })
   *   })
   *   next(delta)
   * });
   * ```
   *
   * @category Data Model
   */
  registerDeltaInputHandler(handler: DeltaInputHandler): void

  /**
   * Set the current status of the plugin that is displayed in the plugin configuration UI and the Dashboard.
   *
   * The `msg` parameter should be a short text message describing the current status of the plugin.
   *
   * @example
   * ```javascript
   * app.setPluginStatus('Initializing');
   * // Do something
   * app.setPluginStatus('Done initializing');
   * ```
   *
   * _Note: Replaces deprecated `setProviderStatus()`_
   *
   * @category Status and Debugging
   */
  setPluginStatus(msg: string): void

  /**
   * Set the current error status of the plugin that is displayed in the plugin configuration UI and the Dashboard.
   *
   * The `msg` parameter should be a short text message describing the current status of the plugin.
   *
   * @example
   * ```javascript
   * app.setPluginError('Error connecting to database');
   * ```
   *
   * _Note: Replaces deprecated `setProviderError()`_
   *
   * @category Status and Debugging
   */
  setPluginError(msg: string): void

  /**
   * Emit a delta message.
   *
   * _Note: These deltas are handled by the server in the same way as any other incoming deltas._
   *
   * @example
   * ```javascript
   * app.handleMessage('my-signalk-plugin', {
   *   updates: [
   *     {
   *       values: [
   *         {
   *           path: 'navigation.courseOverGroundTrue',
   *           value: 1.0476934
   *         }
   *       ]
   *     }
   *   ]
   * });
   * ```
   *
   * Plugins emitting deltas that use Signal K v2 paths (like the [Course API](http://localhost:3000/admin/openapi/?urls.primaryName=course) paths) should call `handleMessage` with the optional `skVersion` parameter set to `v2`. This prevents v2 API data getting mixed in v1 paths' data in full data model & the v1 http API.
   *
   * Omitting the `skVersion` parameter will cause the delta to be sent as `v1`.
   *
   * @param skVersion Optional parameter to specify the Signal K version of the delta.
   * @category Data Model
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleMessage(id: string, msg: any, skVersion?: SKVersion): void

  /**
   * Save changes to the plugin's configuration options.
   *
   * @example
   * ```javascript
   * let options = {
   *   myConfigValue = 'Something the plugin calculated'
   * };
   *
   * app.savePluginOptions(options, () => {app.debug('Plugin options saved')});
   * ```
   *
   * @category Configuration
   */
  savePluginOptions(
    configuration: object,
    cb: (err: NodeJS.ErrnoException | null) => void
  ): void

  /**
   * Read the stored plugin configuration options.
   *
   * @example
   * ```javascript
   * let options = app.readPluginOptions();
   * ```
   *
   * @category Configuration
   */
  readPluginOptions(): object

  /**
   * Returns the full path of the directory where the plugin can persist its internal data, e.g. data files, etc.
   *
   * @example
   * ```javascript
   * let myDataFile = require('path').join( app.getDataDirPath(), 'somedatafile.ext')
   * ```
   * @category Configuration
   */
  getDataDirPath(): string

  /**
   * Register a handler to action [`PUT`](http://signalk.org/specification/1.3.0/doc/put.html) requests for a specific path.
   *
   * The action handler can handle the request synchronously or asynchronously.
   *
   * The `callback` parameter should be a function which accepts the following arguments:
   * - `context`
   * - `path`
   * - `value`
   * - `callback`
   *
   * For synchronous actions, the handler must return a value describing the response of the request:
   *
   * ```javascript
   * {
   *   state: 'COMPLETED',
   *   statusCode: 200
   * }
   * ```
   *
   *  or
   *
   *  ```javascript
   * {
   *   state:'COMPLETED',
   *   statusCode: 400,
   *   message:'Some Error Message'
   * }
   *  ```
   *
   *  The `statusCode` value can be any valid HTTP response code.
   *
   * For asynchronous actions, that may take considerable time to complete and the requester should not be kept waiting for the result, the handler must return:
   *
   * ```javascript
   * { state: 'PENDING' }
   * ```
   *
   * When the action has completed the handler should call the `callback` function with the result:
   *
   * ```javascript
   * callback({ state: 'COMPLETED', statusCode: 200 })
   * ```
   * or
   *
   * ```javascript
   * callback({
   *   state:'COMPLETED',
   *   statusCode: 400,
   *   message:'Some Error Message'
   * })
   * ```
   *
   * _Example: Synchronous response:_
   * ```javascript
   * function myActionHandler(context, path, value, callback) {
   *   if(doSomething(context, path, value)){
   *     return { state: 'COMPLETED', statusCode: 200 };
   *   } else {
   *     return { state: 'COMPLETED', statusCode: 400 };
   *   }
   * }
   *
   * plugin.start = (options) => {
   *   app.registerPutHandler('vessels.self', 'some.path', myActionHandler, 'somesource.1');
   * }
   * ```
   *
   * _Example: Asynchronous response:_
   * ```javascript
   * function myActionHandler(context, path, value, callback) {
   *
   *   doSomethingAsync(context, path, value, (result) =>{
   *     if(result) {
   *       callback({ state: 'COMPLETED', result: 200 })
   *     } else {
   *       callback({ state: 'COMPLETED', result: 400 })
   *     }
   *   });
   *
   *   return { state: 'PENDING' };
   * }
   *
   * plugin.start = (options) => {
   *   app.registerPutHandler('vessels.self', 'some.path', myActionHandler);
   * }
   * ```
   */
  registerPutHandler(
    context: string,
    path: string,
    callback: () => void,
    source: string
  ): void

  registerActionHandler(
    context: string,
    path: string,
    callback: () => void,
    source: string
  ): void

  registerHistoryProvider(provider: {
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
  }): void

  /**
   * Returns Ports object which contains information about the serial ports available on the machine.
   *
   * @category Serial Ports
   */
  getSerialPorts(): Promise<Ports>

  /**
   * Report to the server that the plugin has sent data to other hosts, which will update the output message rate and
   * icon in the Dashboard.
   *
   * _Note: This function is for use when the plugin is sending data to hosts other than the Signal K server (e.g.
   * network packets, http requests or messages sent to a broker)._
   *
   * _**This function should NOT be used for deltas that the plugin sends with `handleMessage()`!**_
   *
   * @example
   * ```javascript
   * app.reportOutputMessages(54);
   * ```
   *
   * @param count - number of handled messages between the last
   * call and this one. If omitted the call will count as one output
   * message.
   *
   * @category Status and Debugging
   */
  reportOutputMessages(count?: number): void
}

/**
 * @deprecated Use {@link ServerAPI} instead.
 */
export type PluginServerApp = ServerAPI

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
