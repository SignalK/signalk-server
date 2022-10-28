/* eslint-disable @typescript-eslint/no-var-requires */
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
  PluginServerApp,
  PropertyValues,
  PropertyValuesCallback
} from '@signalk/server-api'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { getLogger } from '@signalk/streams/logging'
import express, { Request, Response } from 'express'
import fs from 'fs'
import _ from 'lodash'
import path from 'path'
import { SERVERROUTESPREFIX } from '../constants'
import { createDebug } from '../debug'
import { DeltaInputHandler } from '../deltachain'
import { listAllSerialPorts, Ports } from '../serialports'
const debug = createDebug('signalk-server:interfaces:plugins')

import { modulesWithKeyword } from '../modules'

const put = require('../put')
const _putPath = put.putPath
const getModulePublic = require('../config/get').getModulePublic
const queryRequest = require('../requestResponse').queryRequest
const getMetadata = require('@signalk/signalk-schema').getMetadata

// #521 Returns path to load plugin-config assets.
const getPluginConfigPublic = getModulePublic('@signalk/plugin-config')

const DEFAULT_ENABLED_PLUGINS = process.env.DEFAULTENABLEDPLUGINS
  ? process.env.DEFAULTENABLEDPLUGINS.split(',')
  : []

export type PluginFactory = (serverApi: ServerAPI) => Plugin

export interface Plugin {
  start: (config: object, restart: (newConfiguration: object) => void) => any
  stop: () => any
}

interface PluginInfo extends Plugin {
  enableLogging: any
  enableDebug: any
  packageName: any
  keywords: string[]
  packageLocation: string
  registerWithRouter: any
  signalKApiRoutes: any
  name: string
  id: string
  schema: () => void | object
  uiSchema: () => void | object
  version: string
  description: string
  state: string
  enabledByDefault: boolean
  statusMessage: () => string | void
}

export interface ServerAPI extends PluginServerApp {
  getSelfPath: (path: string) => void
  getPath: (path: string) => void
  getMetadata: (path: string) => void
  putSelfPath: (aPath: string, value: any, updateCb: () => void) => Promise<any>
  putPath: (
    aPath: string,
    value: number | string | object | boolean,
    updateCb: (err?: Error) => void,
    source: string
  ) => Promise<any>
  queryRequest: (requestId: string) => Promise<any>
  error: (msg: string) => void
  debug: (msg: string) => void
  registerDeltaInputHandler: (handler: DeltaInputHandler) => void
  setProviderStatus: (msg: string) => void
  handleMessage: (id: string, msg: any) => void
  setProviderError: (msg: string) => void
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
      spark: any,
      options: object,
      onDelta: (delta: object) => void
    ) => void
  }) => void
  getSerialPorts: () => Promise<Ports>
}

interface ModuleMetadata {
  version: string
  name: string
  keywords: string[]
}

function backwardsCompat(url: string) {
  return [`${SERVERROUTESPREFIX}${url}`, url]
}

