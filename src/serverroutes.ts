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

import * as http from 'http'
import * as https from 'https'
import bcrypt from 'bcryptjs'
import busboy from 'busboy'
import commandExists from 'command-exists'
import express, { IRouter, NextFunction, Request, Response } from 'express'
import { sendZip } from './zip'
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
import { resetPriorities } from './config/priorities-file'
import { buildDeviceIdentities } from './deviceIdentities'
import { SERVERROUTESPREFIX } from './constants'
import { handleAdminUICORSOrigin } from './cors'
import { createDebug, listKnownDebugs } from './debug'
import { PluginManager } from './interfaces/plugins'
import { getAuthor, Package, restoreModules } from './modules'
import { getHttpPort, getSslPort } from './ports'
import { queryRequest } from './requestResponse'
import {
  getRateLimitValidationOptions,
  pathForSecurityConfig,
  SecurityConfig,
  SecurityConfigGetter,
  SecurityConfigSaver,
  SecurityStrategy,
  User,
  WithSecurityStrategy
} from './security'
import { listAllSerialPorts } from './serialports'
import { StreamBundle } from './streambundle'
import { WithWrappedEmitter } from './events'
import { getAISShipTypeName, metadataRegistry } from '@signalk/path-metadata'
import availableInterfaces from './interfaces'
import redirects from './redirects.json'
import rateLimit from 'express-rate-limit'
import { execSync } from 'child_process'
import { recommendedVersion as recommendedNodeVersion } from './version'
import { Type } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

const readdir = util.promisify(fs.readdir)
const debug = createDebug('signalk-server:serverroutes')

// Schemas for the atomic priorities payload and its sub-documents. These are
// the same shapes the delta engine and the persisted settings.json already
// expect; the schemas exist so bad admin requests cannot poison settings.json
// with the wrong types.
const priorityEntrySchema = Type.Object({
  sourceRef: Type.String({ minLength: 1 }),
  // String form is accepted because the admin UI sometimes round-trips
  // numbers through input fields, but the value must still parse as a
  // (possibly negative) integer — anything else would corrupt the
  // priority engine when it does Number(timeout).
  timeout: Type.Union([Type.Number(), Type.String({ pattern: '^-?\\d+$' })])
})

const priorityOverridesSchema = Type.Record(
  Type.String(),
  Type.Array(priorityEntrySchema)
)

const priorityGroupSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  sources: Type.Array(Type.String({ minLength: 1 })),
  inactive: Type.Optional(Type.Boolean())
})

const priorityGroupsSchema = Type.Array(priorityGroupSchema)

const priorityDefaultsSchema = Type.Object({
  fallbackMs: Type.Optional(Type.Number({ exclusiveMinimum: 0 }))
})

const prioritiesPayloadSchema = Type.Object({
  groups: priorityGroupsSchema,
  overrides: priorityOverridesSchema,
  defaults: priorityDefaultsSchema
})

type PrioritiesPayload = {
  groups: Array<{ id: string; sources: string[]; inactive?: boolean }>
  overrides: Record<
    string,
    Array<{ sourceRef: string; timeout: number | string }>
  >
  defaults: { fallbackMs?: number }
}

// Coerce numeric-string `timeout` values to numbers in-place. The schema
// accepts both shapes for round-tripping through the admin-ui form, but
// downstream consumers (the priority engine, settings.json) expect a
// number — leaving a string here makes typeof checks downstream
// silently misbehave.
function normaliseSourcePriorityTimeouts(
  priorities: Record<
    string,
    Array<{ sourceRef: string; timeout: number | string }>
  >
): void {
  for (const entries of Object.values(priorities)) {
    for (const entry of entries) {
      if (typeof entry.timeout === 'string') {
        entry.timeout = Number(entry.timeout)
      }
    }
  }
}

function validatePrioritiesPayload(
  body: unknown
): { ok: true; value: PrioritiesPayload } | { ok: false; error: string } {
  if (!Value.Check(prioritiesPayloadSchema, body)) {
    const first = Value.Errors(prioritiesPayloadSchema, body).First()
    return {
      ok: false,
      error: first
        ? `Invalid priorities payload at ${first.path}: ${first.message}`
        : 'Invalid priorities payload'
    }
  }
  const value = body as PrioritiesPayload
  // Reject duplicate sourceRefs across active groups. The engine resolves
  // a source's group with first-found-wins, but the connected-component
  // construction on the client should never produce overlap; defending
  // here stops a hand-edited or out-of-sync payload from poisoning the
  // engine's source→group map.
  const seen = new Map<string, string>()
  for (const g of value.groups) {
    if (g.inactive) continue
    for (const src of g.sources) {
      const prev = seen.get(src)
      if (prev && prev !== g.id) {
        return {
          ok: false,
          error: `Source ${src} appears in groups ${prev} and ${g.id}; a source may belong to at most one active group.`
        }
      }
      seen.set(src, g.id)
    }
  }
  normaliseSourcePriorityTimeouts(value.overrides)
  return { ok: true, value }
}

const sourceAliasesSchema = Type.Record(
  Type.String(),
  Type.String({ minLength: 1 })
)

const ignoredInstanceConflictsSchema = Type.Record(
  Type.String(),
  Type.String({ minLength: 1 })
)

function validateAgainst(
  schema: Parameters<typeof Value.Check>[0],
  body: unknown,
  name: string
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!Value.Check(schema, body)) {
    const first = Value.Errors(schema, body).First()
    return {
      ok: false,
      error: first
        ? `Invalid ${name} payload at ${first.path}: ${first.message}`
        : `Invalid ${name} payload`
    }
  }
  return { ok: true, value: body }
}
const ncp = ncpI.ncp
const defaultSecurityStrategy = './tokensecurity'
const skPrefix = '/signalk/v1'

type HttpRateLimitOverrides = {
  windowMs: number
  apiMax: number
  loginStatusMax: number
}

const DEFAULT_HTTP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000 // 10 minutes
const DEFAULT_HTTP_RATE_LIMIT_API_MAX = 1000
const DEFAULT_HTTP_RATE_LIMIT_LOGIN_STATUS_MAX = 1000

