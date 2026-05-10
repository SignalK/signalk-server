import { IRouter } from 'express'
import { IncomingMessage } from 'http'
import { Duplex } from 'stream'
import { ServerAPI } from './serverapi'

/**
 * Handler for a WebSocket `upgrade` request, matching Node.js's HTTP server
 * `upgrade` event signature. The plugin is responsible for completing the
 * handshake (e.g. via a `ws.Server({ noServer: true })` plus
 * `wss.handleUpgrade(request, socket, head, ...)`) or destroying the socket.
 *
 * @category Server API
 */
export type PluginUpgradeHandler = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer
) => void

/**
 * Registry passed to {@link Plugin.registerWithUpgrade} that lets a plugin
 * subscribe to WebSocket `upgrade` events on paths under its own plugin
 * route (`/plugins/<pluginId>`).
 *
 * @category Server API
 */
export interface PluginUpgradeRouter {
  /**
   * Register a handler for `upgrade` requests whose URL path, relative to
   * the plugin's route, matches `pattern` as a prefix. For example, with
   * `pattern = '/socket'` a plugin with id `my-plugin` will receive
   * upgrades for `/plugins/my-plugin/socket` and any sub-paths.
   *
   * The plugin is responsible for completing the WebSocket handshake or
   * closing the socket; the server only dispatches.
   */
  upgrade(pattern: string, handler: PluginUpgradeHandler): void
}

/**
 * A plugin constructor is the interface that all plugins must export.
 * It is called by the server when the server is starting up.
 *  @category Server API
 */
export type PluginConstructor = (app: ServerAPI) => Plugin

/**
 * Plugins are components that extend functionality of the server and can be installed via the Signal K AppStore.
 *
 * A plugin can:
 * - Interact with the {@link ServerAPI}, including the full data model.
 * - Provide a [webapp interface](../../../docs/develop/webapps.md).
 * - Provide access to resources such as `route,` `waypoint`,`POI`, or `charts` via the _[Resources API](../../../docs/develop/rest-api/resources_api.md)_ by operating as a _[Resources Provider Plugin](../../../docs/develop/plugins/resource_provider_plugins.md)_.
 * - Perform common autopilot operations by acting as an [Autopilot Provider Plugin](../../../docs/develop/plugins/autopilot_provider_plugins.md)
 * - Perform course calculations by integrating with the [Course API](../../../docs/develop/rest-api/course_api.md).
 * - process requests
 *
 * > [!WARNING]
 * > Typing is incomplete. If you find a missing or inaccurate type, please [report it](https://github.com/SignalK/signalk-server/issues/1917).
 *
 * @example
 *
 * Signal K server plugins are NodeJs `javascript` or `typescript` projects that return an object that implements this interface.
 *
 * ```typescript
 * import { Plugin, ServerAPI } from '@signalk/server-api';
 *
 * module.exports = (app: ServerAPI): Plugin => {
 *   const plugin: Plugin = {
 *     id: 'my-signalk-plugin',
 *     name: 'My Great Plugin',
 *     start: (settings, restartPlugin) => {
 *       // start up code goes here.
 *     },
 *     stop: () => {
 *       // shutdown code goes here.
 *     },
 *     schema: () => {
 *       properties: {
 *         // plugin configuration goes here
 *       }
 *     }
 *   };
 *
 *   return plugin;
 * }
 * ```
 * @category Server API
 * @see [Developing Server Plugins](../../../docs/develop/plugins/README.md)
 */
export interface Plugin {
  /**
   * Used to identify the plugin in the server, for example
   * when storing the plugin's configuration and in http endpoints.
   *
   * @category Identification
   */
  id: string

  /**
   * Human oriented name for the plugin. This is used in the server's plugin configuration UI.
   * @category Identification
   */
  name: string

  description?: string

  /**
   * This function is called to start the plugin.
   *
   * It is called:
   * - during server startup for enabled plugins (by configuration or by default)
   * - when a plugin is enabled in the admin UI
   * - after {@link stop} when the configuration of an enabled plugin has been updated in the admin UI
   *
   * @category Lifecycle
   *
   * @param config - the configuration data entered via the Plugin Config screen
   * @param restart - a function that can be called by the plugin to restart itself
   */
  start(config: object, restart: (newConfiguration: object) => void): void

  /**
   * This function is called when the plugin is disabled or after configuration changes. Use this function to "clean up"
   * the resources consumed by the plugin i.e. unsubscribe from streams, stop timers / loops and close devices. If there
   * are asynchronous operations in your plugin's stop implementation you should return a Promise that resolves when
   * stopping is complete.
   *
   * @category Lifecycle
   */
  stop(): void | Promise<void>

  /**
   * @category Configuration
   */
  enabledByDefault?: boolean

