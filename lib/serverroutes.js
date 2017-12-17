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
const page = require('./page')
const debug = require('debug')('signalk-server:serverroutes')
const path = require('path')
const _ = require('lodash')
const config = require('./config/config')

module.exports = function(app, saveSecurityConfig, getSecurityConfig) {
  app.get('/', (req, res) => {
    let { result, footer } = page(__dirname + '/index.html', '</ul>')

    if (app.securityStrategy) {
      result +=
        '<li class="list-group-item"><a href="/restart">Restart</a></li>'
      if (req.userLoggedIn) {
        result +=
          '<li class="list-group-item"><a href="/logout">Logout</a></li>'
      }
    }

    res.send(result + footer)
  })

  app.get('/apps', (req, res, next) => {
    var html = fs.readFileSync(__dirname + '/appindex.html', {
      encoding: 'utf8'
    })
    var insertionIndex = html.indexOf('<div/>')
    var sliceToInsertion = html.slice(0, insertionIndex)
    var sliceToEnd = html.slice(insertionIndex)

    var result = sliceToInsertion
    result += '<ul class="list-group">'
    result += app.webapps.reduce(function(result, componentInfo) {
      result += '<li class="list-group-item">'
      result +=
        '<b><a href="' +
        componentInfo.name +
        '">' +
        componentInfo.name +
        '</a></b> '
      result += componentInfo.description
      result += '</li>\n'
      return result
    }, '')
    result += '</ul>'
    result += sliceToEnd
    res.send(result)
  })

  app.get('/restart', (req, res, next) => {
    if (
      app.securityStrategy &&
      app.securityStrategy.allowRestart &&
      app.securityStrategy.allowRestart(req)
    ) {
      res.send('Restarting...')
      setTimeout(function() {
        process.exit(0)
      }, 2000)
    } else {
      res.status(401).json('Restart not allowed')
    }
  })

  app.get('/loginStatus', (req, res, next) => {
    if (app.securityStrategy) {
      app.securityStrategy.getLoginStatus(req, res, next)
    } else {
      res.json({
        status: 'notLoggedIn',
        readOnlyAccess: false,
        authenticationRequired: false
      })
    }
  })

  if (app.securityStrategy) {
    app.get('/security/config', (req, res, next) => {
      if (
        app.securityStrategy.allowConfigure &&
        app.securityStrategy.allowConfigure(req)
      ) {
        var config = getSecurityConfig(app)
        res.json(app.securityStrategy.getConfig(config))
      } else {
        res.status(401).json('Security config not allowed')
      }
    })

    app.put('/security/config', (req, res, next) => {
      if (
        app.securityStrategy.allowConfigure &&
        app.securityStrategy.allowConfigure(req)
      ) {
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

    app.get('/security/users', (req, res, next) => {
      if (
        app.securityStrategy.allowConfigure &&
        app.securityStrategy.allowConfigure(req)
      ) {
        var config = getSecurityConfig(app)
        res.json(app.securityStrategy.getUsers(config))
      } else {
        res.status(401).json('Security config not allowed')
      }
    })

    app.put('/security/users/:id', (req, res, next) => {
      if (
        app.securityStrategy.allowConfigure &&
        app.securityStrategy.allowConfigure(req)
      ) {
        var config = getSecurityConfig(app)
        app.securityStrategy.updateUser(
          config,
          req.params.id,
          req.body,
          (err, config) => {
            if (err) {
              console.log(err)
              res.status(500)
              res.send('Unable to add user')
            } else if (config) {
              saveSecurityConfig(app, config, err => {
                if (err) {
                  console.log(err)
                  res.status(500)
                  res.send('Unable to save configuration change')
                  return
                }
                res.send('User updated')
              })
            } else {
              res.send('User updated')
            }
          }
        )
      } else {
        res.status(401).json('security config not allowed')
      }
    })

    app.post('/security/users/:id', (req, res, next) => {
      if (
        app.securityStrategy.allowConfigure &&
        app.securityStrategy.allowConfigure(req)
      ) {
        var config = getSecurityConfig(app)
        var user = req.body
        user.userId = req.params.id
        app.securityStrategy.addUser(config, user, (err, config) => {
          if (err) {
            console.log(err)
            res.status(500)
            res.send('Unable to add user')
          } else if (config) {
            saveSecurityConfig(app, config, err => {
              if (err) {
                console.log(err)
                res.status(500)
                res.send('Unable to save configuration change')
                return
              }
              res.send('User added')
            })
          } else {
            res.send('User added')
          }
        })
      } else {
        res.status(401).json('Security config not allowed')
      }
    })

    app.put('/security/user/:username/password', (req, res, next) => {
      if (
        app.securityStrategy.allowConfigure &&
        app.securityStrategy.allowConfigure(req)
      ) {
        var config = getSecurityConfig(app)
        app.securityStrategy.setPassword(
          config,
          req.params.username,
          req.body,
          (err, config) => {
            if (err) {
              console.log(err)
              res.status(500)
              res.send(err)
              res.send('Unable to change password')
              return
            }
            if (config) {
              saveSecurityConfig(app, config, err => {
                if (err) {
                  console.log(err)
                  res.status(500)
                  res.send('Unable to save configuration change')
                  return
                }
                res.send('Password changed')
              })
            } else {
              res.send('Password changed')
            }
          }
        )
      } else {
        res.status(401).json('Security config not allowed')
      }
    })

    app.delete('/security/users/:username', (req, res, next) => {
      if (
        app.securityStrategy.allowConfigure &&
        app.securityStrategy.allowConfigure(req)
      ) {
        var config = getSecurityConfig(app)
        app.securityStrategy.deleteUser(
          config,
          req.params.username,
          (err, config) => {
            if (err) {
              console.log(err)
              res.status(500)
              res.send('Unable to delete user')
              return
            }
            if (config) {
              saveSecurityConfig(app, config, err => {
                if (err) {
                  console.log(err)
                  res.status(500)
                  res.send('Unable to save configuration change')
                  return
                }
                res.send('User deleted')
              })
            } else {
              res.send('User deleted')
            }
          }
        )
      } else {
        res.status(401).json('Security config not allowed')
      }
    })
  }

  app.get('/settings', (req, res, next) => {
    var settings = {
      interfaces: {},
      options: {
        ssl: app.config.settings.ssl,
        mdns: app.config.settings.mdns
      },
      loggingDirectory: app.config.settings.loggingDirectory || '/tmp',
      port: app.config.settings.port || 3000,
      sslport: app.config.settings.sslport || 3433
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
    if (!app.config.defaults) {
      app.config.defaults = {
        vessels: {
          self: {}
        }
      }
    }

    var self = app.config.defaults.vessels.self

    var json = {
      name: self.name,
      mmsi: self.mmsi,
      uuid: self.uuid,
      draft: _.get(self, 'design.draft.value.maximum'),
      length: _.get(self, 'design.length.value.overall'),
      beam: _.get(self, 'design.beam.value'),
      height: _.get(self, 'design.airHeight.value'),
      gpsFromBow: _.get(self, 'sensors.gps.fromBow.value'),
      gpsFromCenter: _.get(self, 'sensors.gps.fromCenter.value')
    }
    res.json(json)
  })

  app.put('/vessel', (req, res, next) => {
    var self = app.config.defaults.vessels.self
    var newVessel = req.body

    if (newVessel.name) {
      self.name = newVessel.name
    }
    if (newVessel.mmmsi) {
      self.mmmsi = newVessel.mmmsi
    }
    if (newVessel.uuid && !self.mmmsi) {
      self.uuid = newVessel.uuid
    } else {
      delete self.uuid
    }
    if (newVessel.draft) {
      _.set(self, 'design.draft.value.maximum', Number(newVessel.draft))
    }
    if (newVessel.length) {
      _.set(self, 'design.length.value.overall', Number(newVessel.length))
    }
    if (newVessel.beam) {
      _.set(self, 'design.beam.value', Number(newVessel.beam))
    }
    if (newVessel.height) {
      _.set(self, 'design.airHeight.value', Number(newVessel.height))
    }
    if (newVessel.gpsFromBow) {
      _.set(self, 'sensors.gps.fromBow.value', Number(newVessel.gpsFromBow))
    }
    if (newVessel.gpsFromCenter) {
      _.set(
        self,
        'sensors.gps.fromCenter.value',
        Number(newVessel.gpsFromCenter)
      )
    }

    config.writeDefaultsFile(app, app.config.defaults, err => {
      if (err) {
        res.status(500).send('Unable to save to defaults file')
      } else {
        res.send('Vessel changed')
      }
    })
  })
}