function getHttpRateLimitOverridesFromEnv(): HttpRateLimitOverrides {
  const raw = process.env.HTTP_RATE_LIMITS
  const defaults: HttpRateLimitOverrides = {
    windowMs: DEFAULT_HTTP_RATE_LIMIT_WINDOW_MS,
    apiMax: DEFAULT_HTTP_RATE_LIMIT_API_MAX,
    loginStatusMax: DEFAULT_HTTP_RATE_LIMIT_LOGIN_STATUS_MAX
  }

  if (!raw || typeof raw !== 'string') {
    return defaults
  }

  const parts = raw
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean)

  let overrides = { ...defaults }
  for (const part of parts) {
    const eqIndex = part.indexOf('=')
    if (eqIndex === -1) {
      continue
    }

    const key = part.slice(0, eqIndex).trim().toLowerCase()
    const value = part.slice(eqIndex + 1).trim()
    const parsed = Number.parseInt(value, 10)

    if ((key === 'windowms' || key === 'window') && Number.isFinite(parsed)) {
      overrides = { ...overrides, windowMs: parsed }
    } else if ((key === 'api' || key === 'apimax') && Number.isFinite(parsed)) {
      overrides = { ...overrides, apiMax: parsed }
    } else if (
      (key === 'loginstatus' || key === 'loginstatusmax') &&
      Number.isFinite(parsed)
    ) {
      overrides = { ...overrides, loginStatusMax: parsed }
    }
  }

  return overrides
}

interface ScriptsApp {
  addons: ModuleInfo[]
  pluginconfigurators: ModuleInfo[]
  embeddablewebapps: ModuleInfo[]
}

interface App
  extends
    ScriptsApp,
    WithSecurityStrategy,
    ConfigApp,
    IRouter,
    PluginManager,
    WithWrappedEmitter {
  webapps: Package[]
  logging: {
    rememberDebug: (r: boolean) => void
    enableDebug: (r: string) => boolean
    addDebug: (name: string) => void
    removeDebug: (name: string) => void
  }
  activateSourcePriorities: () => void
  streambundle: StreamBundle
}

interface ModuleInfo {
  name: string
  type?: string
}

