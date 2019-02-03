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

const debug = require('debug')('signalk:interfaces:plugins')
const fs = require('fs')
const path = require('path')
const express = require('express')
const _ = require('lodash')
const modulesWithKeyword = require('../modules').modulesWithKeyword
const getLogger = require('../logging').getLogger
const _putPath = require('../put').putPath
const { getModulePublic } = require('../config/get')
const { queryRequest } = require('../requestResponse')

// #521 Returns path to load plugin-config assets.
const getPluginConfigPublic = getModulePublic('@signalk/plugin-config')

const DEFAULT_ENABLED_PLUGINS = process.env['DEFAULTENABLEDPLUGINS']
  ? process.env['DEFAULTENABLEDPLUGINS'].split(',')
  : []

module.exports = function (app) {
  const onStopHandlers = {}
  return {
    start: function () {
      startPlugins(app)

      ensureExists(path.join(app.config.configPath, 'plugin-config-data'))

      app.use('/plugins/configure', express.static(getPluginConfigPublic(app)))

      router = express.Router()

      app.get('/plugins', function (req, res, next) {
        const providerStatus = app.getProviderStatus()
        res.json(
          _.sortBy(app.plugins, [
            plugin => {
              return plugin.name
            }
          ]).map(plugin => {
            let data = null
            try {
              data = getPluginOptions(plugin.id)
            } catch (e) {
              console.log(e.code + ' ' + e.path)
            }

            if (_.isUndefined(data.enabled) && plugin.enabledByDefault) {
              data.enabled = true
            }

            const schema =
              typeof plugin.schema === 'function'
                ? plugin.schema()
                : plugin.schema
            const status = providerStatus.find(p => p.id === plugin.name)
            const statusMessage = status ? status.message : ''
            const uiSchema =
              typeof plugin.uiSchema === 'function'
                ? plugin.uiSchema()
                : plugin.uiSchema
            return {
              id: plugin.id,
              name: plugin.name,
              version: plugin.version,
              description: plugin.description,
              schema,
              statusMessage,
              uiSchema,
              state: plugin.state,
              data: data
            }
          })
        )
      })
    }
  }

  function ensureExists (dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }
  }

  function pathForPluginId (id) {
    return path.join(app.config.configPath, 'plugin-config-data', id + '.json')
  }

  function dirForPluginId (id) {
    const dirName = path.join(app.config.configPath, 'plugin-config-data', id)
    ensureExists(dirName)
    return dirName
  }

  function savePluginOptions (pluginId, data, callback) {
    const config = JSON.parse(JSON.stringify(data))
    fs.writeFile(
      pathForPluginId(pluginId),
      JSON.stringify(data, null, 2),
      callback
    )
  }

  function getPluginOptions (id) {
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

  function startPlugins (app) {
    app.plugins = []
    app.pluginsMap = {}
    modulesWithKeyword(app, 'signalk-node-server-plugin').forEach(
      moduleData => {
        registerPlugin(
          app,
          moduleData.module,
          moduleData.metadata,
          moduleData.location
        )
      }
    )
  }

  function handleMessageWrapper (app, id) {
    const pluginsLoggingEnabled =
      _.isUndefined(app.config.settings.enablePluginLogging) ||
      app.config.settings.enablePluginLogging
    return (providerId, data) => {
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

  function getSelfPath (path) {
    return _.get(app.signalk.self, path)
  }

  function getPath (path) {
    return _.get(app.signalk.retrieve(), path)
  }

  function putSelfPath (path, value, updateCb) {
    return _putPath(
      app,
      'vessels.self',
      path,
      { value: value },
      null,
      null,
      updateCb
    )
  }

  function putPath (path, value, updateCb) {
    const parts = path.length > 0 ? path.split('.') : []

    if (parts.length <= 2) {
      updateCb(new Error(`Put path begin with a two part context:${path}`))
      return
    }

    const context = `${parts[0]}.${parts[1]}`
    const skpath = parts.slice(2).join('.')
    return _putPath(
      app,
      context,
      skpath,
      { value: value },
      null,
      null,
      updateCb
    )
  }

  function registerPlugin (app, pluginName, metadata, location) {
    debug('Registering plugin ' + pluginName)
    try {
      doRegisterPlugin(app, pluginName, metadata, location)
    } catch (e) {
      console.error(e)
    }
  }

  function stopPlugin (plugin) {
    debug('Stopping plugin ' + plugin.name)
    onStopHandlers[plugin.id].forEach(f => {
      try {
        f()
      } catch (err) {
        console.error(err)
      }
    })
    onStopHandlers[plugin.id] = []
    plugin.stop()
    app.setProviderStatus(plugin.name, 'Stopped')
    debug('Stopped plugin ' + plugin.name)
  }

  function setPluginStartedMessage (plugin) {
    const statusMessage =
      typeof plugin.statusMessage === 'function'
        ? plugin.statusMessage()
        : undefined
    if (
      _.isUndefined(statusMessage) &&
      _.isUndefined(app.providerStatus[plugin.name]) &&
      _.isUndefined(plugin.statusMessage)
    ) {
      app.setProviderStatus(plugin.name, 'Started')
    }
  }

  function doPluginStart (app, plugin, location, configuration, restart) {
    debug('Starting plugin %s from %s', plugin.name, location)
    try {
      app.setProviderStatus(plugin.name, null)
      plugin.start(configuration, restart)
      debug('Started plugin ' + plugin.name)
      setPluginStartedMessage(plugin)
    } catch (e) {
      console.error('error starting plugin: ' + e)
      console.error(e.stack)
      app.setProviderError(plugin.name, `Failed to start: ${e.message}`)
    }
  }

  function doRegisterPlugin (app, packageName, metadata, location) {
    const appCopy = _.assign({}, app, {
      getSelfPath,
      getPath,
      putSelfPath,
      putPath,
      queryRequest,
      error: msg => {
        console.error(`${packageName}:${msg}`)
      },
      debug: require('debug')(packageName),
      registerDeltaInputHandler: handler => {
        onStopHandlers[plugin.id].push(app.registerDeltaInputHandler(handler))
      },
      setProviderStatus: msg => {
        app.setProviderStatus(plugin.name, msg)
      },
      setProviderError: msg => {
        app.setProviderError(plugin.name, msg)
      }
    })
    let plugin
    try {
      plugin = require(path.join(location, packageName))(appCopy)
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

    appCopy.registerPutHandler = (context, path, callback) => {
      onStopHandlers[plugin.id].push(
        app.registerActionHandler(context, path, plugin.id, callback)
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
    const restart = newConfiguration => {
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

    plugin.version = metadata.version
    plugin.packageName = metadata.name
    plugin.packageLocation = location

    const router = express.Router()
    router.get('/', (req, res) => {
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

    router.post('/config', (req, res) => {
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
        if (options.enabled) {
          doPluginStart(app, plugin, location, options.configuration, restart)
        }
      })
    })

    router.get('/config', (req, res) => {
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

const isEnabledByPackageEnableDefault = (options, metadata) =>
  _.isUndefined(options.enabled) &&
  metadata['signalk-plugin-enabled-by-default']
