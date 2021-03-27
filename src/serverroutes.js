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
const os = require('os')
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
const { listAllSerialPorts } = require('./serialports')
const commandExists = require('command-exists')
const { getAuthor, restoreModules } = require('./modules')
const zip = require('express-easy-zip')
const unzipper = require('unzipper')
const moment = require('moment')
const Busboy = require('busboy')
const ncp = require('ncp').ncp

const defaultSecurityStrategy = './tokensecurity'
const skPrefix = '/signalk/v1'
import { SERVERROUTESPREFIX } from './constants'

module.exports = function(app, saveSecurityConfig, getSecurityConfig) {
  let securityWasEnabled
  let restoreFilePath

  const logopath = path.resolve(app.config.configPath, 'logo.svg')
  if (fs.existsSync(logopath)) {
    debug(`Found custom logo at ${logopath}, adding route for it`)
    app.use('/admin/fonts/signal-k-logo-image-text.*', (req, res) =>
      res.sendFile(logopath)
    )
  }

  app.get('/admin/', (req, res) => {
    fs.readFile(
      path.join(
        __dirname,
        '/../node_modules/@signalk/server-admin-ui/public/index.html'
      ),
      (err, indexContent) => {
        if (err) {
          console.error(err)
          res.status(500)
          res.send('Could not handle admin ui root request')
        }
        res.type('html')
        const addonScripts = _.uniq(
          []
            .concat(app.addons)
            .concat(app.pluginconfigurators)
            .concat(app.embeddablewebapps)
        )
        res.send(
          indexContent.toString().replace(
            /%ADDONSCRIPTS%/g,
            addonScripts
              .map(
                moduleInfo =>
                  `<script src="/${moduleInfo.name}/remoteEntry.js"></script>`
              )
              .join('\n')
              .toString()
          )
        )
      }
    )
  })

  app.use(
    '/admin',
    express.static(
      __dirname + '/../node_modules/@signalk/server-admin-ui/public'
    )
  )

  app.get('/', (req, res) => {
    res.redirect(app.config.settings.landingPage || '/admin/')
  })

  app.get('/@signalk/server-admin-ui', (req, res) => {
    res.redirect('/admin')
  })

  app.put(`${SERVERROUTESPREFIX}/restart`, (req, res, next) => {
    if (app.securityStrategy.allowRestart(req)) {
      res.send('Restarting...')
      setTimeout(function() {
        process.exit(0)
      }, 2000)
    } else {
      res.status(401).json('Restart not allowed')
    }
  })

  const getLoginStatus = (req, res) => {
    const result = app.securityStrategy.getLoginStatus(req)
    result.securityWasEnabled = !_.isUndefined(securityWasEnabled)

    res.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.header('Pragma', 'no-cache')
    res.header('Expires', 0)
    res.json(result)
  }

  app.get(`${SERVERROUTESPREFIX}/loginStatus`, getLoginStatus)
  //TODO remove after a grace period
  app.get(`/loginStatus`, (req, res) => {
    console.log(
      `/loginStatus is deprecated, try updating webapps to the latest version`
    )
    getLoginStatus(req, res)
  })

  app.get(`${SERVERROUTESPREFIX}/security/config`, (req, res, next) => {
    if (app.securityStrategy.allowConfigure(req)) {
      const config = getSecurityConfig(app)
      res.json(app.securityStrategy.getConfig(config))
    } else {
      res.status(401).json('Security config not allowed')
    }
  })

  app.put(`${SERVERROUTESPREFIX}/security/config`, (req, res, next) => {
    if (app.securityStrategy.allowConfigure(req)) {

      try {
        app.securityStrategy.validateConfiguration(req.body)
      } catch ( err ) {
        res.status(400).send(err.message)
        return
      }

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

  app.get(`${SERVERROUTESPREFIX}/security/devices`, (req, res, next) => {
    if (checkAllowConfigure(req, res)) {
      const config = getSecurityConfig(app)
      res.json(app.securityStrategy.getDevices(config))
    }
  })

  app.put(`${SERVERROUTESPREFIX}/security/devices/:uuid`, (req, res, next) => {
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

  app.delete(
    `${SERVERROUTESPREFIX}/security/devices/:uuid`,
    (req, res, next) => {
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
    }
  )

  app.get(`${SERVERROUTESPREFIX}/security/users`, (req, res, next) => {
    if (checkAllowConfigure(req, res)) {
      const config = getSecurityConfig(app)
      res.json(app.securityStrategy.getUsers(config))
    }
  })

  app.put(`${SERVERROUTESPREFIX}/security/users/:id`, (req, res, next) => {
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

  app.post(`${SERVERROUTESPREFIX}/security/users/:id`, (req, res, next) => {
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

  app.put(
    `${SERVERROUTESPREFIX}/security/user/:username/password`,
    (req, res, next) => {
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
    }
  )

  app.delete(
    `${SERVERROUTESPREFIX}/security/users/:username`,
    (req, res, next) => {
      if (checkAllowConfigure(req, res)) {
        const config = getSecurityConfig(app)
        app.securityStrategy.deleteUser(
          config,
          req.params.username,
          getConfigSavingCallback('User deleted', 'Unable to delete user', res)
        )
      }
    }
  )

  app.get(
    `${SERVERROUTESPREFIX}/security/token/:id/:expiration`,
    (req, res, next) => {
      app.securityStrategy.generateToken(
        req,
        res,
        next,
        req.params.id,
        req.params.expiration
      )
    }
  )

  app.put(
    [
      `${SERVERROUTESPREFIX}/security/access/requests/:identifier/:status`,
      '/security/access/requests/:identifier/:status' // for backwards compatibly with existing clients
    ],
    (req, res) => {
      if (checkAllowConfigure(req, res)) {
        const config = getSecurityConfig(app)
        app.securityStrategy.setAccessRequestStatus(
          config,
          req.params.identifier,
          req.params.status,
          req.body,
          getConfigSavingCallback(
            'Request updated',
            'Unable update request',
            res
          )
        )
      }
    }
  )

  app.get(`${SERVERROUTESPREFIX}/security/access/requests`, (req, res) => {
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

  app.get(`${SERVERROUTESPREFIX}/settings`, (req, res, next) => {
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
      runFromSystemd: process.env.RUN_FROM_SYSTEMD === 'true'
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
    app.post(`${SERVERROUTESPREFIX}/enableSecurity`, (req, res, next) => {
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

  app.put(`${SERVERROUTESPREFIX}/settings`, (req, res, next) => {
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

  app.get(`${SERVERROUTESPREFIX}/vessel`, (req, res, next) => {
    const de = app.config.baseDeltaEditor
    const communication = de.getSelfValue('communication')
    const draft = de.getSelfValue('design.draft')
    const length = de.getSelfValue('design.length')
    const type = de.getSelfValue('design.aisShipType')
    const json = {
      name: app.config.vesselName,
      mmsi: app.config.vesselMMSI,
      uuid: app.config.vesselUUID,
      draft: draft && draft.maximum,
      length: length && length.overall,
      beam: de.getSelfValue('design.beam'),
      height: de.getSelfValue('design.airHeight'),
      gpsFromBow: de.getSelfValue('sensors.gps.fromBow'),
      gpsFromCenter: de.getSelfValue('sensors.gps.fromCenter'),
      aisShipType: type && type.id,
      callsignVhf: communication && communication.callsignVhf
    }

    res.json(json)
  })

  function writeOldDefaults(req, res) {
    let self
    let data

    try {
      data = skConfig.readDefaultsFile(app)
    } catch (e) {
      if (e.code && e.code === 'ENOENT') {
        data = {}
      } else {
        console.error(e)
        res.status(500).send('Unable to read defaults file')
      }
    }

    self = _.get(data, 'vessels.self')

    if (_.isUndefined(self)) {
      self = _.set(data, 'vessels.self', {})
    }

    const newVessel = req.body

    function setString(skPath, value) {
      _.set(
        data.vessels.self,
        skPath,
        value && value.length > 0 ? value : undefined
      )
    }

    function setNumber(skPath, rmPath, value) {
      if (_.isNumber(value) || (value && value.length) > 0) {
        _.set(data.vessels.self, skPath, Number(value))
      } else {
        _.unset(data.vessels.self, rmPath)
      }
    }

    setString('name', newVessel.name)
    setString('mmsi', newVessel.mmsi)

    if (newVessel.uuid && !self.mmsi) {
      set('uuid', newVessel.uuid)
    } else {
      delete self.uuid
    }
    setNumber('design.draft.value.maximum', 'design.draft', newVessel.draft)
    setNumber('design.length.value.overall', 'design.length', newVessel.length)
    setNumber('design.beam.value', 'design.beam', newVessel.beam)
    setNumber('design.airHeight.value', 'design.airHeight', newVessel.height)
    setNumber(
      'sensors.gps.fromBow.value',
      'sensors.gps.fromBow',
      newVessel.gpsFromBow
    )
    setNumber(
      'sensors.gps.fromCenter.value',
      'sensors.gps.fromCenter',
      newVessel.gpsFromCenter
    )

    if (newVessel.aisShipType) {
      _.set(data.vessels.self, 'design.aisShipType.value', {
        name: getAISShipTypeName(newVessel.aisShipType),
        id: Number(newVessel.aisShipType)
      })
    } else {
      delete self.design.aisShipType
    }

    if (newVessel.callsignVhf) {
      setString('communication.callsignVhf', newVessel.callsignVhf)
    } else {
      delete self.communication
    }

    skConfig.writeDefaultsFile(app, data, err => {
      if (err) {
        res.status(500).send('Unable to save to defaults file')
      } else {
        res.send('Vessel changed')
      }
    })
  }

  app.put(`${SERVERROUTESPREFIX}/vessel`, (req, res, next) => {
    const de = app.config.baseDeltaEditor
    let vessel = req.body

    de.setSelfValue('name', vessel.name)
    app.config.vesselName = vessel.name
    de.setSelfValue('mmsi', vessel.mmsi)
    app.config.vesselMMSI = vessel.mmsi
    if (vessel.uuid && !vessel.mmsi) {
      de.setSelfValue('uuid', vessel.uuid)
      app.config.vesselUUID = vessel.uuid
    } else {
      de.removeSelfValue('uuid')
      delete app.config.vesselUUID
    }

    function makeNumber(num) {
      return !_.isUndefined(num) && (_.isNumber(num) || num.length)
        ? Number(num)
        : undefined
    }

    de.setSelfValue(
      'design.draft',
      !_.isUndefined(vessel.draft) && vessel.draft.length
        ? { maximum: Number(vessel.draft) }
        : undefined
    )
    de.setSelfValue(
      'design.length',
      !_.isUndefined(vessel.length) && vessel.length.length
        ? { overall: Number(vessel.length) }
        : undefined
    )
    de.setSelfValue('design.beam', makeNumber(vessel.beam))
    de.setSelfValue('design.airHeight', makeNumber(vessel.height))
    de.setSelfValue('sensors.gps.fromBow', makeNumber(vessel.gpsFromBow))
    de.setSelfValue('sensors.gps.fromCenter', makeNumber(vessel.gpsFromCenter))
    de.setSelfValue(
      'design.aisShipType',
      !_.isUndefined(vessel.aisShipType) && vessel.aisShipType.length
        ? {
            name: getAISShipTypeName(vessel.aisShipType),
            id: Number(vessel.aisShipType)
          }
        : undefined
    )
    de.setSelfValue(
      'communication',
      !_.isUndefined(vessel.callsignVhf) && vessel.callsignVhf.length
        ? { callsignVhf: vessel.callsignVhf }
        : undefined
    )

    app.emit('serverevent', {
      type: 'VESSEL_INFO',
      data: {
        name: app.config.vesselName,
        mmsi: app.config.vesselMMSI,
        uuid: app.config.vesselUUID
      }
    })

    skConfig.sendBaseDeltas(app)

    if (app.config.hasOldDefaults) {
      writeOldDefaults(req, res)
    } else {
      skConfig
        .writeBaseDeltasFile(app)
        .then(() => {
          res.send('Vessel changed')
        })
        .catch(err => {
          res.status(500).send('Unable to save to defaults file')
        })
    }
  })

  app.get(`${SERVERROUTESPREFIX}/availablePaths`, (req, res, next) => {
    res.json(app.streambundle.getAvailablePaths())
  })

  app.get(`${SERVERROUTESPREFIX}/serialports`, (req, res, next) => {
    listAllSerialPorts()
      .then(ports => res.json(ports))
      .catch(next)
  })

  app.get(`${SERVERROUTESPREFIX}/hasAnalyzer`, (req, res) => {
    commandExists('analyzer')
      .then(() => res.json(true))
      .catch(() => res.json(false))
  })

  app.get(`${SERVERROUTESPREFIX}/sourcePriorities`, (req, res) => {
    res.json(app.config.settings.sourcePriorities || {})
  })

  app.put(`${SERVERROUTESPREFIX}/sourcePriorities`, (req, res) => {
    app.config.settings.sourcePriorities = req.body
    app.activateSourcePriorities()
    skConfig.writeSettingsFile(app, app.config.settings, err => {
      if (err) {
        res
          .status(500)
          .send('Unable to save to sourcePrefences in settings file')
      } else {
        res.json({ result: 'ok' })
      }
    })
  })

  app.post(`${SERVERROUTESPREFIX}/debug`, (req, res) => {
    if (!app.logging.enableDebug(req.body.value)) {
      res.status(400).send('invalid debug value')
    } else {
      res.status(200).send()
    }
  })

  app.get(`${SERVERROUTESPREFIX}/debugKeys`, (req, res) => {
    res.json(_.uniq(require('debug').instances.map(i => i.namespace)))
  })

  app.post(`${SERVERROUTESPREFIX}/rememberDebug`, (req, res) => {
    app.logging.rememberDebug(req.body.value)
    res.status(200).send()
  })

  app.get(`${skPrefix}/apps/list`, (req, res) => {
    res.json(
      app.webapps.map(webapp => {
        return {
          name: webapp.name,
          version: webapp.version,
          description: webapp.description,
          location: `/${webapp.name}`,
          license: webapp.license,
          author: getAuthor(webapp)
        }
      })
    )
  })

  const safeFiles = [
    'settings.json',
    'defaults.json',
    'security.json',
    'package.json'
  ]
  function listSafeRestoreFiles(restorePath) {
    return new Promise((resolve, reject) => {
      readdir(restorePath)
        .catch(reject)
        .then(filnames => {
          const goodFiles = filnames.filter(
            name => safeFiles.indexOf(name) !== -1
          )
          filnames.forEach(name => {
            try {
              const stats = fs.lstatSync(path.join(restorePath, name))
              if (stats.isDirectory()) {
                goodFiles.push(name + '/')
              }
              resolve(goodFiles)
            } catch (err) {
              reject(err)
            }
          })
        })
    })
  }

  function sendRestoreStatus(state, message, percentComplete) {
    const status = {
      state,
      message,
      percentComplete: percentComplete * 100
    }
    app.emit('serverevent', {
      type: 'RESTORESTATUS',
      from: 'signalk-server',
      data: status
    })
  }

  app.post(`${SERVERROUTESPREFIX}/restore`, (req, res, next) => {
    if (!restoreFilePath) {
      res.status(400).send('not exting restore file')
    } else if (!fs.existsSync(restoreFilePath)) {
      res.status(400).send('restore file does not exist')
    } else {
      res.status(202).send()
    }

    listSafeRestoreFiles(restoreFilePath)
      .then(files => {
        const wanted = files.filter(name => {
          const stats = fs.lstatSync(path.join(restoreFilePath, name))
          return req.body[name]
        })

        let hasError = false
        for (let i = 0; i < wanted.length; i++) {
          const name = wanted[i]
          sendRestoreStatus(
            'Copying Files',
            `Copying ${name}`,
            i / wanted.length
          )
          ncp(
            path.join(restoreFilePath, name),
            path.join(app.config.configPath, name),
            { stopOnErr: true },
            err => {
              if (err) {
                sendRestoreStatus('error', err.message)
                hasError = true
              }
            }
          )
        }
        if (!hasError) {
          sendRestoreStatus('Installing Plugins', '', 1)

          restoreModules(
            app,
            output => {
              sendRestoreStatus('Installing Plugins', `${output}`, 1)
              console.log(`stdout: ${output}`)
            },
            output => {
              //sendRestoreStatus('Error', `${output}`, 1)
              console.error(`stderr: ${output}`)
            },
            code => {
              sendRestoreStatus('Complete', 'Please restart', 1)
            }
          )
        }
      })
      .catch(err => {
        console.error(err)
        sendRestoreStatus('error', err.message)
      })
  })

  app.post(`${SERVERROUTESPREFIX}/validateBackup`, (req, res, next) => {
    const busboy = new Busboy({ headers: req.headers })
    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      try {
        if (!filename.endsWith('.backup')) {
          res
            .status(400)
            .send('the backup file does not have the .backup extension')
          return
        }
        if (!filename.startsWith('signalk-')) {
          res.status(400).send('the backup file does not start with signalk-')
          return
        }
        const tmpDir = os.tmpdir()
        restoreFilePath = fs.mkdtempSync(`${tmpDir}${path.sep}`)
        const zipFileDir = fs.mkdtempSync(`${tmpDir}${path.sep}`)
        const zipFile = path.join(zipFileDir, 'backup.zip')
        const unzipStream = unzipper.Extract({ path: restoreFilePath })

        file
          .pipe(fs.createWriteStream(zipFile))
          .on('error', err => {
            console.error(err)
            res.status(500).send(err.message)
          })
          .on('close', () => {
            const zipStream = fs.createReadStream(zipFile)

            zipStream
              .pipe(unzipStream)
              .on('error', err => {
                console.error(err)
                res.status(500).send(err.message)
              })
              .on('close', () => {
                fs.unlinkSync(zipFile)
                listSafeRestoreFiles(restoreFilePath)
                  .then(files => {
                    res.send(files)
                  })
                  .catch(err => {
                    console.error(err)
                    res.status(500).send(err.message)
                  })
              })
          })
      } catch (err) {
        console.log(err)
        res.status(500).send(err.message)
      }
    })
    busboy.on('error', err => {
      console.log(err)
      res.status(500).send(err.message)
    })
    busboy.on('finish', function() {
      console.log('finish')
    })
    req.pipe(busboy)
  })

  app.use(zip())

  app.get(`${SERVERROUTESPREFIX}/backup`, (req, res) => {
    readdir(app.config.configPath).then(filenames => {
      const files = filenames
        .filter(file => {
          return (
            (file !== 'node_modules' ||
              (file === 'node_modules' &&
                req.query.includePlugins === 'true')) &&
            !file.endsWith('.log') &&
            file !== 'signalk-server' &&
            file !== '.npmrc'
          )
        })
        .map(name => {
          const filename = path.join(app.config.configPath, name)
          return {
            path: filename,
            name
          }
        })
      res.zip({
        files,
        filename: `signalk-${moment().format('MMM-DD-YYYY-HHTmm')}.backup`
      })
    })
  })
}