module.exports = function (
  app: App,
  saveSecurityConfig: SecurityConfigSaver,
  getSecurityConfig: SecurityConfigGetter
) {
  const httpRateLimitOverrides = getHttpRateLimitOverridesFromEnv()

  const rateLimitValidationOptions = getRateLimitValidationOptions(app)

  const apiLimiter = rateLimit({
    windowMs: httpRateLimitOverrides.windowMs,
    max: httpRateLimitOverrides.apiMax,
    message: {
      message:
        'Too many requests from this IP, please try again after 10 minutes'
    },
    validate: rateLimitValidationOptions
  })

  const loginStatusLimiter = rateLimit({
    windowMs: httpRateLimitOverrides.windowMs,
    max: httpRateLimitOverrides.loginStatusMax,
    message: {
      message:
        'Too many requests from this IP, please try again after 10 minutes'
    },
    validate: rateLimitValidationOptions
  })

  let securityWasEnabled = false
  const restoreSessions = new Map<string, string>()

  const logopath = path.resolve(app.config.configPath, 'logo.svg')
  if (fs.existsSync(logopath)) {
    debug(`Found custom logo at ${logopath}, adding route for it`)
    // Intercept Webpack (fonts/), Vite 6 (assets/ hashed), and Vite 8 (assets/public_src/img/) paths
    app.use(
      '/admin/fonts/signal-k-logo-image-text.*',
      (req: Request, res: Response) => res.sendFile(logopath)
    )
    app.use(
      '/admin/assets/signal-k-logo-image-text*.svg',
      (req: Request, res: Response) => res.sendFile(logopath)
    )
    app.use(
      '/admin/assets/public_src/img/signal-k-logo-image-text.svg',
      (req: Request, res: Response) => res.sendFile(logopath)
    )

    // Check for custom logo for minimized sidebar, otherwise use the existing logo.
    const minimizedLogoPath = path.resolve(
      app.config.configPath,
      'logo-minimized.svg'
    )
    const minimizedLogo = fs.existsSync(minimizedLogoPath)
      ? minimizedLogoPath
      : logopath
    // Intercept Webpack (fonts/), Vite 6 (assets/ hashed), and Vite 8 (assets/public_src/img/) paths
    app.use(
      '/admin/fonts/signal-k-logo-image.*',
      (req: Request, res: Response) => res.sendFile(minimizedLogo)
    )
    app.use(
      '/admin/assets/signal-k-logo-image*.svg',
      (req: Request, res: Response) => res.sendFile(minimizedLogo)
    )
    app.use(
      '/admin/assets/public_src/img/signal-k-logo-image.svg',
      (req: Request, res: Response) => res.sendFile(minimizedLogo)
    )
  }

  // Vite 8 (Rolldown) changed CSS url() rewriting for publicDir assets: the built CSS
  // references logos as url(public_src/img/...) which resolves to assets/public_src/img/
  // relative to the CSS file, not the actual img/ location. Serve default logos from there.
  app.use(
    '/admin/assets/public_src/img',
    express.static(
      path.join(
        __dirname,
        '/../node_modules/@signalk/server-admin-ui/public/img'
      )
    )
  )

  // mount before the main /admin
  mountSwaggerUi(app, '/doc/openapi')

  // mount server-guide
  app.use('/documentation', express.static(__dirname + '/../docs/dist'))

  // Redirect old documentation URLs to new ones
  let oldpath: keyof typeof redirects
  for (oldpath in redirects) {
    const from = `/documentation/${oldpath}`
    const to = `/documentation/${redirects[oldpath]}`

    app.get(from, (_: Request, res: Response) => {
      res.redirect(301, to)
    })
  }

  const adminUiPath = path.join(
    __dirname,
    '/../node_modules/@signalk/server-admin-ui/public'
  )

  function serveIndexWithAddonScripts(indexPath: string, res: Response) {
    fs.readFile(indexPath, (err, indexContent) => {
      if (err) {
        console.error(err)
        res.status(500)
        res.type('text/plain')
        res.send('Could not handle admin ui root request')
        return
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
            .map((moduleInfo) =>
              moduleInfo.type === 'module'
                ? `<script type="module" src="/${moduleInfo.name}/remoteEntry.js"></script>`
                : `<script src="/${moduleInfo.name}/remoteEntry.js"></script>`
            )
            .join('\n')
            .toString()
        )
      )
    })
  }

  app.get('/admin/', (req: Request, res: Response) => {
    if (!req.originalUrl.endsWith('/')) {
      res.redirect(301, req.originalUrl + '/')
      return
    }
    serveIndexWithAddonScripts(path.join(adminUiPath, 'index.html'), res)
  })

  app.use('/admin', express.static(adminUiPath))

  app.get('/', (req: Request, res: Response) => {
    let landingPage = '/admin/'

    // if accessed with hostname that starts with a webapp's displayName redirect there
    //strip possible port number
    const firstHostName = (req.headers?.host || '')
      .split(':')[0]
      .split('.')[0]
      .toLowerCase()
    const targetWebapp = app.webapps.find(
      (webapp) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (webapp as any).signalk?.displayName?.toLowerCase() === firstHostName
    )
    if (targetWebapp) {
      landingPage = `/${targetWebapp.name}/`
    }

    res.redirect(app.config.settings.landingPage || landingPage)
  })

  app.get('/@signalk/server-admin-ui', (req: Request, res: Response) => {
    res.redirect('/admin/')
  })

  app.put(`${SERVERROUTESPREFIX}/restart`, (req: Request, res: Response) => {
    if (app.securityStrategy.allowRestart(req)) {
      res.json('Restarting...')
      setTimeout(function () {
        process.exit(0)
      }, 2000)
    } else {
      res.status(401).json('Restart not allowed')
    }
  })

  const securityActivationDisabled =
    process.env.DISABLE_SECURITY_ACTIVATION === '1' ||
    process.env.DISABLE_SECURITY_ACTIVATION === 'true'

  const getLoginStatus = (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = app.securityStrategy.getLoginStatus(req)
    result.securityWasEnabled = securityWasEnabled
    if (securityActivationDisabled) {
      delete result.noUsers
    }

    setNoCache(res)
    res.json(result)
  }

  app.get(
    `${SERVERROUTESPREFIX}/loginStatus`,
    loginStatusLimiter,
    getLoginStatus
  )
  //TODO remove after a grace period
  app.get(`/loginStatus`, loginStatusLimiter, (req: Request, res: Response) => {
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
            res.json('Unable to save configuration change')
            return
          }
          res.json('security config saved')
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
        res.status(500).type('text/plain').send(failure)
      } else if (config) {
        saveSecurityConfig(app, config, (theError) => {
          if (theError) {
            console.log(theError)
            res.status(500).send('Unable to save configuration change')
            return
          }
          res.type('text/plain').send(success)
        })
      } else {
        res.type('text/plain').send(success)
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
        app.securityStrategy.addUser(config, user, (err, savedConfig) => {
          if (err) {
            const status = err.message === 'User already exists' ? 400 : 500
            res.status(status).type('text/plain').send(err.message)
          } else if (savedConfig) {
            saveSecurityConfig(app, savedConfig, (saveErr) => {
              if (saveErr) {
                console.log(saveErr)
                res.status(500).send('Unable to save configuration change')
                return
              }
              res.type('text/plain').send('User added')
            })
          } else {
            res.status(500).type('text/plain').send('Unable to add user')
          }
        })
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

  app.put(
    [
      `${SERVERROUTESPREFIX}/security/access/requests/:identifier/:status`,
      '/security/access/requests/:identifier/:status' // for backwards compatibly with existing clients
    ],
    (req: Request, res: Response) => {
      if (!app.securityStrategy.setAccessRequestStatus) {
        res.status(404).json({
          message:
            'Access requests not available. Server security may not be enabled.'
        })
        return
      }
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
      if (!app.securityStrategy.getAccessRequestsResponse) {
        res.status(404).json({
          message:
            'Access requests not available. Server security may not be enabled.'
        })
        return
      }
      if (checkAllowConfigure(req, res)) {
        res.json(app.securityStrategy.getAccessRequestsResponse())
      }
    }
  )

  app.post(
    `${skPrefix}/access/requests`,
    apiLimiter,
    (req: Request, res: Response) => {
      if (
        req.headers['content-length'] &&
        parseInt(req.headers['content-length']) > 10 * 1024
      ) {
        res.status(413).send('Payload too large')
        return
      }
      const config = getSecurityConfig(app)
      const ip = req.ip
      if (app.securityStrategy.isDummy()) {
        res.status(404).json({
          message:
            'Access requests not available. Server security is not enabled.'
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
          console.error(err.message)
          res.status(err.statusCode || 500).send(err.message)
        })
    }
  )

  app.get(
    `${skPrefix}/requests/:id`,
    apiLimiter,
    (req: Request, res: Response) => {
      queryRequest(req.params.id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((reply: any) => {
          res.json(reply)
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .catch((err: any) => {
          console.log(err)
          res.status(500)
          res.type('text/plain').send(`Unable to check request: ${err.message}`)
        })
    }
  )

  app.get(`${SERVERROUTESPREFIX}/settings`, (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings: any = {
      interfaces: {},
      options: {
        mdns: app.config.settings.mdns ?? true,
        wsCompression: app.config.settings.wsCompression || false,
        wsPingInterval: app.config.settings.wsPingInterval ?? 30000,
        accessLogging:
          isUndefined(app.config.settings.accessLogging) ||
          app.config.settings.accessLogging,
        enablePluginLogging:
          isUndefined(app.config.settings.enablePluginLogging) ||
          app.config.settings.enablePluginLogging,
        trustProxy: app.config.settings.trustProxy || false
      },
      loggingDirectory: app.config.settings.loggingDirectory,
      pruneContextsMinutes: app.config.settings.pruneContextsMinutes || 60,
      keepMostRecentLogsOnly:
        isUndefined(app.config.settings.keepMostRecentLogsOnly) ||
        app.config.settings.keepMostRecentLogsOnly,
      logCountToKeep: app.config.settings.logCountToKeep || 24,
      runFromSystemd: process.env.RUN_FROM_SYSTEMD === 'true',
      courseApi: {
        apiOnly: app.config.settings.courseApi?.apiOnly || false
      }
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
    if (securityActivationDisabled) {
      app.post(
        `${SERVERROUTESPREFIX}/enableSecurity`,
        (_req: Request, res: Response) => {
          res.status(403).send('Security activation is disabled')
        }
      )
    } else {
      app.post(
        `${SERVERROUTESPREFIX}/enableSecurity`,
        (req: Request, res: Response) => {
          if (
            securityWasEnabled ||
            app.securityStrategy.getUsers(getSecurityConfig(app)).length > 0
          ) {
            res.status(403).send('Security already enabled')
            return
          }
          if (req.body.restore === true) {
            const { username, password } = req.body
            if (!username || !password) {
              res.status(400).send('Username and password are required')
              return
            }
            const securityConfigPath = pathForSecurityConfig(app)
            const backupPath = securityConfigPath + '.disabled'
            if (!fs.existsSync(backupPath)) {
              res.status(404).send('No security backup found')
              return
            }
            let backupConfig: SecurityConfig
            try {
              backupConfig = JSON.parse(
                fs.readFileSync(backupPath, 'utf8')
              ) as SecurityConfig
            } catch (err) {
              console.error(err)
              res.status(500).send('Unable to read security backup')
              return
            }
            const user = backupConfig.users?.find(
              (u: User) => u.username === username && u.type === 'admin'
            )
            const hashToCompare = user?.password || '$2b$10$invalidhashpadding'
            bcrypt.compare(
              password,
              hashToCompare,
              (err: Error | null, matches: boolean) => {
                if (err) {
                  console.error(err)
                  res.status(500).send('Unable to verify credentials')
                  return
                }
                if (!matches || !user?.password) {
                  res.status(401).send('Invalid username or password')
                  return
                }
                try {
                  fs.renameSync(backupPath, securityConfigPath)
                  app.config.settings.security = {
                    strategy: defaultSecurityStrategy
                  }
                  writeSettingsFile(
                    app,
                    app.config.settings,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (err: any) => {
                      if (err) {
                        console.error(err)
                        fs.renameSync(securityConfigPath, backupPath)
                        res.status(500).send('Unable to save settings')
                        return
                      }
                      securityWasEnabled = true
                      res.send('Security restored, please restart the server')
                    }
                  )
                } catch (err) {
                  console.error(err)
                  res.status(500).send('Unable to restore security')
                }
              }
            )
            return
          }
          if (app.securityStrategy.isDummy()) {
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
            const updatedSettings = structuredClone(app.config.settings)
            updatedSettings.security = { strategy: defaultSecurityStrategy }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            writeSettingsFile(app, updatedSettings, (err: any) => {
              if (err) {
                console.log(err)
                res.status(500).send('Unable to save to settings file')
              } else {
                app.config.settings = updatedSettings
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const config: any = {}
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const securityStrategy = require(defaultSecurityStrategy)(
                  app,
                  config,
                  saveSecurityConfig
                )
                if (req.body.allow_readonly === true) {
                  config.allow_readonly = true
                }
                addUser(req, res, securityStrategy, config)
              }
            })
          } else {
            addUser(req, res, app.securityStrategy)
          }

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
            request.body.type = 'admin'
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
                    response.send(
                      'Unable to save security configuration change'
                    )
                  } else {
                    securityWasEnabled = true
                    response.send('Security enabled')
                  }
                })
              }
            })
          }
        }
      )
    }
  }

  app.post(
    `${SERVERROUTESPREFIX}/disableSecurity`,
    (req: Request, res: Response) => {
      if (!app.securityStrategy.allowConfigure(req)) {
        res.status(401).send('Disable security not allowed')
        return
      }
      const { username, password } = req.body || {}
      if (!username || !password) {
        res.status(400).send('Username and password are required')
        return
      }
      if (!app.securityStrategy.login) {
        res.status(500).send('Login not supported by security strategy')
        return
      }
      const config = getSecurityConfig(app)
      const user = config?.users?.find(
        (u: User) => u.username === username && u.type === 'admin'
      )
      if (!user) {
        res.status(401).send('Invalid username or password')
        return
      }
      app.securityStrategy
        .login(username, password)
        .then((reply) => {
          if (reply.statusCode !== 200) {
            res.status(401).send('Invalid username or password')
            return
          }
          const securityConfigPath = pathForSecurityConfig(app)
          const backupPath = securityConfigPath + '.disabled'
          try {
            if (fs.existsSync(securityConfigPath)) {
              fs.renameSync(securityConfigPath, backupPath)
            }
            delete app.config.settings.security
            writeSettingsFile(app, app.config.settings, (err: Error) => {
              if (err) {
                console.error(err)
                if (fs.existsSync(backupPath)) {
                  fs.renameSync(backupPath, securityConfigPath)
                }
                res.status(500).send('Unable to save settings')
                return
              }
              res.send('Security disabled, please restart the server')
            })
          } catch (err) {
            console.error(err)
            res.status(500).send('Unable to disable security')
          }
        })
        .catch((err) => {
          console.error(err)
          res.status(500).send('Unable to verify credentials')
        })
    }
  )

  app.get(
    `${SERVERROUTESPREFIX}/security/hasBackup`,
    (req: Request, res: Response) => {
      if (
        !app.securityStrategy.isDummy() &&
        !app.securityStrategy.allowConfigure(req)
      ) {
        res.status(401).send('Not authorized')
        return
      }
      const backupPath = pathForSecurityConfig(app) + '.disabled'
      res.json({ hasBackup: fs.existsSync(backupPath) })
    }
  )

  app.securityStrategy.addAdminWriteMiddleware(`${SERVERROUTESPREFIX}/settings`)

  app.put(`${SERVERROUTESPREFIX}/settings`, (req: Request, res: Response) => {
    const settings = req.body
    const updatedSettings = structuredClone(app.config.settings)

    forIn(settings.interfaces, (enabled, name) => {
      const interfaces =
        updatedSettings.interfaces || (updatedSettings.interfaces = {})
      interfaces[name] = enabled
    })

    if (!isUndefined(settings.options.mdns)) {
      updatedSettings.mdns = settings.options.mdns
    }

    if (!isUndefined(settings.options.ssl)) {
      updatedSettings.ssl = settings.options.ssl
    }

    if (!isUndefined(settings.options.wsCompression)) {
      updatedSettings.wsCompression = settings.options.wsCompression
    }

    if (!isUndefined(settings.options.wsPingInterval)) {
      updatedSettings.wsPingInterval = settings.options.wsPingInterval
    }

    if (!isUndefined(settings.options.accessLogging)) {
      updatedSettings.accessLogging = settings.options.accessLogging
    }

    if (!isUndefined(settings.options.enablePluginLogging)) {
      updatedSettings.enablePluginLogging = settings.options.enablePluginLogging
    }

    if (!isUndefined(settings.options.trustProxy)) {
      updatedSettings.trustProxy = settings.options.trustProxy
    }

    if (!isUndefined(settings.port)) {
      updatedSettings.port = Number(settings.port)
    }

    if (!isUndefined(settings.sslport)) {
      updatedSettings.sslport = Number(settings.sslport)
    }

    if (!isUndefined(settings.loggingDirectory)) {
      updatedSettings.loggingDirectory = settings.loggingDirectory
    }

    if (!isUndefined(settings.pruneContextsMinutes)) {
      updatedSettings.pruneContextsMinutes = Number(
        settings.pruneContextsMinutes
      )
    }

    if (!isUndefined(settings.keepMostRecentLogsOnly)) {
      updatedSettings.keepMostRecentLogsOnly = settings.keepMostRecentLogsOnly
    }

    if (!isUndefined(settings.logCountToKeep)) {
      updatedSettings.logCountToKeep = Number(settings.logCountToKeep)
    }

    forIn(settings.courseApi, (enabled, name) => {
      const courseApi: { [index: string]: boolean | string | number } =
        updatedSettings.courseApi || (updatedSettings.courseApi = {})
      courseApi[name] = enabled
    })

    writeSettingsFile(app, updatedSettings, (err: Error) => {
      if (err) {
        res.status(500).send('Unable to save to settings file')
      } else {
        app.config.settings = updatedSettings
        res.type('text/plain').send('Settings changed')
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
      if (isNumber(value) || (value && value.length > 0)) {
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
        res.type('text/plain').send('Vessel changed')
      }
    })
  }

  app.securityStrategy.addAdminWriteMiddleware(`${SERVERROUTESPREFIX}/vessel`)

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
          res.type('text/plain').send('Vessel changed')
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

  app.get(`${SERVERROUTESPREFIX}/paths`, (_req: Request, res: Response) => {
    res.json(metadataRegistry.getAllMetadata())
  })

  app.securityStrategy.addAdminMiddleware(
    `${SERVERROUTESPREFIX}/multiSourcePaths`
  )
  app.get(
    `${SERVERROUTESPREFIX}/multiSourcePaths`,
    (req: Request, res: Response) => {
      res.json(app.deltaCache.getMultiSourcePaths())
    }
  )

  app.securityStrategy.addAdminMiddleware(
    `${SERVERROUTESPREFIX}/reconciledGroups`
  )
  // Reconciled priority groups for the admin UI. Saved groups are
  // authoritative (composition driven by priorityGroups, not by
  // current cache flux); unsaved sources fall through to connected-
  // components discovery.
  app.get(
    `${SERVERROUTESPREFIX}/reconciledGroups`,
    (req: Request, res: Response) => {
      res.json(app.deltaCache.getReconciledGroups())
    }
  )

  app.securityStrategy.addAdminMiddleware(
    `${SERVERROUTESPREFIX}/livePreferredSources`
  )
  // The currently-winning source per path according to the priority
  // engine — distinct from priorityOverrides (the saved configuration).
  // Used by the admin-ui to label and dedup against the actual live
  // winner instead of the rank-1 source from config.
  app.get(
    `${SERVERROUTESPREFIX}/livePreferredSources`,
    (_req: Request, res: Response) => {
      res.json(app.deltaCache.getLivePreferredSources())
    }
  )

  app.securityStrategy.addAdminMiddleware(
    `${SERVERROUTESPREFIX}/deviceIdentities`
  )
  app.get(
    `${SERVERROUTESPREFIX}/deviceIdentities`,
    (_req: Request, res: Response) => {
      res.json(buildDeviceIdentities(app.signalk.sources))
    }
  )

  app.securityStrategy.addAdminMiddleware(
    `${SERVERROUTESPREFIX}/eventsRoutingData`
  )
  app.get(
    `${SERVERROUTESPREFIX}/eventsRoutingData`,
    (req: Request, res: Response) => {
      res.json(app.wrappedEmitter.getEventRoutingData())
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

  // /priorities admin middleware: registered up front so every method
  // (DELETE, GET, PUT) below it picks up auth. Express applies a
  // middleware to routes registered AFTER the middleware call, so the
  // ordering matters — historically the DELETE was registered before
  // this call and silently bypassed auth.
  app.securityStrategy.addAdminMiddleware(`${SERVERROUTESPREFIX}/priorities`)

  // Re-emit the reconciled groups view after any priority config change.
  // The server's getReconciledGroups() runs the saved-vs-live matching;
  // without re-emitting, the client keeps a stale `reconciled` array
  // whose `matchedSavedId` was computed before the save, leaving the
  // freshly-saved group looking unmatched (Unranked badge).
  function emitReconciledGroups(): void {
    app.emit('serverevent', {
      type: 'RECONCILEDGROUPS',
      data: app.deltaCache?.getReconciledGroups?.() ?? []
    })
  }

  app.delete(
    `${SERVERROUTESPREFIX}/priorities`,
    async (_req: Request, res: Response) => {
      try {
        await resetPriorities(app)
        app.activateSourcePriorities()
        // Broadcast fresh empty state so admin-ui store mirrors disk.
        app.emit('serverevent', {
          type: 'PRIORITYOVERRIDES',
          data: {}
        })
        app.emit('serverAdminEvent', {
          type: 'SOURCEALIASES',
          data: {}
        })
        app.emit('serverAdminEvent', {
          type: 'PRIORITYGROUPS',
          data: []
        })
        app.emit('serverAdminEvent', {
          type: 'PRIORITYDEFAULTS',
          data: {}
        })
        emitReconciledGroups()
        res.json({ result: 'ok' })
      } catch (err) {
        console.error('Failed to reset priorities:', err)
        res.status(500).send('Failed to reset priorities')
      }
    }
  )

  app.securityStrategy.addAdminMiddleware(`${SERVERROUTESPREFIX}/sourceAliases`)

  app.get(
    `${SERVERROUTESPREFIX}/sourceAliases`,
    (req: Request, res: Response) => {
      res.json(app.config.settings.sourceAliases || {})
    }
  )

  app.put(
    `${SERVERROUTESPREFIX}/sourceAliases`,
    (req: Request, res: Response) => {
      const validation = validateAgainst(
        sourceAliasesSchema,
        req.body,
        'sourceAliases'
      )
      if (!validation.ok) {
        return res.status(400).send(validation.error)
      }
      const updatedSettings = structuredClone(app.config.settings)
      updatedSettings.sourceAliases = validation.value as Record<string, string>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeSettingsFile(app, updatedSettings, (err: any) => {
        if (err) {
          res.status(500).send('Unable to save sourceAliases in settings file')
        } else {
          app.config.settings = updatedSettings
          app.emit('serverAdminEvent', {
            type: 'SOURCEALIASES',
            data: validation.value
          })
          res.json({ result: 'ok' })
        }
      })
    }
  )

  // Atomic priorities endpoint: writes priorityGroups, priorityOverrides and
  // priorityDefaults in a single settings-file write so clients cannot end up
  // with mismatched ranking vs. overrides vs. default fallback. The two
  // per-field endpoints below remain for plugins/scripts that touch a single
  // surface directly. (Auth middleware was registered above the DELETE
  // handler so all methods on this path are protected.)

  app.get(`${SERVERROUTESPREFIX}/priorities`, (req: Request, res: Response) => {
    res.json({
      groups: app.config.settings.priorityGroups || [],
      overrides: app.config.settings.priorityOverrides || {},
      defaults: app.config.settings.priorityDefaults || {}
    })
  })

  app.put(`${SERVERROUTESPREFIX}/priorities`, (req: Request, res: Response) => {
    const validation = validatePrioritiesPayload(req.body)
    if (!validation.ok) {
      return res.status(400).send(validation.error)
    }
    const { groups, overrides, defaults } = validation.value
    // overrides has been normalised to numbers by validatePrioritiesPayload.
    const overridesNumeric = overrides as Record<
      string,
      Array<{ sourceRef: string; timeout: number }>
    >
    const updatedSettings = structuredClone(app.config.settings)
    updatedSettings.priorityGroups = groups
    updatedSettings.priorityOverrides = overridesNumeric
    updatedSettings.priorityDefaults = defaults
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeSettingsFile(app, updatedSettings, (err: any) => {
      if (err) {
        res.status(500).send('Unable to save priorities in settings file')
      } else {
        app.config.settings = updatedSettings
        app.activateSourcePriorities()
        app.emit('serverAdminEvent', {
          type: 'PRIORITYGROUPS',
          data: groups
        })
        app.emit('serverevent', {
          type: 'PRIORITYOVERRIDES',
          data: overrides
        })
        app.emit('serverAdminEvent', {
          type: 'PRIORITYDEFAULTS',
          data: defaults
        })
        emitReconciledGroups()
        res.json({ result: 'ok' })
      }
    })
  })

  app.securityStrategy.addAdminMiddleware(
    `${SERVERROUTESPREFIX}/priorityGroups`
  )

  app.get(
    `${SERVERROUTESPREFIX}/priorityGroups`,
    (req: Request, res: Response) => {
      res.json(app.config.settings.priorityGroups || [])
    }
  )

  app.put(
    `${SERVERROUTESPREFIX}/priorityGroups`,
    (req: Request, res: Response) => {
      const validation = validateAgainst(
        priorityGroupsSchema,
        req.body,
        'priorityGroups'
      )
      if (!validation.ok) {
        return res.status(400).send(validation.error)
      }
      const updatedSettings = structuredClone(app.config.settings)
      updatedSettings.priorityGroups = validation.value as Array<{
        id: string
        sources: string[]
      }>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeSettingsFile(app, updatedSettings, (err: any) => {
        if (err) {
          res.status(500).send('Unable to save priorityGroups in settings file')
        } else {
          app.config.settings = updatedSettings
          // Group changes affect engine resolution: a source's group
          // membership determines which ranking applies to its deltas.
          app.activateSourcePriorities()
          app.emit('serverAdminEvent', {
            type: 'PRIORITYGROUPS',
            data: validation.value
          })
          emitReconciledGroups()
          res.json({ result: 'ok' })
        }
      })
    }
  )

  app.securityStrategy.addAdminMiddleware(
    `${SERVERROUTESPREFIX}/priorityOverrides`
  )

  app.get(
    `${SERVERROUTESPREFIX}/priorityOverrides`,
    (req: Request, res: Response) => {
      res.json(app.config.settings.priorityOverrides || {})
    }
  )

  app.put(
    `${SERVERROUTESPREFIX}/priorityOverrides`,
    (req: Request, res: Response) => {
      const validation = validateAgainst(
        priorityOverridesSchema,
        req.body,
        'priorityOverrides'
      )
      if (!validation.ok) {
        return res.status(400).send(validation.error)
      }
      const overrides = validation.value as Record<
        string,
        Array<{ sourceRef: string; timeout: number | string }>
      >
      normaliseSourcePriorityTimeouts(overrides)
      const overridesNumeric = overrides as unknown as Record<
        string,
        Array<{ sourceRef: string; timeout: number }>
      >
      const updatedSettings = structuredClone(app.config.settings)
      updatedSettings.priorityOverrides = overridesNumeric
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeSettingsFile(app, updatedSettings, (err: any) => {
        if (err) {
          res
            .status(500)
            .send('Unable to save priorityOverrides in settings file')
        } else {
          app.config.settings = updatedSettings
          app.activateSourcePriorities()
          app.emit('serverevent', {
            type: 'PRIORITYOVERRIDES',
            data: overridesNumeric
          })
          emitReconciledGroups()
          res.json({ result: 'ok' })
        }
      })
    }
  )

  app.securityStrategy.addAdminMiddleware(
    `${SERVERROUTESPREFIX}/priorityDefaults`
  )

  app.get(
    `${SERVERROUTESPREFIX}/priorityDefaults`,
    (req: Request, res: Response) => {
      res.json(app.config.settings.priorityDefaults || {})
    }
  )

  app.put(
    `${SERVERROUTESPREFIX}/priorityDefaults`,
    (req: Request, res: Response) => {
      const validation = validateAgainst(
        priorityDefaultsSchema,
        req.body,
        'priorityDefaults'
      )
      if (!validation.ok) {
        return res.status(400).send(validation.error)
      }
      const updatedSettings = structuredClone(app.config.settings)
      updatedSettings.priorityDefaults = validation.value as {
        fallbackMs?: number
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeSettingsFile(app, updatedSettings, (err: any) => {
        if (err) {
          res
            .status(500)
            .send('Unable to save priorityDefaults in settings file')
        } else {
          app.config.settings = updatedSettings
          app.emit('serverAdminEvent', {
            type: 'PRIORITYDEFAULTS',
            data: validation.value
          })
          res.json({ result: 'ok' })
        }
      })
    }
  )

  app.securityStrategy.addAdminMiddleware(
    `${SERVERROUTESPREFIX}/ignoredInstanceConflicts`
  )

  app.get(
    `${SERVERROUTESPREFIX}/ignoredInstanceConflicts`,
    (req: Request, res: Response) => {
      res.json(app.config.settings.ignoredInstanceConflicts || {})
    }
  )

  app.put(
    `${SERVERROUTESPREFIX}/ignoredInstanceConflicts`,
    (req: Request, res: Response) => {
      const validation = validateAgainst(
        ignoredInstanceConflictsSchema,
        req.body,
        'ignoredInstanceConflicts'
      )
      if (!validation.ok) {
        return res.status(400).send(validation.error)
      }
      const updatedSettings = structuredClone(app.config.settings)
      updatedSettings.ignoredInstanceConflicts = validation.value as Record<
        string,
        string
      >
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeSettingsFile(app, updatedSettings, (err: any) => {
        if (err) {
          res
            .status(500)
            .send('Unable to save ignoredInstanceConflicts in settings file')
        } else {
          app.config.settings = updatedSettings
          // Match the broadcast pattern used by /sourceAliases and the
          // priority-related routes so admin-ui subscribers can pick up
          // changes live without a refetch.
          app.emit('serverAdminEvent', {
            type: 'IGNOREDINSTANCECONFLICTS',
            data: validation.value
          })
          res.json({ result: 'ok' })
        }
      })
    }
  )

  app.securityStrategy.addAdminWriteMiddleware(`${SERVERROUTESPREFIX}/debug`)

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

  const npmVersion = (() => {
    try {
      return execSync('npm --version', { encoding: 'utf8' }).trim()
    } catch {
      return 'unknown'
    }
  })()

  app.get(`${SERVERROUTESPREFIX}/nodeInfo`, (_req: Request, res: Response) => {
    res.json({
      nodeVersion: process.version,
      npmVersion,
      recommendedNodeVersion
    })
  })

  app.securityStrategy.addAdminWriteMiddleware(
    `${SERVERROUTESPREFIX}/rememberDebug`
  )

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
          location: `/${webapp.name}/`,
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
    if (
      !app.securityStrategy.isDummy() &&
      !app.securityStrategy.allowConfigure(req)
    ) {
      res.status(401).send('Restore not allowed')
      return
    }
    const sessionId = getCookie(req, 'restoreSession')
    const restoreFilePath = sessionId
      ? restoreSessions.get(sessionId)
      : undefined

    if (!restoreFilePath) {
      res.status(400).send('not exting restore file')
    } else if (!fs.existsSync(restoreFilePath)) {
      res.status(400).send('restore file does not exist')
    } else {
      res.status(202).send()
    }

    listSafeRestoreFiles(restoreFilePath!)
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
            path.join(restoreFilePath!, name),
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
      if (
        !app.securityStrategy.isDummy() &&
        !app.securityStrategy.allowConfigure(req)
      ) {
        res.status(401).send('Validate backup not allowed')
        return
      }
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
            const restoreFilePath = fs.mkdtempSync(`${tmpDir}${path.sep}`)
            const sessionId =
              Date.now() + '_' + Math.random().toString(36).substr(2, 9)
            restoreSessions.set(sessionId, restoreFilePath)
            setTimeout(() => restoreSessions.delete(sessionId), 15 * 60 * 1000)
            res.cookie('restoreSession', sessionId, {
              httpOnly: true,
              sameSite: 'strict'
            })

            const zipFileDir = fs.mkdtempSync(`${tmpDir}${path.sep}`)
            const zipFile = path.join(zipFileDir, 'backup.zip')

            file
              .pipe(fs.createWriteStream(zipFile))
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .on('error', (err: any) => {
                console.error(err)
                res.status(500).send(err.message)
              })
              .on('close', () => {
                const zipStream = fs.createReadStream(zipFile)
                const extractPromises: Promise<void>[] = []
                const resolvedBase = path.resolve(restoreFilePath)

                zipStream
                  .pipe(unzipper.Parse())
                  .on('entry', (entry: unzipper.Entry) => {
                    const targetPath = path.join(restoreFilePath, entry.path)
                    const resolvedTarget = path.resolve(targetPath)

                    if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
                      console.error(`Zip slip attempt blocked: ${entry.path}`)
                      entry.autodrain()
                      return
                    }

                    if (entry.type === 'Directory') {
                      fs.mkdirSync(resolvedTarget, { recursive: true })
                      entry.autodrain()
                    } else {
                      fs.mkdirSync(path.dirname(resolvedTarget), {
                        recursive: true
                      })
                      const writePromise = new Promise<void>(
                        (resolve, reject) => {
                          entry
                            .pipe(fs.createWriteStream(resolvedTarget))
                            .on('close', resolve)
                            .on('error', reject)
                        }
                      )
                      extractPromises.push(writePromise)
                    }
                  })
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .on('error', (err: any) => {
                    console.error(err)
                    res.status(500).send(err.message)
                  })
                  .on('close', () => {
                    Promise.all(extractPromises)
                      .then(() => {
                        fs.unlinkSync(zipFile)
                        return listSafeRestoreFiles(restoreFilePath)
                      })
                      .then((files) => {
                        res.type('text/plain').send(files)
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
      sendZip(res, {
        files,
        filename: `signalk-${moment().format('MMM-DD-YYYY-HHTmm')}.backup`
      })
    })
  })

  app.securityStrategy.addAdminMiddleware(
    `${SERVERROUTESPREFIX}/testSignalKConnection`
  )
  app.securityStrategy.addAdminMiddleware(`${SERVERROUTESPREFIX}/requestAccess`)
  app.securityStrategy.addAdminMiddleware(
    `${SERVERROUTESPREFIX}/checkAccessRequest`
  )

  app.post(
    `${SERVERROUTESPREFIX}/testSignalKConnection`,
    (req: Request, res: Response) => {
      const { host, port, useTLS, token, selfsignedcert } = req.body

      makeRemoteRequest(host, port, useTLS, selfsignedcert, '/signalk')
        .then((discovery) => {
          if (discovery.status !== 200) {
            return res.json({
              success: false,
              error: `Discovery failed: HTTP ${discovery.status}`
            })
          }

          let server: Record<string, string> | undefined
          try {
            server = JSON.parse(discovery.data).server
          } catch (_e) {
            // ignore parse errors for server info
          }

          if (!token) {
            return res.json({
              success: true,
              authenticated: false,
              server
            })
          }

          return makeRemoteRequest(
            host,
            port,
            useTLS,
            selfsignedcert,
            '/skServer/loginStatus',
            'GET',
            { Authorization: `JWT ${token}` }
          ).then((loginResult) => {
            let loginStatus
            try {
              loginStatus = JSON.parse(loginResult.data)
            } catch (_e) {
              // ignore parse errors
            }

            if (
              loginResult.status !== 200 ||
              !loginStatus ||
              loginStatus.status !== 'loggedIn'
            ) {
              return res.json({
                success: false,
                connected: true,
                error: 'Authentication failed: token may be invalid or revoked',
                server
              })
            }

            res.json({
              success: true,
              authenticated: true,
              userLevel: loginStatus.userLevel,
              username: loginStatus.username,
              server
            })
          })
        })
        .catch((err: Error) => {
          res.json({ success: false, error: err.message })
        })
    }
  )

  app.post(
    `${SERVERROUTESPREFIX}/requestAccess`,
    (req: Request, res: Response) => {
      const { host, port, useTLS, selfsignedcert, clientId, description } =
        req.body

      makeRemoteRequest(
        host,
        port,
        useTLS,
        selfsignedcert,
        '/signalk/v1/access/requests',
        'POST',
        {},
        { clientId, description }
      )
        .then((result) => {
          try {
            const data = JSON.parse(result.data)
            res.json(data)
          } catch (_e) {
            res.json({
              state: 'ERROR',
              error: `Unexpected response: HTTP ${result.status}`
            })
          }
        })
        .catch((err: Error) => {
          res.json({ state: 'ERROR', error: err.message })
        })
    }
  )

  app.post(
    `${SERVERROUTESPREFIX}/checkAccessRequest`,
    (req: Request, res: Response) => {
      const { host, port, useTLS, selfsignedcert, requestId } = req.body

      makeRemoteRequest(
        host,
        port,
        useTLS,
        selfsignedcert,
        `/signalk/v1/requests/${requestId}`
      )
        .then((result) => {
          try {
            const data = JSON.parse(result.data)
            res.json(data)
          } catch (_e) {
            res.json({
              state: 'ERROR',
              error: `Unexpected response: HTTP ${result.status}`
            })
          }
        })
        .catch((err: Error) => {
          res.json({ state: 'ERROR', error: err.message })
        })
    }
  )
}

function makeRemoteRequest(
  host: string,
  port: number,
  useTLS: boolean,
  selfsignedcert: boolean,
  path: string,
  method?: string,
  headers?: Record<string, string>,
  body?: unknown
): Promise<{ status: number | undefined; data: string }> {
  const protocol = useTLS ? https : http
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port,
      path,
      method: method || 'GET',
      headers: {
        ...(headers || {}),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      rejectUnauthorized: !selfsignedcert
    }
    const req = protocol.request(options, (response) => {
      let data = ''
      response.on('data', (chunk: string) => {
        data += chunk
      })
      response.on('end', () => {
        resolve({ status: response.statusCode, data })
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => {
      req.destroy(new Error('Connection timed out'))
    })
    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

const setNoCache = (res: Response) => {
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.header('Pragma', 'no-cache')
  res.header('Expires', '0')
}

function getCookie(req: Request, name: string): string | undefined {
  if (req.headers.cookie) {
    const value = '; ' + req.headers.cookie
    const parts = value.split('; ' + name + '=')
    if (parts.length === 2) {
      return parts.pop()?.split(';').shift()
    }
  }
  return undefined
}
