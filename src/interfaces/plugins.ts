/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@iki.fi>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/
import {
  Brand,
  PointDestination,
  PropertyValues,
  PropertyValuesCallback,
  ResourceProvider,
  AutopilotProvider,
  ServerAPI,
  RouteDestination,
  WeatherProvider,
  WeatherApi,
  Value,
  SignalKApiId,
  SourceRef,
  PluginConstructor,
  Plugin,
  Path,
  Delta
} from '@signalk/server-api'
import { getLogger } from '@signalk/streams/logging'
import express, { Request, Response } from 'express'
import fs from 'fs'
import { deprecate } from 'util'
import _ from 'lodash'
import path from 'path'
import { AutopilotApi } from '../api/autopilot'
import { CourseApi } from '../api/course'
import { ResourcesApi } from '../api/resources'
import { SERVERROUTESPREFIX } from '../constants'
import { createDebug } from '../debug'
import { listAllSerialPorts } from '../serialports'
const debug = createDebug('signalk-server:interfaces:plugins')

import { OpenApiDescription, OpenApiRecord } from '../api/swagger'
import {
  CONNECTION_WRITE_EVENT_NAME,
  ConnectionWriteEvent
} from '../deltastats'
import { EventsActorId } from '../events'
import { importOrRequire, modulesWithKeyword, NpmPackageData } from '../modules'

const put = require('../put')
const _putPath = put.putPath
const getModulePublic = require('../config/get').getModulePublic
const queryRequest = require('../requestResponse').queryRequest
import { getMetadata } from '@signalk/signalk-schema'
import { HistoryApi } from '@signalk/server-api/history'
import { HistoryApiHttpRegistry } from '../api/history'
import { derivePluginId } from '../pluginid'

// #521 Returns path to load plugin-config assets.
const getPluginConfigPublic = getModulePublic('@signalk/plugin-config')

const DEFAULT_ENABLED_PLUGINS = process.env.DEFAULTENABLEDPLUGINS
  ? process.env.DEFAULTENABLEDPLUGINS.split(',')
  : []

export type PluginId = Brand<string, 'PluginId'>
export interface PluginManager {
  getPluginOpenApiRecords: () => OpenApiRecord[]
  setPluginOpenApi: (pluginId: PluginId, openApi: OpenApiDescription) => void
  getPluginOpenApi: (pluginId: PluginId) => OpenApiRecord | undefined
}

interface PluginInfo extends Plugin {
  enableLogging: any
  enableDebug: any
  packageName: any
  keywords: string[]
  packageLocation: string
  version: string
  state: string
  type?: string // 'wasm' for WASM plugins, undefined for Node.js plugins
  isWebapp?: boolean
  isEmbeddableWebapp?: boolean
  webappMounted?: boolean
}

function backwardsCompat(url: string) {
  return [`${SERVERROUTESPREFIX}${url}`, url]
}

