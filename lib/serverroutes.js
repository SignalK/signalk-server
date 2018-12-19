/*
 * Copyright 2017 Teppo Kurki <teppo.kurki@iki.fi>
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

const fs = require('fs')
const debug = require('debug')('signalk-server:serverroutes')
const path = require('path')
const _ = require('lodash')
const express = require('express')
const serialBindings = require('@serialport/bindings')
const { getAISShipTypeName } = require('@signalk/signalk-schema')
const page = require('./page')
const config = require('./config/config')
const { getHttpPort, getSslPort } = require('./ports')
const { queryRequest } = require('./requestResponse')
const { getModulePublicPath } = require('./config/get')
const defaultSecurityStrategy = './tokensecurity'
const skPrefix = '/signalk/v1'

module.exports = function(app, saveSecurityConfig, getSecurityConfig) {
  var securityWasEnabled

  app.use(
    '/admin',
    express.static(getModulePublicPath('@signalk/server-admin-ui', app))
  )

  app.get('/', (req, res) => {
    res.redirect('/admin')
  })

  app.get('/@signalk/server-admin-ui', (req, res) => {
    res.redirect('/admin')
  })

  app.put('/restart', (req, res, next) => {
    if (app.securityStrategy.allowRestart(req)) {
      res.send('Restarting...')
      setTimeout(function() {
        process.exit(0)
      }, 2000)
    } else {
      res.status(401).json('Restart not allowed')
    }
  })

  app.get('/loginStatus', (req, res, next) => {
    result = app.securityStrategy.getLoginStatus(req)
    result.securityWasEnabled = !_.isUndefined(securityWasEnabled)

    res.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.header('Pragma', 'no-cache')
    res.header('Expires', 0)
    res.json(result)
  })

  app.get('/security/config', (req, res, next) => {
    if (app.securityStrategy.allowConfigure(req)) {
      var config = getSecurityConfig(app)
      res.json(app.securityStrategy.getConfig(config))
    } else {
      res.status(401).json('Security config not allowed')
    }
  })

  app.put('/security/config', (req, res, next) => {
    if (app.securityStrategy.allowConfigure(req)) {
      var config = getSecurityConfig(app)
      var config = app.securityStrategy.setConfig(config, req.body)
      saveSecurityConfig(app, config, err => {
        if (err) {
          console.log(err)
          res.status(500)
          res.send('Unable to save configuration change')
          return
        }
        res.send('security config saved')
      })
    } else {
      res.status(401).send('Security config not allowed')
    }
  })

  function getConfigSavingCallback(success, failure, res) {
    return (err, config) => {
      if (err) {
        console.log(err)
        res.status(500).send(failure)
      } else if (config) {
        saveSecurityConfig(app, config, err => {
          if (err) {
            console.log(err)
            res.status(500).send('Unable to save configuration change')
            return
          }
          res.send(success)
        })
      } else {
        res.send(success)
      }
    }
  }

  function checkAllowConfigure(req, res) {
    if (app.securityStrategy.allowConfigure(req)) {
      return true
    } else {
      res.status(401).json('Security config not allowed')
      return false
    }
  }

  app.get('/security/devices', (req, res, next) => {
    if (checkAllowConfigure(req, res)) {
      var config = getSecurityConfig(app)
      res.json(app.securityStrategy.getDevices(config))
    }
  })

  app.put('/security/devices/:uuid', (req, res, next) => {
    if (checkAllowConfigure(req, res)) {
      var config = getSecurityConfig(app)
      app.securityStrategy.updateDevice(
        config,
        req.params.uuid,
        req.body,
        getConfigSavingCallback(
          'Device updated',
          'Unable to update device',
          res
        )
      )
    }
  })

  app.delete('/security/devices/:uuid', (req, res, next) => {
    if (checkAllowConfigure(req, res)) {
      var config = getSecurityConfig(app)
      app.securityStrategy.deleteDevice(
        config,
        req.params.uuid,
        getConfigSavingCallback(
          'Device deleted',
          'Unable to delete device',
          res
        )
      )
    }
  })

  app.get('/security/users', (req, res, next) => {
    if (checkAllowConfigure(req, res)) {
      var config = getSecurityConfig(app)
      res.json(app.securityStrategy.getUsers(config))
    }
  })

  app.put('/security/users/:id', (req, res, next) => {
    if (checkAllowConfigure(req, res)) {
      var config = getSecurityConfig(app)
      app.securityStrategy.updateUser(
        config,
        req.params.id,
        req.body,
        getConfigSavingCallback('User updated', 'Unable to add user', res)
      )
    }
  })

  app.post('/security/users/:id', (req, res, next) => {
    if (checkAllowConfigure(req, res)) {
      var config = getSecurityConfig(app)
      var user = req.body
      user.userId = req.params.id
      app.securityStrategy.addUser(
        config,
        user,
        getConfigSavingCallback('User added', 'Unable to add user', res)
      )
    }
  })

  app.put('/security/user/:username/password', (req, res, next) => {
    if (checkAllowConfigure(req, res)) {
      var config = getSecurityConfig(app)
      app.securityStrategy.setPassword(
        config,
        req.params.username,
        req.body,
        getConfigSavingCallback(
          'Password changed',
          'Unable to change password',
          err
        )
      )
    }
  })

  app.delete('/security/users/:username', (req, res, next) => {
    if (checkAllowConfigure(req, res)) {
      var config = getSecurityConfig(app)
      app.securityStrategy.deleteUser(
        config,
        req.params.username,
        getConfigSavingCallback('User deleted', 'Unable to delete user', res)
      )
    }
  })

  app.get('/security/token/:id/:expiration', (req, res, next) => {
    app.securityStrategy.generateToken(
      req,
      res,
      next,
      req.params.id,
      req.params.expiration
    )
  })

  app.put('/security/access/requests/:identifier/:status', (req, res) => {
    if (checkAllowConfigure(req, res)) {
      var config = getSecurityConfig(app)
      app.securityStrategy.setAccessRequestStatus(
        config,
        req.params.identifier,
        req.params.status,
        req.body,
        getConfigSavingCallback('Request updated', 'Unable update request', res)
      )
    }
  })

  app.get('/security/access/requests', (req, res) => {
    if (checkAllowConfigure(req, res)) {
      res.json(app.securityStrategy.getAccessRequestsResponse())
    }
  })

  app.post(`${skPrefix}/access/requests`, (req, res) => {
    var config = getSecurityConfig(app)
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    app.securityStrategy
      .requestAccess(config, { accessRequest: req.body }, ip)
      .then((reply, config) => {
        res.status(reply.state === 'PENDING' ? 202 : reply.statusCode)
        res.json(reply)
      })
      .catch(err => {
        console.log(err.stack)
        res.status(500).send(err.message)
      })
  })

  app.get(`${skPrefix}/requests/:id`, (req, res) => {
    queryRequest(req.params.id)
      .then(reply => {
        res.json(reply)
      })
      .catch(err => {
        console.log(err)
        res.status(500)
        res.send(`Unable to check request: ${err.message}`)
      })
  })

  app.get('/settings', (req, res, next) => {
    var settings = {
      interfaces: {},
      options: {
        mdns: app.config.settings.mdns || false,
        wsCompression: app.config.settings.wsCompression || false,
        enablePluginLogging:
          _.isUndefined(app.config.settings.enablePluginLogging) ||
          app.config.settings.enablePluginLogging
      },
      loggingDirectory: app.config.settings.loggingDirectory,
      runFromSystemd: process.env.LISTEN_FDS > 0
    }

    if (!settings.runFromSystemd) {
      settings.sslport = getSslPort(app)
      settings.port = getHttpPort(app)
      settings.options.ssl = app.config.settings.ssl || false
    }

    var availableInterfaces = require('./interfaces')
    _.forIn(availableInterfaces, function(interface, name) {
      settings.interfaces[name] =
        _.isUndefined(app.config.settings.interfaces) ||
        _.isUndefined(app.config.settings.interfaces[name]) ||
        app.config.settings.interfaces[name]
    })

    res.json(settings)
  })

  if (app.securityStrategy.getUsers().length == 0) {
    app.post('/enableSecurity', (req, res, next) => {
      if (app.securityStrategy.isDummy()) {
        app.config.settings.security = { strategy: defaultSecurityStrategy }
        config.writeSettingsFile(app, app.config.settings, err => {
          if (err) {
            console.log(err)
            res.status(500).send('Unable to save to settings file')
          } else {
            var config = {}
            var securityStrategy = require(defaultSecurityStrategy)(
              app,
              config,
              saveSecurityConfig
            )
            addUser(req, res, securityStrategy, config)
          }
        })
      } else {
        addUser(req, res, app.securityStrategy)
      }
      securityWasEnabled = true

      function addUser(req, res, securityStrategy, config) {
        if (!config) {
          config = app.securityStrategy.getConfiguration()
        }
        securityStrategy.addUser(config, req.body, (err, config) => {
          if (err) {
            console.log(err)
            res.status(500)
            res.send('Unable to add user')
          } else {
            saveSecurityConfig(app, config, err => {
              if (err) {
                console.log(err)
                res.status(500)
                res.send('Unable to save security configuration change')
              }
              res.send('Security enabled')
            })
          }
        })
      }
    })
  }

  app.put('/settings', (req, res, next) => {
    var settings = req.body

    _.forIn(settings.interfaces, (enabled, name) => {
      app.config.settings.interfaces[name] = enabled
    })

    if (!_.isUndefined(settings.options.mdns)) {
      app.config.settings.mdns = settings.options.mdns
    }

    if (!_.isUndefined(settings.options.ssl)) {
      app.config.settings.ssl = settings.options.ssl
    }

    if (!_.isUndefined(settings.options.wsCompression)) {
      app.config.settings.wsCompression = settings.options.wsCompression
    }

    if (!_.isUndefined(settings.options.enablePluginLogging)) {
      app.config.settings.enablePluginLogging =
        settings.options.enablePluginLogging
    }

    if (!_.isUndefined(settings.port)) {
      app.config.settings.port = Number(settings.port)
    }

    if (!_.isUndefined(settings.sslport)) {
      app.config.settings.sslport = Number(settings.sslport)
    }

    if (!_.isUndefined(settings.loggingDirectory)) {
      app.config.settings.loggingDirectory = settings.loggingDirectory
    }

    config.writeSettingsFile(app, app.config.settings, err => {
      if (err) {
        res.status(500).send('Unable to save to settings file')
      } else {
        res.send('Settings changed')
      }
    })
  })

  app.get('/vessel', (req, res, next) => {
    var defaults

    try {
      defaults = config.readDefaultsFile(app)
    } catch (e) {
      defaults = {
        vessels: {
          self: {}
        }
      }
    }
    var self = defaults.vessels.self

    var json = {
      name: self.name,
      mmsi: self.mmsi,
      uuid: self.uuid,
      draft: _.get(self, 'design.draft.value.maximum'),
      length: _.get(self, 'design.length.value.overall'),
      beam: _.get(self, 'design.beam.value'),
      height: _.get(self, 'design.airHeight.value'),
      gpsFromBow: _.get(self, 'sensors.gps.fromBow.value'),
      gpsFromCenter: _.get(self, 'sensors.gps.fromCenter.value'),
      aisShipType: _.get(self, 'design.aisShipType.value.id')
    }

    if (app.config.settings.vessel) {
      if (!json.name) {
        json.name = app.config.settings.vessel.name
      }
      if (!json.uuid && !json.mmsi) {
        json.mmsi = app.config.settings.vessel.mmsi
        json.uuid = app.config.settings.vessel.uuid
      }
    }

    res.json(json)
  })

  app.put('/vessel', (req, res, next) => {
    var data

    try {
      data = config.readDefaultsFile(app)
    } catch (e) {
      if (e.code && e.code === 'ENOENT') {
        data = {}
      } else {
        console.log(e)
        res.status(500).send('Unable to read defaults file')
      }
    }

    var self = _.get(data, 'vessels.self')

    if (_.isUndefined(self)) {
      self = _.set(data, 'vessels.self', {})
    }

    var newVessel = req.body

    var current = app.config.defaults

    function set(path, value) {
      _.set(data.vessels.self, path, value)
      _.set(current, path, value)
    }

    if (newVessel.name) {
      set('name', newVessel.name)
    }
    if (newVessel.mmsi) {
      set('mmsi', newVessel.mmsi)
    }
    if (newVessel.uuid && !self.mmmsi) {
      set('uuid', newVessel.uuid)
    } else {
      delete self.uuid
    }
    if (newVessel.draft) {
      set('design.draft.value.maximum', Number(newVessel.draft))
    }
    if (newVessel.length) {
      set('design.length.value.overall', Number(newVessel.length))
    }
    if (newVessel.beam) {
      set('design.beam.value', Number(newVessel.beam))
    }
    if (newVessel.height) {
      set('design.airHeight.value', Number(newVessel.height))
    }
    if (newVessel.gpsFromBow) {
      set('sensors.gps.fromBow.value', Number(newVessel.gpsFromBow))
    }
    if (newVessel.gpsFromCenter) {
      set('sensors.gps.fromCenter.value', Number(newVessel.gpsFromCenter))
    }
    if (newVessel.aisShipType) {
      set('design.aisShipType.value', {
        name: getAISShipTypeName(newVessel.aisShipType),
        id: Number(newVessel.aisShipType)
      })
    }

    config.writeDefaultsFile(app, data, err => {
      if (err) {
        res.status(500).send('Unable to save to defaults file')
      } else {
        res.send('Vessel changed')
      }
    })
  })

  app.get('/availablePaths', (req, res, next) => {
    res.json(app.streambundle.getAvailablePaths())
  })

  app.get('/serialports', (req, res, next) => {
    serialBindings
      .list()
      .then(ports => {
        res.json(ports.map(port => port.comName))
      })
      .catch(next)
  })
}
