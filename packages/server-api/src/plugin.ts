import { IRouter } from 'express'
import { ServerAPI } from './serverapi'

/**
 * A plugin constructor is the interface that all plugins must export.
 * It is called by the server when the server is starting up.
 */
export type PluginConstructor = (app: ServerAPI) => Plugin

/**
 * Plugins are components that extend functionality of the server and can be installed via the Signal K AppStore.
 *
 * A plugin can:
 * - Interact with the {@link ServerAPI}, including the full data model, {@link ResourcesApi}, and more.
 * - emit delta messages
 * - process requests
 * - provide a webapp interface by placing the relavent files in a folder named `/public/` which the server will mount under `http://{skserver}:3000/{pluginId}`.
 * - Provide resources via the {@link ResourcesApi}
 *
 * For example, if the plugin you are looking to develop is providing access to information such as `route,` `waypoint`,`POI`, or `charts` you should be creating a _[Resources Provider Plugin](../../../docs/develop/plugins/resource_provider_plugins.md)_ for the _[Resources API](../../../docs/develop/rest-api/resources_api.md)_.
 *
 * Or if you are looking to perform course calculations or integrate with an auotpilot, you will want to review the _[Course API](../../../docs/develop/rest-api/course_api.md)_ documentation prior to commencing your project.
 *
 * ### OpenApi description for your plugin's API
 *
 * If your plugin provides an API you should consider providing an OpenApi description. This promotes cooperation with other plugin/webapp authors and also paves the way for incorporating new APIs piloted within a plugin into the Signal K specification. _See [Add OpenAPI definition](#add-an-openapi-definition)_ below.
 *
 *
 * This is the API that a [server plugin](https://github.com/SignalK/signalk-server/blob/master/SERVERPLUGINS.md) must implement.

 *
 *
 *
 * Typing is INCOMPLETE.
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
   * @category Configuration
   */
  schema: object | (() => object)

  /**
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
  registerWithRouter?: (router: IRouter) => void

  getOpenApi?: () => object

  statusMessage?: () => string | void

  signalKApiRoutes?: (router: IRouter) => IRouter
}
