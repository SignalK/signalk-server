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
import Debug from 'debug'
import { Request, Response } from 'express'
const debug = Debug('signalk:interfaces:plugins')
// @ts-ignore
import { getLogger } from '@signalk/streams/logging'
import express from 'express'
import fs from 'fs'
import _ from 'lodash'
import path from 'path'

// tslint:disable-next-line:no-var-requires
const modulesWithKeyword = require('../modules').modulesWithKeyword
// tslint:disable-next-line:no-var-requires
const put = require('../put')
// tslint:disable-next-line
const _putPath = put.putPath
// tslint:disable-next-line:no-var-requires
const getModulePublic = require('../config/get').getModulePublic
// tslint:disable-next-line:no-var-requires
const queryRequest = require('../requestResponse').queryRequest

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

export interface ServerAPI {
  getSelfPath: (path: string) => void
  getPath: (path: string) => void
  putSelfPath: (aPath: string, value: any, updateCb: () => void) => Promise<any>
  putPath: (
    aPath: string,
    value: number | string | object | boolean,
    updateCb: (err?: Error) => void
  ) => Promise<any>
  queryRequest: (requestId: string) => Promise<any>
  error: (msg: string) => void
  debug: (msg: string) => void
  registerDeltaInputHandler: (
    handler: (delta: object, next: (delta: object) => void) => void
  ) => void
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
}

interface ModuleMetadata {
  version: string
  name: string
}

module.exports = (theApp: any) => {
  const onStopHandlers: any = {}
  return {
    start() {
      startPlugins(theApp)

      ensureExists(path.join(theApp.config.configPath, 'plugin-config-data'))

      theApp.use(
        '/plugins/configure',
        express.static(getPluginConfigPublic(theApp))
      )

      const router = express.Router()

      theApp.get('/plugins', (req: Request, res: Response) => {
        const providerStatus = theApp.getProviderStatus()
        res.json(
          _.sortBy(theApp.plugins, [
            (plugin: PluginInfo) => {
              return plugin.name
            }
          ]).map((plugin: PluginInfo) => {
            let data: { enabled: boolean } | null = null
            try {
              data = getPluginOptions(plugin.id)
            } catch (e) {
              console.log(e.code + ' ' + e.path)
            }

            if (
              data &&
              _.isUndefined(data.enabled) &&
              plugin.enabledByDefault
            ) {
              data.enabled = true
            }

            const schema =
              typeof plugin.schema === 'function'
                ? plugin.schema()
                : plugin.schema
            const status = providerStatus.find((p: any) => p.id === plugin.name)
            const statusMessage = status ? status.message : ''
            const uiSchema =
              typeof plugin.uiSchema === 'function'
                ? plugin.uiSchema()
                : plugin.uiSchema
            return {
              id: plugin.id,
              name: plugin.name,
              packageName: plugin.packageName,
              version: plugin.version,
              description: plugin.description,
              schema,
              statusMessage,
              uiSchema,
              state: plugin.state,
              data
            }
          })
        )
      })
    }
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
    const config = JSON.parse(JSON.stringify(data))
    fs.writeFile(
      pathForPluginId(pluginId),
      JSON.stringify(data, null, 2),
      callback
    )
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
    } catch (e) {
      console.error(
        'Could not parse JSON options:' + e.message + ' ' + optionsAsString
      )
      return {}
    }
  }

  function startPlugins(app: any) {
    app.plugins = []
    app.pluginsMap = {}
    modulesWithKeyword(app, 'signalk-node-server-plugin').forEach(
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

  function putSelfPath(aPath: string, value: any, updateCb: () => void) {
    return _putPath(
      theApp,
      'vessels.self',
      aPath,
      { value },
      null,
      null,
      updateCb
    )
  }

  function putPath(aPath: string, value: any, updateCb: (err?: Error) => void) {
    const parts = aPath.length > 0 ? aPath.split('.') : []

    if (parts.length <= 2) {
      updateCb(new Error(`Put path begin with a two part context:${aPath}`))
      return
    }

    const context = `${parts[0]}.${parts[1]}`
    const skpath = parts.slice(2).join('.')
    return _putPath(theApp, context, skpath, { value }, null, null, updateCb)
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
    theApp.setProviderStatus(plugin.name, 'Stopped')
    debug('Stopped plugin ' + plugin.name)
  }

  function setPluginStartedMessage(plugin: PluginInfo) {
    const statusMessage =
      typeof plugin.statusMessage === 'function'
        ? plugin.statusMessage()
        : undefined
    if (
      _.isUndefined(statusMessage) &&
      _.isUndefined(theApp.providerStatus[plugin.name]) &&
      _.isUndefined(plugin.statusMessage)
    ) {
      theApp.setProviderStatus(plugin.name, 'Started')
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
      app.setProviderStatus(plugin.name, null)

      if (plugin.enableDebug) {
        app.logging.addDebug(plugin.packageName)
      } else {
        app.logging.removeDebug(plugin.packageName)
      }

      plugin.start(configuration, restart)
      debug('Started plugin ' + plugin.name)
      setPluginStartedMessage(plugin)
    } catch (e) {
      console.error('error starting plugin: ' + e)
      console.error(e.stack)
      app.setProviderError(plugin.name, `Failed to start: ${e.message}`)
    }
  }

  function doRegisterPlugin(
    app: any,
    packageName: string,
    metadata: ModuleMetadata,
    location: string
  ) {
    let plugin: PluginInfo
    const appCopy: ServerAPI = _.assign({}, app, {
      getSelfPath,
      getPath,
      putSelfPath,
      putPath,
      queryRequest,
      error: (msg: string) => {
        console.error(`${packageName}:${msg}`)
      },
      debug: require('debug')(packageName),
      registerDeltaInputHandler: (handler: any) => {
        onStopHandlers[plugin.id].push(app.registerDeltaInputHandler(handler))
      },
      setProviderStatus: (msg: string) => {
        app.setProviderStatus(plugin.name, msg)
      },
      setProviderError: (msg: string) => {
        app.setProviderError(plugin.name, msg)
      }
    })
    try {
      const pluginConstructor: (
        app: ServerAPI
      ) => PluginInfo = require(path.join(location, packageName))
      plugin = pluginConstructor(appCopy)
    } catch (e) {
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

    appCopy.registerHistoryProvider = provider => {
      app.registerHistoryProvider(provider)
      onStopHandlers[plugin.id].push(() => {
        app.unregisterHistoryProvider(provider)
      })
    }

    const startupOptions = getPluginOptions(plugin.id)
    const restart = (newConfiguration: any) => {
      const pluginOptions = getPluginOptions(plugin.id)
      pluginOptions.configuration = newConfiguration
      savePluginOptions(plugin.id, pluginOptions, err => {
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
      savePluginOptions(plugin.id, req.body, err => {
        if (err) {
          console.log(err)
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
    app.use('/plugins/' + plugin.id, router)

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