module.exports = (theApp: any) => {
  const onStopHandlers: any = {}
  const appNodeModules = path.join(theApp.config.appPath, 'node_modules/')
  return {
    async start() {
      ensureExists(path.join(theApp.config.configPath, 'plugin-config-data'))

      theApp.getPluginsList = async (enabled?: boolean) => {
        return await getPluginsList(enabled)
      }

      theApp.use(
        backwardsCompat('/plugins/configure'),
        express.static(getPluginConfigPublic(theApp))
      )

      theApp.get(backwardsCompat('/plugins'), (req: Request, res: Response) => {
        getPluginResponseInfos()
          .then((json) => res.json(json))
          .catch((err) => {
            console.error(err)
            res.status(500)
            res.json(err)
          })
      })

      await startPlugins(theApp)
    }
  }

  function getPluginResponseInfos() {
    const providerStatus = theApp.getProviderStatus()
    return Promise.all(
      _.sortBy(theApp.plugins, [
        (plugin: PluginInfo) => {
          return plugin.name
        }
      ]).map((plugin: PluginInfo) =>
        getPluginResponseInfo(plugin, providerStatus)
      )
    )
  }

  function getPluginsList(enabled?: boolean) {
    return getPluginResponseInfos().then((pa) => {
      const res = pa.map((p: any) => {
        return {
          id: p.id,
          name: p.name,
          version: p.version,
          enabled: p.data.enabled ?? false
        }
      })

      if (typeof enabled === 'undefined') {
        return res
      } else {
        return res.filter((p: any) => {
          return p.enabled === enabled
        })
      }
    })
  }

  function isBundledPlugin(plugin: PluginInfo) {
    return plugin.packageLocation === appNodeModules
  }

  function getPluginResponseInfo(plugin: PluginInfo, providerStatus: any) {
    return new Promise((resolve, reject) => {
      let data: { enabled: boolean } | null = null
      try {
        data = getPluginOptions(plugin.id)
      } catch (e: any) {
        console.error(e.code + ' ' + e.path)
      }

      if (data && _.isUndefined(data.enabled) && plugin.enabledByDefault) {
        data.enabled = true
      }

      Promise.all([
        Promise.resolve(
          typeof plugin.schema === 'function'
            ? (() => {
                try {
                  return plugin.schema()
                } catch (e) {
                  console.error(e)
                  // return a fake schema to inform the user
                  // downside is that saving this may overwrite an existing configuration
                  return {
                    type: 'object',
                    required: ['error'],
                    properties: {
                      error: {
                        title:
                          'Error loading plugin configuration schema, check server log',
                        type: 'string'
                      }
                    }
                  }
                }
              })()
            : plugin.schema
        ),
        Promise.resolve(
          typeof plugin.uiSchema === 'function'
            ? plugin.uiSchema()
            : plugin.uiSchema
        )
      ])
        .then(([schema, uiSchema]) => {
          const status = providerStatus.find((p: any) => p.id === plugin.name)
          const statusMessage = status ? status.message : ''
          if (schema === undefined) {
            console.error(
              `Error: plugin ${plugin.id} is missing configuration schema`
            )
          }
          resolve({
            id: plugin.id,
            name: plugin.name,
            packageName: plugin.packageName,
            keywords: plugin.keywords,
            version: plugin.version,
            description: plugin.description,
            schema: schema || {},
            statusMessage,
            uiSchema,
            state: plugin.state,
            data,
            type: plugin.type, // Include type to identify WASM plugins in Admin UI
            bundled: isBundledPlugin(plugin)
          })
        })
        .catch((err) => {
          reject(err)
        })
    })
  }

  function ensureExists(dir: string) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }
  }

  function pathForPluginId(id: string) {
    return path.join(
      theApp.config.configPath,
      'plugin-config-data',
      id + '.json'
    )
  }

  function dirForPluginId(id: string) {
    const dirName = path.join(
      theApp.config.configPath,
      'plugin-config-data',
      id
    )
    ensureExists(dirName)
    return dirName
  }

  function savePluginOptions(
    pluginId: string,
    data: object,
    callback: (err: NodeJS.ErrnoException | null) => void
  ) {
    try {
      fs.writeFileSync(pathForPluginId(pluginId), JSON.stringify(data, null, 2))
      callback(null)
    } catch (err: any) {
      callback(err)
    }
  }

  function getPluginOptions(id: string) {
    let optionsAsString = '{}'
    try {
      optionsAsString = fs.readFileSync(pathForPluginId(id), 'utf8')
    } catch (_e) {
      debug(
        'Could not find options for plugin ' +
          id +
          ', returning empty options: '
      )
    }
    try {
      const options = JSON.parse(optionsAsString)
      if (optionsAsString === '{}' && DEFAULT_ENABLED_PLUGINS.includes(id)) {
        debug('Override enable for plugin ' + id)
        options.enabled = true
      }
      if (process.env.DISABLEPLUGINS) {
        debug('Plugins disabled by configuration')
        options.enabled = false
      }
      debug(optionsAsString)
      return options
    } catch (e: any) {
      console.error(
        'Could not parse JSON options:' + e.message + ' ' + optionsAsString
      )
      return {}
    }
  }

  async function startPlugins(app: any) {
    app.plugins = []
    app.pluginsMap = {}
    // Expose getPluginOptions for use by other modules (e.g., webapps.js)
    app.getPluginOptions = getPluginOptions

    // Discover both Node.js and WASM plugins
    const jsModules = modulesWithKeyword(
      app.config,
      'signalk-node-server-plugin'
    )
    const wasmModules = modulesWithKeyword(app.config, 'signalk-wasm-plugin')

    // Combine and deduplicate by module name (a plugin might have both keywords)
    const seenModules = new Set<string>()
    const modules = [...jsModules, ...wasmModules].filter((moduleData: any) => {
      if (seenModules.has(moduleData.module)) {
        return false
      }
      seenModules.add(moduleData.module)
      return true
    })

    await Promise.all(
      modules.map((moduleData: any) => {
        return registerPlugin(
          app,
          moduleData.module,
          moduleData.metadata,
          moduleData.location
        )
      })
    )
  }

  function handleMessageWrapper(app: any, id: string) {
    const pluginsLoggingEnabled =
      _.isUndefined(app.config.settings.enablePluginLogging) ||
      app.config.settings.enablePluginLogging
    return (providerId: string, data: any) => {
      const plugin = app.pluginsMap[id]
      if (
        !_.isUndefined(plugin) &&
        pluginsLoggingEnabled &&
        plugin.enableLogging
      ) {
        if (!plugin.logger) {
          plugin.logger = getLogger(app, providerId)
        }
        plugin.logger(data)
      }
      app.handleMessage(id, data)
    }
  }

  function getSelfPath(aPath: string) {
    return _.get(theApp.signalk.self, aPath)
  }

  function getPath(aPath: string) {
    if (aPath === '/sources') {
      return {
        ...theApp.signalk.retrieve().sources,
        ...theApp.deltaCache.getSources()
      }
    } else {
      return _.get(theApp.signalk.retrieve(), aPath)
    }
  }

  function putSelfPath(
    aPath: string,
    value: any,
    updateCb: () => void,
    source: string
  ) {
    return _putPath(
      theApp,
      'vessels.self',
      aPath,
      { value, source },
      null,
      null,
      updateCb
    )
  }

  function putPath(
    aPath: string,
    value: any,
    updateCb: (err?: Error) => void,
    source: string
  ) {
    const parts = aPath.length > 0 ? aPath.split('.') : []

    if (parts.length <= 2) {
      updateCb(new Error(`Put path begin with a two part context:${aPath}`))
      return
    }

    const context = `${parts[0]}.${parts[1]}`
    const skpath = parts.slice(2).join('.')
    return _putPath(
      theApp,
      context,
      skpath,
      { value, source },
      null,
      null,
      updateCb
    )
  }

  function getSerialPorts() {
    return listAllSerialPorts()
  }

  async function registerPlugin(
    app: any,
    pluginName: string,
    metadata: NpmPackageData,
    location: string
  ) {
    debug('Registering plugin ' + pluginName)
    try {
      // Check if this is a WASM plugin (wasmManifest is now part of NpmPackageData)
      if (metadata.wasmManifest) {
        // This is a WASM plugin - check if WASM interface is enabled
        const wasmEnabled = app.config.settings.interfaces?.wasm !== false
        if (!wasmEnabled) {
          debug(
            `WASM plugin ${pluginName} discovered but WASM interface disabled - registering minimal entry`
          )
          // Create minimal plugin entry so it appears in Plugin Config with "No WASM" badge
          // Derive plugin ID from npm package name (@ → _, / → _)
          const pluginId = derivePluginId(pluginName)
          // Use signalk.displayName (standard SignalK convention) or fall back to package name
          const pluginDisplayName = metadata.signalk?.displayName || pluginName

          const minimalPlugin: any = {
            id: pluginId,
            name: pluginDisplayName,
            type: 'wasm',
            packageName: pluginName,
            version: metadata.version,
            description: metadata.description || '',
            keywords: metadata.keywords || [],
            packageLocation: location,
            enabled: false,
            state: 'disabled',
            statusMessage: () => 'WASM interface disabled',
            schema: () => ({}),
            uiSchema: () => ({}),
            start: () => {},
            stop: () => Promise.resolve(),
            enableLogging: false,
            enableDebug: false
          }

          app.plugins.push(minimalPlugin)
          app.pluginsMap[pluginId] = minimalPlugin
          debug(
            `Registered minimal WASM plugin entry: ${pluginId} (WASM disabled)`
          )
          return
        }
        // Route to WASM loader
        debug(`Detected WASM plugin: ${pluginName}`)
        const { registerWasmPlugin } = require('../wasm')
        await registerWasmPlugin(
          app,
          pluginName,
          metadata,
          location,
          theApp.config.configPath
        )
        return
      }

      // Standard Node.js plugin
      await doRegisterPlugin(app, pluginName, metadata, location)
    } catch (e) {
      console.error(e)
    }
  }

  function stopPlugin(plugin: PluginInfo): Promise<any> {
    debug('Stopping plugin ' + plugin.name)
    onStopHandlers[plugin.id].forEach((f: () => void) => {
      try {
        f()
      } catch (err) {
        console.error(err)
      }
    })
    onStopHandlers[plugin.id] = []
    const result = Promise.resolve(plugin.stop())
    result.then(() => {
      theApp.setPluginStatus(plugin.id, 'Stopped')
      debug('Stopped plugin ' + plugin.name)
    })
    return result
  }

  function setPluginStartedMessage(plugin: PluginInfo) {
    const statusMessage =
      typeof plugin.statusMessage === 'function'
        ? plugin.statusMessage()
        : undefined
    if (
      _.isUndefined(statusMessage) &&
      _.isUndefined(theApp.providerStatus[plugin.id]) &&
      _.isUndefined(plugin.statusMessage)
    ) {
      theApp.setPluginStatus(plugin.id, 'Started')
    }
  }

  function doPluginStart(
    app: any,
    plugin: PluginInfo,
    location: string,
    configuration: any,
    restart: (newConfiguration: any) => void
  ) {
    debug('Starting plugin %s from %s', plugin.name, location)
    try {
      app.setPluginStatus(plugin.id, null)

      if (plugin.enableDebug) {
        app.logging.addDebug(plugin.packageName)
      } else {
        app.logging.removeDebug(plugin.packageName)
      }

      let safeConfiguration = configuration
      if (!safeConfiguration) {
        console.error(`${plugin.id}:no configuration data`)
        safeConfiguration = {}
      }
      onStopHandlers[plugin.id].push(() => {
        app.resourcesApi.unRegister(plugin.id)
        app.autopilotApi.unRegister(plugin.id)
        app.weatherApi.unRegister(plugin.id)
      })
      plugin.start(safeConfiguration, restart)
      debug('Started plugin ' + plugin.name)
      setPluginStartedMessage(plugin)
    } catch (e: any) {
      console.error('error starting plugin: ' + e)
      console.error(e.stack)
      app.setProviderError(plugin.id, `Failed to start: ${e.message}`)
    }
  }

  async function doRegisterPlugin(
    app: any,
    packageName: string,
    metadata: NpmPackageData,
    location: string
  ) {
    let plugin: PluginInfo
    const appCopy: ServerAPI = _.assign({}, app, {
      getSelfPath,
      getPath,
      putSelfPath,
      queryRequest,
      error: (msg: any) => {
        console.error(`${packageName}:${msg}`)
        if (msg instanceof Error) {
          console.error(msg.stack)
        }
      },
      debug: createDebug(packageName),
      registerDeltaInputHandler: (handler: Delta) => {
        onStopHandlers[plugin.id].push(app.registerDeltaInputHandler(handler))
      },
      setProviderStatus: deprecate((msg: string) => {
        app.setPluginStatus(plugin.id, msg)
      }, `[${packageName}] setProviderStatus() is deprecated, use setPluginStatus() instead`),
      setProviderError: deprecate((msg: string) => {
        app.setPluginError(plugin.id, msg)
      }, `[${packageName}] setProviderError() is deprecated, use setPluginError() instead`),
      setPluginStatus: (msg: string) => {
        app.setPluginStatus(plugin.id, msg)
      },
      setPluginError: (msg: string) => {
        app.setPluginError(plugin.id, msg)
      },
      emitPropertyValue(name: string, value: any) {
        const propValues = app.propertyValues as PropertyValues // just for typechecking
        propValues.emitPropertyValue({
          timestamp: Date.now(),
          setter: plugin.id,
          name,
          value
        })
      },
      onPropertyValues(name: string, cb: PropertyValuesCallback) {
        return (app.propertyValues as PropertyValues).onPropertyValues(name, cb)
      },
      getSerialPorts,
      supportsMetaDeltas: true,
      getMetadata,
      reportOutputMessages: (count?: number) => {
        app.emit(CONNECTION_WRITE_EVENT_NAME, {
          providerId: plugin.id,
          count
        } as ConnectionWriteEvent)
      }
    })
    appCopy.putPath = putPath

    const weatherApi: WeatherApi = app.weatherApi
    appCopy.registerWeatherProvider = (provider: WeatherProvider) => {
      weatherApi.register(plugin.id, provider)
    }

    const historyApiRegistry: HistoryApiHttpRegistry =
      app.historyApiHttpRegistry
    delete (appCopy as any).historyApiHttpRegistry // expose only the plugin-specific proxy
    appCopy.registerHistoryApiProvider = (provider: HistoryApi) => {
      historyApiRegistry.registerHistoryApiProvider(plugin.id, provider)
      onStopHandlers[plugin.id].push(() => {
        historyApiRegistry.unregisterHistoryApiProvider(plugin.id)
      })
    }

    const resourcesApi: ResourcesApi = app.resourcesApi
    appCopy.registerResourceProvider = (provider: ResourceProvider) => {
      resourcesApi.register(plugin.id, provider)
    }

    const autopilotApi: AutopilotApi = app.autopilotApi
    appCopy.registerAutopilotProvider = (
      provider: AutopilotProvider,
      devices: string[]
    ) => {
      autopilotApi.register(plugin.id, provider, devices)
    }
    appCopy.autopilotUpdate = (
      deviceId: SourceRef,
      apInfo: { [k: string]: Value }
    ) => {
      autopilotApi.apUpdate(plugin.id, deviceId, apInfo)
    }

    const courseApi: CourseApi = app.courseApi
    appCopy.getCourse = () => {
      return courseApi.getCourse()
    }
    appCopy.clearDestination = () => {
      return courseApi.clearDestination()
    }
    appCopy.setDestination = (
      dest: (PointDestination & { arrivalCircle?: number }) | null
    ) => {
      return courseApi.destination(dest)
    }
    appCopy.activateRoute = (dest: RouteDestination | null) => {
      return courseApi.activeRoute(dest)
    }

    try {
      const moduleDir = path.join(location, packageName)
      const pluginConstructor: PluginConstructor =
        await importOrRequire(moduleDir)
      plugin = pluginConstructor(appCopy) as PluginInfo
    } catch (e: any) {
      console.error(`${packageName} failed to start: ${e.message}`)
      console.error(e)
      app.setProviderError(packageName, `Failed to start: ${e.message}`)
      return
    }
    onStopHandlers[plugin.id] = []

    if (app.pluginsMap[plugin.id]) {
      console.log(
        `WARNING: found multiple copies of plugin with id ${
          plugin.id
        } at ${location} and ${app.pluginsMap[plugin.id].packageLocation}`
      )
      return
    }

    appCopy.handleMessage = handleMessageWrapper(app, plugin.id)
    const boundEventMethods = (app as any).wrappedEmitter.bindMethodsById(
      `plugin:${plugin.id}` as EventsActorId
    )
    _.assign(appCopy, boundEventMethods)

    appCopy.savePluginOptions = (configuration, cb) => {
      savePluginOptions(
        plugin.id,
        { ...getPluginOptions(plugin.id), configuration },
        cb
      )
    }
    appCopy.readPluginOptions = () => {
      return getPluginOptions(plugin.id)
    }
    appCopy.getDataDirPath = () => dirForPluginId(plugin.id)

    appCopy.registerPutHandler = (context, aPath, callback, source) => {
      appCopy.handleMessage(plugin.id, {
        updates: [
          {
            meta: [
              {
                path: aPath as Path,
                value: {
                  supportsPut: true
                }
              }
            ]
          }
        ]
      })

      onStopHandlers[plugin.id].push(
        app.registerActionHandler(context, aPath, source || plugin.id, callback)
      )
    }
    appCopy.registerActionHandler = appCopy.registerPutHandler

    appCopy.registerHistoryProvider = (provider) => {
      app.registerHistoryProvider(provider)
      const apiList = app.apis as SignalKApiId[]
      apiList.push('historyplayback')
      apiList.push('historysnapshot')
      onStopHandlers[plugin.id].push(() => {
        app.unregisterHistoryProvider(provider)
      })
    }

    const startupOptions = getPluginOptions(plugin.id)
    const restart = (newConfiguration: any) => {
      const pluginOptions = getPluginOptions(plugin.id)
      pluginOptions.configuration = newConfiguration
      savePluginOptions(plugin.id, pluginOptions, (err) => {
        if (err) {
          console.error(err)
        } else {
          stopPlugin(plugin).then(() => {
            return Promise.resolve(
              doPluginStart(app, plugin, location, newConfiguration, restart)
            )
          })
        }
      })
    }

    if (isEnabledByPackageEnableDefault(startupOptions, metadata)) {
      startupOptions.enabled = true
      startupOptions.configuration = {}
      plugin.enabledByDefault = true
      // Persist the default-enabled state to disk so the plugin can be disabled later
      savePluginOptions(plugin.id, startupOptions, (err) => {
        if (err) {
          console.error(
            `Error saving default-enabled options for ${plugin.id}:`,
            err
          )
        }
      })
    }

    plugin.enableDebug = startupOptions.enableDebug
    plugin.version = metadata.version
    plugin.packageName = metadata.name
    plugin.keywords = metadata.keywords
    plugin.packageLocation = location

    if (startupOptions && startupOptions.enabled) {
      doPluginStart(
        app,
        plugin,
        location,
        startupOptions.configuration,
        restart
      )
    }
    plugin.enableLogging = startupOptions.enableLogging
    app.plugins.push(plugin)
    app.pluginsMap[plugin.id] = plugin

    const router = express.Router()
    router.get('/', (req: Request, res: Response) => {
      const currentOptions = getPluginOptions(plugin.id)
      const enabledByDefault = isEnabledByPackageEnableDefault(
        currentOptions,
        metadata
      )
      res.json({
        enabled: enabledByDefault || currentOptions.enabled,
        enabledByDefault,
        id: plugin.id,
        name: plugin.name,
        version: plugin.version
      })
    })

    router.post('/config', (req: Request, res: Response) => {
      savePluginOptions(plugin.id, req.body, (err) => {
        if (err) {
          console.error(err)
          res.status(500)
          res.json(err)
          return
        }
        res.json('Saved configuration for plugin ' + plugin.id)
        stopPlugin(plugin).then(() => {
          const options = getPluginOptions(plugin.id)
          plugin.enableLogging = options.enableLogging
          plugin.enableDebug = options.enableDebug
          if (options.enabled) {
            doPluginStart(app, plugin, location, options.configuration, restart)
          }
        })
      })
    })

    router.get('/config', (req: Request, res: Response) => {
      res.json(getPluginOptions(plugin.id))
    })

    if (typeof plugin.registerWithRouter === 'function') {
      plugin.registerWithRouter(router)
      if (typeof plugin.getOpenApi === 'function') {
        app.setPluginOpenApi(plugin.id, plugin.getOpenApi())
      }
    }
    app.use(backwardsCompat('/plugins/' + plugin.id), router)

    if (typeof plugin.signalKApiRoutes === 'function') {
      app.use('/signalk/v1/api', plugin.signalKApiRoutes(express.Router()))
    }
  }
}

const isEnabledByPackageEnableDefault = (
  options: any,
  metadata: NpmPackageData
) =>
  _.isUndefined(options.enabled) &&
  (metadata as any)['signalk-plugin-enabled-by-default']
