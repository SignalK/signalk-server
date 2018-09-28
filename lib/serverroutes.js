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
const _ = require('lodash')
const config = require('./config/config')
const { getHttpPort, getSslPort } = require('./ports')

const defaultSecurityStrategy = './tokensecurity'

module.exports = function(app, saveSecurityConfig, getSecurityConfig) {
  let securityWasEnabled

  app.get('/', (req, res) => {
    res.redirect('@signalk/server-admin-ui')
  })
  app.get('/admin', (req, res) => {
    res.redirect('/@signalk/server-admin-ui')
  })

  app.get('/apps', (req, res) => {
    const html = fs.readFileSync(
      require('path').join(__dirname, '/appindex.html'),
      {
        encoding: 'utf8'
      }
    )
    const insertionIndex = html.indexOf('<div/>')
    const sliceToInsertion = html.slice(0, insertionIndex)
    const sliceToEnd = html.slice(insertionIndex)

    let result = sliceToInsertion
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

  app.put('/restart', (req, res) => {
    if (app.securityStrategy.allowRestart(req)) {
      res.send('Restarting...')
      setTimeout(function() {
        process.exit(0)
      }, 2000)
    } else {
      res.status(401).json('Restart not allowed')
    }
  })

  app.get('/loginStatus', (req, res) => {
    const result = app.securityStrategy.getLoginStatus(req)
    result.securityWasEnabled = !_.isUndefined(securityWasEnabled)

    res.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.header('Pragma', 'no-cache')
    res.header('Expires', 0)
    res.json(result)
  })

  app.get('/security/config', (req, res) => {
    if (app.securityStrategy.allowConfigure(req)) {
      const config = getSecurityConfig(app)
      res.json(app.securityStrategy.getConfig(config))
    } else {
      res.status(401).json('Security config not allowed')
    }
  })

  app.put('/security/config', (req, res) => {
    if (app.securityStrategy.allowConfigure(req)) {
      const config = app.securityStrategy.setConfig(config, req.body)
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

  app.get('/security/users', (req, res) => {
    if (app.securityStrategy.allowConfigure(req)) {
      const config = getSecurityConfig(app)
      res.json(app.securityStrategy.getUsers(config))
    } else {
      res.status(401).json('Security config not allowed')
    }
  })

  app.put('/security/users/:id', (req, res) => {
    if (app.securityStrategy.allowConfigure(req)) {
      const config = getSecurityConfig(app)
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

  app.post('/security/users/:id', (req, res) => {
    if (app.securityStrategy.allowConfigure(req)) {
      const config = getSecurityConfig(app)
      const user = req.body
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

  app.put('/security/user/:username/password', (req, res) => {
    if (app.securityStrategy.allowConfigure(req)) {
      const config = getSecurityConfig(app)
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

  app.delete('/security/users/:username', (req, res) => {
    if (app.securityStrategy.allowConfigure(req)) {
      const config = getSecurityConfig(app)
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

  app.get('/security/token/:id/:expiration', (req, res, next) => {
    app.securityStrategy.generateToken(
      req,
      res,
      next,
      req.params.id,
      req.params.expiration
    )
  })

  app.get('/settings', (req, res) => {
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
      runFromSystemd: process.env.LISTEN_FDS > 0
    }

    if (!settings.runFromSystemd) {
      settings.sslport = getSslPort(app)
      settings.port = getHttpPort(app)
      settings.options.ssl = app.config.settings.ssl || false
    }

    const availableInterfaces = require('./interfaces')
    _.forIn(availableInterfaces, function(_interface, name) {
      settings.interfaces[name] =
        _.isUndefined(app.config.settings.interfaces) ||
        _.isUndefined(app.config.settings.interfaces[name]) ||
        app.config.settings.interfaces[name]
    })

    res.json(settings)
  })

  if (app.securityStrategy.getUsers().length === 0) {
    app.post('/enableSecurity', (req, res) => {
      if (app.securityStrategy.isDummy()) {
        app.config.settings.security = { strategy: defaultSecurityStrategy }
        config.writeSettingsFile(app, app.config.settings, err => {
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

  app.put('/settings', (req, res) => {
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

    config.writeSettingsFile(app, app.config.settings, err => {
      if (err) {
        res.status(500).send('Unable to save to settings file')
      } else {
        res.send('Settings changed')
      }
    })
  })

  app.get('/vessel', (req, res) => {
    let defaults

    try {
      defaults = config.readDefaultsFile(app)
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
      gpsFromCenter: _.get(self, 'sensors.gps.fromCenter.value')
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

  app.put('/vessel', (req, res) => {
    let data

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

    let self = _.get(data, 'vessels.self')

    if (_.isUndefined(self)) {
      self = _.set(data, 'vessels.self', {})
    }

    const newVessel = req.body

    const current = app.config.defaults

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

    config.writeDefaultsFile(app, data, err => {
      if (err) {
        res.status(500).send('Unable to save to defaults file')
      } else {
        res.send('Vessel changed')
      }
    })
  })

  app.get('/availablePaths', (req, res) => {
    res.json(app.streambundle.getAvailablePaths())
  })
}