module.exports = (theApp: any) => {
  const onStopHandlers: any = {}
  return {
    start() {
      startPlugins(theApp)

      ensureExists(path.join(theApp.config.configPath, 'plugin-config-data'))

      theApp.use(
        backwardsCompat('/plugins/configure'),
        express.static(getPluginConfigPublic(theApp))
      )

      theApp.get(backwardsCompat('/plugins'), (req: Request, res: Response) => {
        const providerStatus = theApp.getProviderStatus()

        Promise.all(
          _.sortBy(theApp.plugins, [
            (plugin: PluginInfo) => {
              return plugin.name
            }
          ]).map((plugin: PluginInfo) =>
            getPluginResponseInfo(plugin, providerStatus)
          )
        )
          .then((json) => res.json(json))
          .catch((err) => {
            console.error(err)
            res.status(500)
            res.send(err)
          })
      })
    }
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
          resolve({
            id: plugin.id,
            name: plugin.name,
            packageName: plugin.packageName,
            keywords: plugin.keywords,
            version: plugin.version,
            description: plugin.description,
            schema,
            statusMessage,
            uiSchema,
            state: plugin.state,
            data
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
    } catch (e) {
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

  function startPlugins(app: any) {
    app.plugins = []
    app.pluginsMap = {}
    modulesWithKeyword(app.config, 'signalk-node-server-plugin').forEach(
      (moduleData: any) => {
        registerPlugin(
          app,
          moduleData.module,
          moduleData.metadata,
          moduleData.location
        )
      }
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

  function registerPlugin(
    app: any,
    pluginName: string,
    metadata: ModuleMetadata,
    location: string
  ) {
    debug('Registering plugin ' + pluginName)
    try {
      doRegisterPlugin(app, pluginName, metadata, location)
    } catch (e) {
      console.error(e)
    }
  }

  function stopPlugin(plugin: PluginInfo) {
    debug('Stopping plugin ' + plugin.name)
    onStopHandlers[plugin.id].forEach((f: () => void) => {
      try {
        f()
      } catch (err) {
        console.error(err)
      }
    })
    onStopHandlers[plugin.id] = []
    plugin.stop()
    theApp.setPluginStatus(plugin.id, 'Stopped')
    debug('Stopped plugin ' + plugin.name)
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
      plugin.start(safeConfiguration, restart)
      debug('Started plugin ' + plugin.name)
      setPluginStartedMessage(plugin)
    } catch (e: any) {
      console.error('error starting plugin: ' + e)
      console.error(e.stack)
      app.setProviderError(plugin.id, `Failed to start: ${e.message}`)
    }
  }

  function doRegisterPlugin(
    app: any,
    packageName: string,
    metadata: ModuleMetadata,
    location: string
  ) {
    let plugin: PluginInfo
    let setProviderUseLogged = false
    const logSetProviderUsage = () => {
      if (!setProviderUseLogged) {
        console.log(
          `Note: ${plugin.name} is using deprecated setProviderStatus/Error https://github.com/SignalK/signalk-server/blob/master/SERVERPLUGINS.md#appsetproviderstatusmsg`
        )
        setProviderUseLogged = true
      }
    }
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
      registerDeltaInputHandler: (handler: any) => {
        onStopHandlers[plugin.id].push(app.registerDeltaInputHandler(handler))
      },
      setProviderStatus: (msg: string) => {
        logSetProviderUsage()
        app.setPluginStatus(plugin.id, msg)
      },
      setProviderError: (msg: string) => {
        logSetProviderUsage()
        app.setPluginError(plugin.id, msg)
      },
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
      getMetadata
    })
    appCopy.putPath = putPath
    try {
      const pluginConstructor: (
        app: ServerAPI
        // eslint-disable-next-line @typescript-eslint/no-var-requires
      ) => PluginInfo = require(path.join(location, packageName))
      plugin = pluginConstructor(appCopy)
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
      onStopHandlers[plugin.id].push(
        app.registerActionHandler(context, aPath, source || plugin.id, callback)
      )
    }
    appCopy.registerActionHandler = appCopy.registerPutHandler

    appCopy.registerHistoryProvider = (provider) => {
      app.registerHistoryProvider(provider)
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
          stopPlugin(plugin)
          doPluginStart(app, plugin, location, newConfiguration, restart)
        }
      })
    }

    if (isEnabledByPackageEnableDefault(startupOptions, metadata)) {
      startupOptions.enabled = true
      startupOptions.configuration = {}
      plugin.enabledByDefault = true
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
          res.send(err)
          return
        }
        res.send('Saved configuration for plugin ' + plugin.id)
        stopPlugin(plugin)
        const options = getPluginOptions(plugin.id)
        plugin.enableLogging = options.enableLogging
        plugin.enableDebug = options.enableDebug
        if (options.enabled) {
          doPluginStart(app, plugin, location, options.configuration, restart)
        }
      })
    })

    router.get('/config', (req: Request, res: Response) => {
      res.json(getPluginOptions(plugin.id))
    })

    if (typeof plugin.registerWithRouter !== 'undefined') {
      plugin.registerWithRouter(router)
    }
    app.use(backwardsCompat('/plugins/' + plugin.id), router)

    if (typeof plugin.signalKApiRoutes === 'function') {
      app.use('/signalk/v1/api', plugin.signalKApiRoutes(express.Router()))
    }
  }
}

const isEnabledByPackageEnableDefault = (
  options: any,
  metadata: ModuleMetadata
) =>
  _.isUndefined(options.enabled) &&
  (metadata as any)['signalk-plugin-enabled-by-default']
