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
const readdir = require('util').promisify(fs.readdir)
const page = require('./page')
const debug = require('debug')('signalk-server:serverroutes')
const path = require('path')
const _ = require('lodash')
const skConfig = require('./config/config')
const { getHttpPort, getSslPort } = require('./ports')
const express = require('express')
const { getAISShipTypeName } = require('@signalk/signalk-schema')
const { queryRequest } = require('./requestResponse')
const serialBingings = require('@serialport/bindings')
const commandExists = require('command-exists')

const defaultSecurityStrategy = './tokensecurity'
const skPrefix = '/signalk/v1'
const serverRoutesPrefix = '/skServer'

module.exports = function(app, saveSecurityConfig, getSecurityConfig) {
  let securityWasEnabled

  app.use(
    '/admin',
    express.static(
      __dirname + '/../node_modules/@signalk/server-admin-ui/public'
    )
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
    const result = app.securityStrategy.getLoginStatus(req)
    result.securityWasEnabled = !_.isUndefined(securityWasEnabled)

    res.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.header('Pragma', 'no-cache')
    res.header('Expires', 0)
    res.json(result)
  })

  app.get('/security/config', (req, res, next) => {
    if (app.securityStrategy.allowConfigure(req)) {
      const config = getSecurityConfig(app)
      res.json(app.securityStrategy.getConfig(config))
    } else {
      res.status(401).json('Security config not allowed')
    }
  })

  app.put('/security/config', (req, res, next) => {
    if (app.securityStrategy.allowConfigure(req)) {
      let config = getSecurityConfig(app)
      config = app.securityStrategy.setConfig(config, req.body)
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
        saveSecurityConfig(app, config, theError => {
          if (theError) {
            console.log(theError)
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
      const config = getSecurityConfig(app)
      res.json(app.securityStrategy.getDevices(config))
    }
  })

  app.put('/security/devices/:uuid', (req, res, next) => {
    if (checkAllowConfigure(req, res)) {
      const config = getSecurityConfig(app)
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
      const config = getSecurityConfig(app)
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
      const config = getSecurityConfig(app)
      res.json(app.securityStrategy.getUsers(config))
    }
  })

  app.put('/security/users/:id', (req, res, next) => {
    if (checkAllowConfigure(req, res)) {
      const config = getSecurityConfig(app)
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
      const config = getSecurityConfig(app)
      const user = req.body
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
      const config = getSecurityConfig(app)
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
      const config = getSecurityConfig(app)
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
      const config = getSecurityConfig(app)
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
    const config = getSecurityConfig(app)
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    if (!app.securityStrategy.requestAccess) {
      res.status(404).json({
        message:
          'Access requests not available. Server security may not be enabled.'
      })
      return
    }
    app.securityStrategy
      .requestAccess(config, { accessRequest: req.body }, ip)
      .then(reply => {
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
    const settings = {
      interfaces: {},
      options: {
        mdns: app.config.settings.mdns || false,
        wsCompression: app.config.settings.wsCompression || false,
        enablePluginLogging:
          _.isUndefined(app.config.settings.enablePluginLogging) ||
          app.config.settings.enablePluginLogging
      },
      loggingDirectory: app.config.settings.loggingDirectory,
      pruneContextsMinutes: app.config.settings.pruneContextsMinutes || 60,
      runFromSystemd: process.env.LISTEN_FDS > 0
    }

    if (!settings.runFromSystemd) {
      settings.sslport = getSslPort(app)
      settings.port = getHttpPort(app)
      settings.options.ssl = app.config.settings.ssl || false
    }

    const availableInterfaces = require('./interfaces')
    // tslint:disable-next-line:variable-name
    _.forIn(availableInterfaces, function(_interface, name) {
      settings.interfaces[name] =
        _.isUndefined(app.config.settings.interfaces) ||
        _.isUndefined(app.config.settings.interfaces[name]) ||
        app.config.settings.interfaces[name]
    })

    res.json(settings)
  })

  if (app.securityStrategy.getUsers().length === 0) {
    app.post('/enableSecurity', (req, res, next) => {
      if (app.securityStrategy.isDummy()) {
        app.config.settings.security = { strategy: defaultSecurityStrategy }
        const adminUser = req.body
        if (
          !adminUser.userId ||
          adminUser.userId.length === 0 ||
          !adminUser.password ||
          adminUser.password.length === 0
        ) {
          res.status(400).send('userId or password missing or too short')
          return
        }
        skConfig.writeSettingsFile(app, app.config.settings, err => {
          if (err) {
            console.log(err)
            res.status(500).send('Unable to save to settings file')
          } else {
            const config = {}
            const securityStrategy = require(defaultSecurityStrategy)(
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

      function addUser(request, response, securityStrategy, config) {
        if (!config) {
          config = app.securityStrategy.getConfiguration()
        }
        securityStrategy.addUser(config, request.body, (err, theConfig) => {
          if (err) {
            console.log(err)
            response.status(500)
            response.send('Unable to add user')
          } else {
            saveSecurityConfig(app, theConfig, theError => {
              if (theError) {
                console.log(theError)
                response.status(500)
                response.send('Unable to save security configuration change')
              }
              response.send('Security enabled')
            })
          }
        })
      }
    })
  }

  app.put('/settings', (req, res, next) => {
    const settings = req.body

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

    if (!_.isUndefined(settings.pruneContextsMinutes)) {
      app.config.settings.pruneContextsMinutes = Number(
        settings.pruneContextsMinutes
      )
    }

    skConfig.writeSettingsFile(app, app.config.settings, err => {
      if (err) {
        res.status(500).send('Unable to save to settings file')
      } else {
        res.send('Settings changed')
      }
    })
  })

  app.get('/vessel', (req, res, next) => {
    let defaults

    try {
      defaults = skConfig.readDefaultsFile(app)
    } catch (e) {
      defaults = {
        vessels: {
          self: {}
        }
      }
    }
    const self = defaults.vessels.self

    const json = {
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
    let data

    try {
      data = skConfig.readDefaultsFile(app)
    } catch (e) {
      if (e.code && e.code === 'ENOENT') {
        data = {}
      } else {
        console.log(e)
        res.status(500).send('Unable to read defaults file')
      }
    }

    let self = _.get(data, 'vessels.self')

    if (_.isUndefined(self)) {
      self = _.set(data, 'vessels.self', {})
    }

    const newVessel = req.body

    const current = app.config.defaults

    function set(skPath, value) {
      _.set(data.vessels.self, skPath, value)
      _.set(current, skPath, value)
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

    skConfig.writeDefaultsFile(app, data, err => {
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
    Promise.all([
      listSafeSerialPortsDevSerialById(),
      listSafeSerialPortsDevSerialByPath(),
      listSafeSerialPortsOpenPlotter(),
      listSerialPorts()
    ])
      .then(([byId, byPath, byOpenPlotter, serialports]) =>
        res.json({ byId, byPath, byOpenPlotter, serialports })
      )
      .catch(next)
  })

  function listSerialPorts() {
    return serialBingings.list().then(ports => {
      return ports.map(port => port.comName)
    })
  }

  function listSafeSerialPortsDevSerialById() {
    return readdir('/dev/serial/by-id')
      .catch(err => [])
      .then(filenames =>
        filenames.map(filename => `/dev/serial/by-id/${filename}`)
      )
  }

  function listSafeSerialPortsDevSerialByPath() {
    return readdir('/dev/serial/by-path')
      .catch(err => [])
      .then(filenames =>
        filenames.map(filename => `/dev/serial/by-path/${filename}`)
      )
  }

  function listSafeSerialPortsOpenPlotter() {
    return readdir('/dev/')
      .catch(err => [])
      .then(filenames =>
        filenames
          .filter(filename => filename.startsWith('ttyOP_'))
          .map(filename => `/dev/${filename}`)
      )
  }

  app.get(`${serverRoutesPrefix}/hasAnalyzer`, (req, res) => {
    commandExists('analyzer')
      .then(() => res.json(true))
      .catch(() => res.json(false))
  })
}
