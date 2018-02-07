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

var debug = require('debug')('signalk:interfaces:plugins')
var fs = require('fs')
var path = require('path')
var express = require('express')
var _ = require('lodash')
const modulesWithKeyword = require('../modules').modulesWithKeyword
const getLogger = require('../logging')

module.exports = function (app) {
  return {
    start: function () {
      startPlugins(app)

      ensureExists(path.join(app.config.configPath, 'plugin-config-data'))

      app.use(
        '/plugins/configure',
        express.static(path.join(__dirname, '/../../plugin-config/public'))
      )

      router = express.Router()

      app.get('/plugins', function (req, res, next) {
        res.json(
          _.sortBy(app.plugins, [
            plugin => {
              return plugin.name
            }
          ]).map(plugin => {
            var data = null
            try {
              data = getPluginOptions(plugin.id)
            } catch (e) {
              console.log(e.code + ' ' + e.path)
            }
            var schema =
              typeof plugin.schema === 'function'
                ? plugin.schema()
                : plugin.schema
            var uiSchema =
              typeof plugin.uiSchema === 'function'
                ? plugin.uiSchema()
                : plugin.uiSchema
            return {
              id: plugin.id,
              name: plugin.name,
              version: plugin.version,
              description: plugin.description,
              schema: schema,
              uiSchema: uiSchema,
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

  function savePluginOptions (pluginId, data, callback) {
    const config = JSON.parse(JSON.stringify(data))
    fs.writeFile(
      pathForPluginId(pluginId),
      JSON.stringify(data, null, 2),
      callback
    )
  }

  function getPluginOptions (id) {
    try {
      const optionsAsString = fs.readFileSync(pathForPluginId(id), 'utf8')
      try {
        const options = JSON.parse(optionsAsString)
        if (process.env.DISABLEPLUGINS) {
          debug('Plugins disabled by configuration')
          options.enabled = false
        }
        debug(optionsAsString)
        return options
      } catch (e) {
        console.error('Could not parse JSON options:' + optionsAsString)
        return {}
      }
    } catch (e) {
      debug(
        'Could not find options for plugin ' + id + ', returning empty options'
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
    return (providerId, data) => {
      var plugin = app.pluginsMap[id]
      if (
        !_.isUndefined(plugin) &&
        app.config.settings.enablePluginLogging &&
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

  function registerPlugin (app, pluginName, metadata, location) {
    debug(`Registering plugin ${pluginName} from ${location}`)
    const appCopy = _.assign({}, app)
    const plugin = require(path.join(location, pluginName))(appCopy)
    appCopy.handleMessage = handleMessageWrapper(app, plugin.id)
    const options = getPluginOptions(plugin.id)
    const restart = newConfiguration => {
      const pluginOptions = getPluginOptions(plugin.id)
      pluginOptions.configuration = newConfiguration
      savePluginOptions(plugin.id, pluginOptions, err => {
        if (err) {
          console.error(err)
        } else {
          plugin.stop()
          plugin.start(newConfiguration, restart)
        }
      })
    }
    if (options && options.enabled) {
      debug('Starting plugin ' + pluginName)
      plugin.start(getPluginOptions(plugin.id).configuration, restart)
    }
    plugin.enableLogging = options.enableLogging
    app.plugins.push(plugin)
    app.pluginsMap[plugin.id] = plugin

    plugin.version = metadata.version
    plugin.packageName = metadata.name

    var router = express.Router()
    router.get('/', (req, res) => {
      const options = getPluginOptions(plugin.id)
      res.json({
        enabled: options.enabled,
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
        plugin.stop()
        const options = getPluginOptions(plugin.id)
        plugin.enableLogging = options.enableLogging
        if (options.enabled) {
          plugin.start(options.configuration, restart)
        }
      })
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
