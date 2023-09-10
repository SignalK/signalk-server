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

import busboy from 'busboy'
import commandExists from 'command-exists'
import express, { IRouter, NextFunction, Request, Response } from 'express'
import zip from 'express-easy-zip'
import fs from 'fs'
import { forIn, get, isNumber, isUndefined, set, uniq, unset } from 'lodash'
import moment from 'moment'
import ncpI from 'ncp'
import os from 'os'
import path from 'path'
import unzipper from 'unzipper'
import util from 'util'
import { mountSwaggerUi } from './api/swagger'
import {
  ConfigApp,
  readDefaultsFile,
  sendBaseDeltas,
  writeBaseDeltasFile,
  writeDefaultsFile,
  writeSettingsFile
} from './config/config'
import { SERVERROUTESPREFIX } from './constants'
import { handleAdminUICORSOrigin } from './cors'
import { createDebug, listKnownDebugs } from './debug'
import { PluginManager } from './interfaces/plugins'
import { getAuthor, Package, restoreModules } from './modules'
import { getHttpPort, getSslPort } from './ports'
import { queryRequest } from './requestResponse'
import {
  SecurityConfigGetter,
  SecurityConfigSaver,
  SecurityStrategy,
  WithSecurityStrategy
} from './security'
import { listAllSerialPorts } from './serialports'
import { StreamBundle } from './types'
const readdir = util.promisify(fs.readdir)
const debug = createDebug('signalk-server:serverroutes')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getAISShipTypeName } = require('@signalk/signalk-schema')
const ncp = ncpI.ncp

const defaultSecurityStrategy = './tokensecurity'
const skPrefix = '/signalk/v1'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const availableInterfaces = require('./interfaces')

interface ScriptsApp {
  addons: ModuleInfo[]
  pluginconfigurators: ModuleInfo[]
  embeddablewebapps: ModuleInfo[]
}

interface App
  extends ScriptsApp,
    WithSecurityStrategy,
    ConfigApp,
    IRouter,
    PluginManager {
  webapps: Package[]
  logging: {
    rememberDebug: (r: boolean) => void
    enableDebug: (r: string) => boolean
  }
  activateSourcePriorities: () => void
  streambundle: StreamBundle
}

interface ModuleInfo {
  name: string
}