  /**
   * A [JSON Schema](http://json-schema.org/) object describing the structure of the configuration data.
   *
   * This is used by the server to render the plugin's configuration screen in the Admin UI.
   * The configuration data is stored by the server in `$SIGNALK_NODE_CONFIG_DIR/plugin-config-data/<plugin-name>.json`. _(Default value of `SIGNALK_NODE_CONFIG_DIR` is `$HOME/.signalk`.)_
   *
   * @example
   * ```javascript
   *   plugin.schema = {
   *     type: 'object',
   *     required: ['some_string', 'some_other_number'],
   *     properties: {
   *       some_string: {
   *         type: 'string',
   *         title: 'Some string that the plugin needs'
   *       },
   *       some_number: {
   *         type: 'number',
   *         title: 'Some number that the plugin needs',
   *         default: 60
   *       },
   *       some_other_number: {
   *         type: 'number',
   *         title: 'Some other number that the plugin needs',
   *         default: 5
   *       }
   *     }
   *   };
   * ```
   *
   * @category Configuration
   */
  schema: object | (() => object)

  /**
   * A [uiSchema object](https://github.com/mozilla-services/react-jsonschema-form#the-uischema-object) which is used to control how the user interface is rendered in the Admin UI.
   *
   * For more information, see [react-jsonschema-form-extras](https://github.com/RxNT/react-jsonschema-form-extras#collapsible-fields-collapsible)
   *
   * @example
   * Make all data in an object called 'myObject' collapsible:
   * ```javascript
   * uiSchema['myObject'] = {
   *   'ui:field': 'collapsible',
   *   collapse: {
   *     field: 'ObjectField',
   *     wrapClassName: 'panel-group'
   *   }
   * }
   * ```
   *
   * @category Configuration
   */
  uiSchema?: object | (() => object)

  /**
   * Plugins can implement this method to provide an API. Like {@link start} and {@link stop}, this function will be
   * called during plugin startup with an [Express](https://expressjs.com/) router as the parameter.
   *
   * The router will be mounted at `/plugins/<pluginId>` and you can use standard _Express_ _(`.get()` `.post()` `.use()`, etc)_ methods to add HTTP path handlers.
   *
   * > [!note]
   * > `GET /plugins/<pluginid>` and `POST /plugins/<pluginid>/configure` are reserved by server (see below).
   *
   * It should be noted that _Express_ does not have a public API for deregistering subrouters, so {@link stop} does not do anything to the router.
   *
   * If a plugin does provide an API, it is strongly recommended that it implement {@link getOpenApi} to document its
   * operation. Doing so promotes interoperability with other plugins / webapps by making it easy to find and use the
   * functionality built into plugins. It is also a means to avoid duplication, promote reuse and the possibility of
   * including them in the Signal K specification.
   *
   * @category Rest API
   *
   * @param router
   * @returns
   */
  registerWithRouter?(router: IRouter): void

  /**
   * Plugins can implement this method to handle WebSocket `upgrade` events
   * on paths under their plugin route (`/plugins/<pluginId>/...`).
   *
   * Express routers do not see HTTP `upgrade` events — those are emitted on
   * the underlying HTTP server. This hook lets a plugin register one or
   * more URL patterns and receive the raw `upgrade` request, socket and
   * head exactly as Node.js's HTTP server delivers them. The plugin then
   * completes the handshake itself (typically with a `ws.Server({
   * noServer: true })` plus `wss.handleUpgrade(...)`).
   *
   * Like {@link registerWithRouter}, this is called once at plugin
   * registration time and registrations persist for the lifetime of the
   * server. The plugin's handler is responsible for guarding against the
   * plugin being stopped — typically by checking a module-scope state
   * variable and destroying the socket if not running.
   *
   * Patterns are matched as path prefixes relative to the plugin's route.
   * For example, registering `/socket` on plugin `my-plugin` will dispatch
   * upgrades to `/plugins/my-plugin/socket` and any sub-path.
   *
   * Authentication is the plugin's responsibility — call
   * `app.securityStrategy.authorizeWS(request)` if you need the same
   * cookie/JWT auth the rest of the server uses.
   *
   * @category Rest API
   *
   * @param upgrader registry to add upgrade handlers to
   *
   * @example
   * ```typescript
   * import { WebSocketServer } from 'ws'
   *
   * const wss = new WebSocketServer({ noServer: true })
   *
   * plugin.registerWithUpgrade = (upgrader) => {
   *   upgrader.upgrade('/socket', (request, socket, head) => {
   *     wss.handleUpgrade(request, socket, head, (ws) => {
   *       // use ws ...
   *     })
   *   })
   * }
   * ```
   */
  registerWithUpgrade?(upgrader: PluginUpgradeRouter): void

  getOpenApi?: () => object

  statusMessage?: () => string | void

  signalKApiRoutes?(router: IRouter): IRouter
}