module.exports = function (
  app: App,
  saveSecurityConfig: SecurityConfigSaver,
  getSecurityConfig: SecurityConfigGetter
) {
  let securityWasEnabled = false
  let restoreFilePath: string

  const logopath = path.resolve(app.config.configPath, 'logo.svg')
  if (fs.existsSync(logopath)) {
    debug(`Found custom logo at ${logopath}, adding route for it`)
    app.use(
      '/admin/fonts/signal-k-logo-image-text.*',
      (req: Request, res: Response) => res.sendFile(logopath)
    )
  }

  // mount before the main /admin
  mountSwaggerUi(app, '/doc/openapi')

  app.get('/admin/', (req: Request, res: Response) => {
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
        const addonScripts = uniq(
          ([] as ModuleInfo[])
            .concat(app.addons)
            .concat(app.pluginconfigurators)
            .concat(app.embeddablewebapps)
        )
        setNoCache(res)
        res.send(
          indexContent.toString().replace(
            /%ADDONSCRIPTS%/g,
            addonScripts
              .map(
                (moduleInfo) =>
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

  app.get('/', (req: Request, res: Response) => {
    res.redirect(app.config.settings.landingPage || '/admin/')
  })

  app.get('/@signalk/server-admin-ui', (req: Request, res: Response) => {
    res.redirect('/admin/')
  })

  app.put(`${SERVERROUTESPREFIX}/restart`, (req: Request, res: Response) => {
    if (app.securityStrategy.allowRestart(req)) {
      res.send('Restarting...')
      setTimeout(function () {
        process.exit(0)
      }, 2000)
    } else {
      res.status(401).json('Restart not allowed')
    }
  })

  const getLoginStatus = (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = app.securityStrategy.getLoginStatus(req)
    result.securityWasEnabled = securityWasEnabled

    setNoCache(res)
    res.json(result)
  }

  app.get(`${SERVERROUTESPREFIX}/loginStatus`, getLoginStatus)
  //TODO remove after a grace period
  app.get(`/loginStatus`, (req: Request, res: Response) => {
    console.log(
      `/loginStatus is deprecated, try updating webapps to the latest version`
    )
    getLoginStatus(req, res)
  })

  app.get(
    `${SERVERROUTESPREFIX}/security/config`,
    (req: Request, res: Response) => {
      if (app.securityStrategy.allowConfigure(req)) {
        const config = getSecurityConfig(app)
        res.json(app.securityStrategy.getConfig(config))
      } else {
        res.status(401).json('Security config not allowed')
      }
    }
  )

  app.put(
    `${SERVERROUTESPREFIX}/security/config`,
    (req: Request, res: Response) => {
      if (app.securityStrategy.allowConfigure(req)) {
        try {
          app.securityStrategy.validateConfiguration(req.body)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
          res.status(400).send(err.message)
          return
        }

        let config = getSecurityConfig(app)
        const configToSave = handleAdminUICORSOrigin(req.body)
        config = app.securityStrategy.setConfig(config, configToSave)
        saveSecurityConfig(app, config, (err) => {
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
    }
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getConfigSavingCallback(success: any, failure: any, res: Response) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (err: any, config: any) => {
      if (err) {
        console.log(err)
        res.status(500).send(failure)
      } else if (config) {
        saveSecurityConfig(app, config, (theError) => {
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

  function checkAllowConfigure(req: Request, res: Response) {
    if (app.securityStrategy.allowConfigure(req)) {
      return true
    } else {
      res.status(401).json('Security config not allowed')
      return false
    }
  }

  app.get(
    `${SERVERROUTESPREFIX}/security/devices`,
    (req: Request, res: Response) => {
      if (checkAllowConfigure(req, res)) {
        const config = getSecurityConfig(app)
        res.json(app.securityStrategy.getDevices(config))
      }
    }
  )

  app.put(
    `${SERVERROUTESPREFIX}/security/devices/:uuid`,
    (req: Request, res: Response) => {
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
    }
  )

  app.delete(
    `${SERVERROUTESPREFIX}/security/devices/:uuid`,
    (req: Request, res: Response) => {
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

  app.get(
    `${SERVERROUTESPREFIX}/security/users`,
    (req: Request, res: Response) => {
      if (checkAllowConfigure(req, res)) {
        const config = getSecurityConfig(app)
        res.json(app.securityStrategy.getUsers(config))
      }
    }
  )

  app.put(
    `${SERVERROUTESPREFIX}/security/users/:id`,
    (req: Request, res: Response) => {
      if (checkAllowConfigure(req, res)) {
        const config = getSecurityConfig(app)
        app.securityStrategy.updateUser(
          config,
          req.params.id,
          req.body,
          getConfigSavingCallback('User updated', 'Unable to add user', res)
        )
      }
    }
  )

  app.post(
    `${SERVERROUTESPREFIX}/security/users/:id`,
    (req: Request, res: Response) => {
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
    }
  )

  app.put(
    `${SERVERROUTESPREFIX}/security/user/:username/password`,
    (req: Request, res: Response) => {
      if (checkAllowConfigure(req, res)) {
        const config = getSecurityConfig(app)
        app.securityStrategy.setPassword(
          config,
          req.params.username,
          req.body,
          getConfigSavingCallback(
            'Password changed',
            'Unable to change password',
            res
          )
        )
      }
    }
  )

  app.delete(
    `${SERVERROUTESPREFIX}/security/users/:username`,
    (req: Request, res: Response) => {
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
    (req: Request, res: Response, next: NextFunction) => {
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
    (req: Request, res: Response) => {
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

  app.get(
    `${SERVERROUTESPREFIX}/security/access/requests`,
    (req: Request, res: Response) => {
      if (checkAllowConfigure(req, res)) {
        res.json(app.securityStrategy.getAccessRequestsResponse())
      }
    }
  )

  app.post(`${skPrefix}/access/requests`, (req: Request, res: Response) => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((reply: any) => {
        res.status(reply.state === 'PENDING' ? 202 : reply.statusCode)
        res.json(reply)
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .catch((err: any) => {
        console.log(err.stack)
        res.status(500).send(err.message)
      })
  })

  app.get(`${skPrefix}/requests/:id`, (req: Request, res: Response) => {
    queryRequest(req.params.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((reply: any) => {
        res.json(reply)
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .catch((err: any) => {
        console.log(err)
        res.status(500)
        res.send(`Unable to check request: ${err.message}`)
      })
  })

  app.get(`${SERVERROUTESPREFIX}/settings`, (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings: any = {
      interfaces: {},
      options: {
        mdns: app.config.settings.mdns || false,
        wsCompression: app.config.settings.wsCompression || false,
        accessLogging:
          isUndefined(app.config.settings.accessLogging) ||
          app.config.settings.accessLogging,
        enablePluginLogging:
          isUndefined(app.config.settings.enablePluginLogging) ||
          app.config.settings.enablePluginLogging
      },
      loggingDirectory: app.config.settings.loggingDirectory,
      pruneContextsMinutes: app.config.settings.pruneContextsMinutes || 60,
      keepMostRecentLogsOnly:
        isUndefined(app.config.settings.keepMostRecentLogsOnly) ||
        app.config.settings.keepMostRecentLogsOnly,
      logCountToKeep: app.config.settings.logCountToKeep || 24,
      runFromSystemd: process.env.RUN_FROM_SYSTEMD === 'true'
    }

    if (!settings.runFromSystemd) {
      settings.sslport = getSslPort(app)
      settings.port = getHttpPort(app)
      settings.options.ssl = app.config.settings.ssl || false
    }

    forIn(availableInterfaces, function (_interface, name) {
      settings.interfaces[name] =
        isUndefined(app.config.settings.interfaces) ||
        isUndefined(app.config.settings.interfaces[name]) ||
        app.config.settings.interfaces[name]
    })

    res.json(settings)
  })

  if (app.securityStrategy.getUsers(getSecurityConfig(app)).length === 0) {
    app.post(
      `${SERVERROUTESPREFIX}/enableSecurity`,
      (req: Request, res: Response) => {
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          writeSettingsFile(app, app.config.settings, (err: any) => {
            if (err) {
              console.log(err)
              res.status(500).send('Unable to save to settings file')
            } else {
              const config = {}
              // eslint-disable-next-line @typescript-eslint/no-var-requires
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

        function addUser(
          request: Request,
          response: Response,
          securityStrategy: SecurityStrategy,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          config?: any
        ) {
          if (!config) {
            config = app.securityStrategy.getConfiguration()
          }
          securityStrategy.addUser(config, request.body, (err, theConfig) => {
            if (err) {
              console.log(err)
              response.status(500)
              response.send('Unable to add user')
            } else {
              saveSecurityConfig(app, theConfig, (theError) => {
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
      }
    )
  }

  app.put(`${SERVERROUTESPREFIX}/settings`, (req: Request, res: Response) => {
    const settings = req.body

    forIn(settings.interfaces, (enabled, name) => {
      const interfaces =
        app.config.settings.interfaces || (app.config.settings.interfaces = {})
      interfaces[name] = enabled
    })

    if (!isUndefined(settings.options.mdns)) {
      app.config.settings.mdns = settings.options.mdns
    }

    if (!isUndefined(settings.options.ssl)) {
      app.config.settings.ssl = settings.options.ssl
    }

    if (!isUndefined(settings.options.wsCompression)) {
      app.config.settings.wsCompression = settings.options.wsCompression
    }

    if (!isUndefined(settings.options.accessLogging)) {
      app.config.settings.accessLogging = settings.options.accessLogging
    }

    if (!isUndefined(settings.options.enablePluginLogging)) {
      app.config.settings.enablePluginLogging =
        settings.options.enablePluginLogging
    }

    if (!isUndefined(settings.port)) {
      app.config.settings.port = Number(settings.port)
    }

    if (!isUndefined(settings.sslport)) {
      app.config.settings.sslport = Number(settings.sslport)
    }

    if (!isUndefined(settings.loggingDirectory)) {
      app.config.settings.loggingDirectory = settings.loggingDirectory
    }

    if (!isUndefined(settings.pruneContextsMinutes)) {
      app.config.settings.pruneContextsMinutes = Number(
        settings.pruneContextsMinutes
      )
    }

    if (!isUndefined(settings.keepMostRecentLogsOnly)) {
      app.config.settings.keepMostRecentLogsOnly =
        settings.keepMostRecentLogsOnly
    }

    if (!isUndefined(settings.logCountToKeep)) {
      app.config.settings.logCountToKeep = Number(settings.logCountToKeep)
    }

    writeSettingsFile(app, app.config.settings, (err: Error) => {
      if (err) {
        res.status(500).send('Unable to save to settings file')
      } else {
        res.send('Settings changed')
      }
    })
  })

  app.get(`${SERVERROUTESPREFIX}/vessel`, (req: Request, res: Response) => {
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

  function writeOldDefaults(req: Request, res: Response) {
    let self
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any

    try {
      data = readDefaultsFile(app)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      if (e.code && e.code === 'ENOENT') {
        data = {}
      } else {
        console.error(e)
        res.status(500).send('Unable to read defaults file')
      }
    }

    self = get(data, 'vessels.self')

    if (isUndefined(self)) {
      self = set(data, 'vessels.self', {})
    }

    const newVessel = req.body

    function setString(skPath: string, value: string) {
      set(
        data.vessels.self,
        skPath,
        value && value.length > 0 ? value : undefined
      )
    }

    function setNumber(skPath: string, rmPath: string, value: string) {
      if (isNumber(value) || (value && value.length) > 0) {
        set(data.vessels.self, skPath, Number(value))
      } else {
        unset(data.vessels.self, rmPath)
      }
    }

    setString('name', newVessel.name)
    setString('mmsi', newVessel.mmsi)

    if (newVessel.uuid && !self.mmsi) {
      setString('uuid', newVessel.uuid)
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
      set(data.vessels.self, 'design.aisShipType.value', {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeDefaultsFile(app, data, (err: any) => {
      if (err) {
        res.status(500).send('Unable to save to defaults file')
      } else {
        res.send('Vessel changed')
      }
    })
  }

  app.put(`${SERVERROUTESPREFIX}/vessel`, (req: Request, res: Response) => {
    const de = app.config.baseDeltaEditor
    const vessel = req.body

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

    function makeNumber(num: string) {
      return !isUndefined(num) && (isNumber(num) || num.length)
        ? Number(num)
        : undefined
    }

    de.setSelfValue(
      'design.draft',
      !isUndefined(vessel.draft) ? { maximum: Number(vessel.draft) } : undefined
    )
    de.setSelfValue(
      'design.length',
      !isUndefined(vessel.length)
        ? { overall: Number(vessel.length) }
        : undefined
    )
    de.setSelfValue('design.beam', makeNumber(vessel.beam))
    de.setSelfValue('design.airHeight', makeNumber(vessel.height))
    de.setSelfValue('sensors.gps.fromBow', makeNumber(vessel.gpsFromBow))
    de.setSelfValue('sensors.gps.fromCenter', makeNumber(vessel.gpsFromCenter))
    de.setSelfValue(
      'design.aisShipType',
      !isUndefined(vessel.aisShipType)
        ? {
            name: getAISShipTypeName(vessel.aisShipType),
            id: Number(vessel.aisShipType)
          }
        : undefined
    )
    de.setSelfValue(
      'communication',
      !isUndefined(vessel.callsignVhf) && vessel.callsignVhf.length
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

    sendBaseDeltas(app)

    if (app.config.hasOldDefaults) {
      writeOldDefaults(req, res)
    } else {
      writeBaseDeltasFile(app)
        .then(() => {
          res.send('Vessel changed')
        })
        .catch(() => {
          res.status(500).send('Unable to save to defaults file')
        })
    }
  })

  app.get(
    `${SERVERROUTESPREFIX}/availablePaths`,
    (req: Request, res: Response) => {
      res.json(app.streambundle.getAvailablePaths())
    }
  )

  app.get(
    `${SERVERROUTESPREFIX}/serialports`,
    (req: Request, res: Response, next: NextFunction) => {
      listAllSerialPorts()
        .then((ports) => res.json(ports))
        .catch(next)
    }
  )

  app.get(
    `${SERVERROUTESPREFIX}/hasAnalyzer`,
    (req: Request, res: Response) => {
      commandExists('analyzer')
        .then(() => res.json(true))
        .catch(() => res.json(false))
    }
  )

  app.get(
    `${SERVERROUTESPREFIX}/sourcePriorities`,
    (req: Request, res: Response) => {
      res.json(app.config.settings.sourcePriorities || {})
    }
  )

  app.put(
    `${SERVERROUTESPREFIX}/sourcePriorities`,
    (req: Request, res: Response) => {
      app.config.settings.sourcePriorities = req.body
      app.activateSourcePriorities()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeSettingsFile(app, app.config.settings, (err: any) => {
        if (err) {
          res
            .status(500)
            .send('Unable to save to sourcePrefences in settings file')
        } else {
          res.json({ result: 'ok' })
        }
      })
    }
  )

  app.post(`${SERVERROUTESPREFIX}/debug`, (req: Request, res: Response) => {
    if (!app.logging.enableDebug(req.body.value)) {
      res.status(400).send('invalid debug value')
    } else {
      res.status(200).send()
    }
  })

  app.get(`${SERVERROUTESPREFIX}/debugKeys`, (req: Request, res: Response) => {
    res.json(listKnownDebugs())
  })

  app.post(
    `${SERVERROUTESPREFIX}/rememberDebug`,
    (req: Request, res: Response) => {
      app.logging.rememberDebug(req.body.value)
      res.status(200).send()
    }
  )

  app.get(`${skPrefix}/apps/list`, (req: Request, res: Response) => {
    res.json(
      app.webapps.map((webapp) => {
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
    'package.json',
    'baseDeltas.json'
  ]
  function listSafeRestoreFiles(restorePath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      readdir(restorePath)
        .catch(reject)
        .then((filenames: string[] | void) => {
          const goodFiles =
            filenames?.filter((name) => safeFiles.indexOf(name) !== -1) || []
          filenames?.forEach((name) => {
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

  function sendRestoreStatus(
    state: string,
    message: string,
    percentComplete: number | null
  ) {
    const status = {
      state,
      message,
      percentComplete: percentComplete ? percentComplete * 100 : '-'
    }
    app.emit('serverevent', {
      type: 'RESTORESTATUS',
      from: 'signalk-server',
      data: status
    })
  }

  app.post(`${SERVERROUTESPREFIX}/restore`, (req: Request, res: Response) => {
    if (!restoreFilePath) {
      res.status(400).send('not exting restore file')
    } else if (!fs.existsSync(restoreFilePath)) {
      res.status(400).send('restore file does not exist')
    } else {
      res.status(202).send()
    }

    listSafeRestoreFiles(restoreFilePath)
      .then((files) => {
        const wanted = files.filter((name) => {
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err: any) => {
              if (err) {
                sendRestoreStatus('error', err.message, null)
                hasError = true
              }
            }
          )
        }
        if (!hasError) {
          sendRestoreStatus('Installing Plugins', '', 1)

          restoreModules(
            app.config,
            (output) => {
              sendRestoreStatus('Installing Plugins', `${output}`, 1)
              console.log(`stdout: ${output}`)
            },
            (output) => {
              //sendRestoreStatus('Error', `${output}`, 1)
              console.error(`stderr: ${output}`)
            },
            () => {
              sendRestoreStatus('Complete', 'Please restart', 1)
            }
          )
        }
      })
      .catch((err) => {
        console.error(err)
        sendRestoreStatus('error', err.message, null)
      })
  })

  app.post(
    `${SERVERROUTESPREFIX}/validateBackup`,
    (req: Request, res: Response) => {
      const bb = busboy({ headers: req.headers })
      bb.on(
        'file',
        (
          fieldname: string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          file: any,
          { filename }
        ) => {
          try {
            if (!filename.endsWith('.backup')) {
              res
                .status(400)
                .send('the backup file does not have the .backup extension')
              return
            }
            if (!filename.startsWith('signalk-')) {
              res
                .status(400)
                .send('the backup file does not start with signalk-')
              return
            }
            const tmpDir = os.tmpdir()
            restoreFilePath = fs.mkdtempSync(`${tmpDir}${path.sep}`)
            const zipFileDir = fs.mkdtempSync(`${tmpDir}${path.sep}`)
            const zipFile = path.join(zipFileDir, 'backup.zip')
            const unzipStream = unzipper.Extract({ path: restoreFilePath })

            file
              .pipe(fs.createWriteStream(zipFile))
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .on('error', (err: any) => {
                console.error(err)
                res.status(500).send(err.message)
              })
              .on('close', () => {
                const zipStream = fs.createReadStream(zipFile)

                zipStream
                  .pipe(unzipStream)
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .on('error', (err: any) => {
                    console.error(err)
                    res.status(500).send(err.message)
                  })
                  .on('close', () => {
                    fs.unlinkSync(zipFile)
                    listSafeRestoreFiles(restoreFilePath)
                      .then((files) => {
                        res.send(files)
                      })
                      .catch((err) => {
                        console.error(err)
                        res.status(500).send(err.message)
                      })
                  })
              })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (err: any) {
            console.log(err)
            res.status(500).send(err.message)
          }
        }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bb.on('error', (err: any) => {
        console.log(err)
        res.status(500).send(err.message)
      })
      bb.on('finish', function () {
        console.log('finish')
      })
      req.pipe(bb)
    }
  )

  app.use(zip())

  app.get(`${SERVERROUTESPREFIX}/backup`, (req: Request, res: Response) => {
    readdir(app.config.configPath).then((filenames) => {
      const files = filenames
        .filter((file) => {
          return (
            (file !== 'node_modules' ||
              (file === 'node_modules' &&
                req.query.includePlugins === 'true')) &&
            !file.endsWith('.log') &&
            file !== 'signalk-server' &&
            file !== '.npmrc'
          )
        })
        .map((name) => {
          const filename = path.join(app.config.configPath, name)
          return {
            path: filename,
            name
          }
        })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyRes = res as any
      anyRes.zip({
        files,
        filename: `signalk-${moment().format('MMM-DD-YYYY-HHTmm')}.backup`
      })
    })
  })
}

const setNoCache = (res: Response) => {
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.header('Pragma', 'no-cache')
  res.header('Expires', '0')
}
