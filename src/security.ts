/* eslint-disable @typescript-eslint/no-explicit-any */
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

import { AuthenticationProvider, RoutePermission } from '@signalk/server-api'
import { Request, Response } from 'express'
import { PartialOIDCConfig } from './oidc/types'
import {
  chmodSync,
  existsSync,
  readFileSync,
  Stats,
  statSync,
  writeFileSync
} from 'fs'
import { atomicWriteFile } from './atomicWrite'
import _ from 'lodash'
import path from 'path'
import { generate } from 'selfsigned'
import { Mode } from 'stat-mode'
import { WithConfig } from './app'
import { createDebug } from './debug'
import { LoginRateLimiter } from './login-rate-limiter'
import dummysecurity from './dummysecurity'
import { ICallback } from './types'
const debug = createDebug('signalk-server:security')

export interface WithSecurityStrategy {
  securityStrategy: SecurityStrategy
}

/** Login method offered on the login page */
export interface AuthProviderStatus {
  id: string
  name: string
  loginUrl: string
  autoLogin: boolean
}

export interface LoginStatusResponse {
  status: string // 'loggedIn' 'notLoggedIn'
  readOnlyAccess?: boolean
  authenticationRequired?: boolean
  allowNewUserRegistration?: boolean
  allowDeviceAccessRequests?: boolean
  userLevel?: any
  username?: string
  authProviders?: AuthProviderStatus[]
}

export interface ACL {
  context: string
  resources: Array<{
    paths?: string[]
    sources?: string[]
    permissions: Array<{
      subject: string
      permission: string
    }>
  }>
}
/**
 * Link between a local user record and the identity an authentication
 * provider established for it. Users are matched on provider + issuer +
 * subject; email and name are informational.
 */
export interface ExternalIdentityRecord {
  provider: string
  subject: string
  issuer?: string
  email?: string
  name?: string
}

export interface User {
  username: string
  type: string
  password?: string
  identity?: ExternalIdentityRecord
}

/** Shape written by servers before external identities became generic */
interface LegacyOIDCUser extends User {
  oidc?: { sub?: unknown; issuer?: unknown; email?: unknown; name?: unknown }
}

/**
 * Rewrites the `oidc` user field of older security.json files into
 * `identity`. Applied to every config read; the file itself takes the new
 * shape on the next save. Malformed legacy records are left untouched.
 */
export function migrateLegacyIdentities(users: User[]): void {
  for (const user of users as LegacyOIDCUser[]) {
    const legacy = user.oidc
    if (
      !legacy ||
      typeof legacy.sub !== 'string' ||
      typeof legacy.issuer !== 'string'
    ) {
      continue
    }
    if (!user.identity) {
      user.identity = {
        provider: 'oidc',
        subject: legacy.sub,
        issuer: legacy.issuer
      }
      if (typeof legacy.email === 'string') user.identity.email = legacy.email
      if (typeof legacy.name === 'string') user.identity.name = legacy.name
    }
    delete user.oidc
  }
}

export interface UserData {
  userId: string
  type: string
  identity?: ExternalIdentityRecord
}
export interface UserDataUpdate {
  type?: string
  password?: string
}

export interface UserWithPassword {
  userId: string
  type: string
  password: string
}

export interface Device {
  clientId: string
  permissions: string
  config: any
  description: string
  requestedPermissions: string
  tokenExpiry?: number
}

export interface DeviceDataUpdate {
  permissions?: string
  description?: string
}

export interface OIDCSecurityConfig {
  enabled: boolean
  issuer: string
  clientId: string
  clientSecret: string
  redirectUri?: string
  scope?: string
  defaultPermission?: 'readonly' | 'readwrite' | 'admin'
  autoCreateUsers?: boolean
}

export interface SecurityConfig {
  immutableConfig: boolean
  allow_readonly: boolean
  allowNewUserRegistration: boolean
  allowDeviceAccessRequests: boolean
  allowedCorsOrigins?: string
  expiration: string
  devices: Device[]
  secretKey: string
  users: User[]
  acls?: ACL[]
  oidc?: OIDCSecurityConfig
}

export interface RequestStatusData {
  expiration: string
  permissions: any
  config: any
}

export interface SecurityStrategy {
  isDummy: () => boolean
  allowReadOnly: () => boolean
  shouldFilterDeltas: () => boolean
  filterReadDelta: (user: any, delta: any) => any
  configFromArguments: boolean
  securityConfig: any
  requestAccess: (config: any, request: any, ip: any, updateCb?: any) => any
  getConfiguration: () => any

  setAccessRequestStatus: (
    theConfig: SecurityConfig,
    identifier: string,
    status: string,
    body: RequestStatusData,
    cb: ICallback<SecurityConfig>
  ) => void
  getAccessRequestsResponse: any

  getLoginStatus: (req: Request) => LoginStatusResponse
  allowRestart: (req: Request) => boolean
  allowConfigure: (req: Request) => boolean

  getConfig: (ss: SecurityConfig) => Omit<SecurityConfig, 'secretKey' | 'users'>
  setConfig: (prev: SecurityConfig, next: SecurityConfig) => SecurityConfig

  validateConfiguration: (config: any) => void
  getDevices: (theConfig: SecurityConfig) => Device[]
  updateDevice: (
    theConfig: SecurityConfig,
    clientId: string,
    updates: DeviceDataUpdate,
    cb: ICallback<SecurityConfig>
  ) => void
  deleteDevice: (
    theConfig: SecurityConfig,
    clientId: string,
    cb: ICallback<SecurityConfig>
  ) => void

  generateToken: (
    req: Request,
    res: Response,
    next: any,
    id: string,
    expiration: string
  ) => void

  getUsers: (theConfig: SecurityConfig) => UserData[]
  addUser: (
    theConfig: SecurityConfig,
    user: User,
    cb: ICallback<SecurityConfig>
  ) => void
  updateUser: (
    theConfig: SecurityConfig,
    username: string,
    userDataUpdate: UserDataUpdate,
    cb: ICallback<SecurityConfig>
  ) => void
  deleteUser: (
    theConfig: SecurityConfig,
    username: string,
    cb: ICallback<SecurityConfig>
  ) => void

  setPassword: (
    theConfig: SecurityConfig,
    username: string,
    password: string,
    cb: ICallback<SecurityConfig>
  ) => void

  shouldAllowPut: (
    req: Request,
    context: string,
    source: any,
    path: string
  ) => boolean

  addAdminMiddleware: (path: string) => void
  addAdminWriteMiddleware: (path: string) => void
  addWriteMiddleware: (path: string) => void

  /** Record non-admin access levels for plugin routes (optional - only available when token security is active) */
  registerPluginRoutePermissions?: (
    pluginId: string,
    permissions: RoutePermission[]
  ) => void

  /** Update OIDC config in memory (optional - only available when token security is active) */
  updateOIDCConfig?: (newOidcConfig: PartialOIDCConfig) => void

  /**
   * Add a passport-backed login method (optional - only available when token
   * security is active). Returns a function that removes it again.
   */
  registerAuthenticationProvider?: (
    provider: AuthenticationProvider
  ) => () => void

  /** Verify credentials (optional - only available when token security is active) */
  login?: (
    username: string,
    password: string
  ) => Promise<{ statusCode: number }>

  /** Shared login rate limiter (optional - only available when token security is active) */
  loginRateLimiter?: LoginRateLimiter
}

export class InvalidTokenError extends Error {
  constructor(...args: any[]) {
    super(...args)
    Error.captureStackTrace(this, InvalidTokenError)
  }
}

export function startSecurity(
  app: WithSecurityStrategy & WithConfig,
  securityConfig: any
) {
  let securityStrategyModuleName =
    process.env.SECURITYSTRATEGY ||
    _.get(app, 'config.settings.security.strategy')

  if (securityStrategyModuleName) {
    if (securityStrategyModuleName === 'sk-simple-token-security') {
      console.log(
        'The sk-simple-token-security security strategy is depricated, please update to @signalk/sk-simple-token-security'
      )
      process.exit(1)
    } else if (
      securityStrategyModuleName === '@signalk/sk-simple-token-security'
    ) {
      securityStrategyModuleName = './tokensecurity'
    }

    const config = securityConfig || getSecurityConfig(app, true)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    app.securityStrategy = require(securityStrategyModuleName)(app, config)

    if (securityConfig) {
      app.securityStrategy.configFromArguments = true
      app.securityStrategy.securityConfig = securityConfig
    }
  } else {
    app.securityStrategy = dummysecurity()
  }
}

export function getSecurityConfig(
  app: WithConfig & WithSecurityStrategy,
  forceRead = false
) {
  if (!forceRead && app.securityStrategy?.configFromArguments) {
    return app.securityStrategy.securityConfig
  } else {
    try {
      const optionsAsString = readFileSync(pathForSecurityConfig(app), 'utf8')
      const config = JSON.parse(optionsAsString)
      if (Array.isArray(config.users)) {
        migrateLegacyIdentities(config.users)
      }
      return config
    } catch (e: any) {
      // Suppress the ENOENT noise when security is off. The strategy may be
      // undefined here because setupCors() reads the security config before
      // startSecurity() installs the dummy strategy — treat that as dummy.
      const hasRealSecurity =
        app.securityStrategy && !app.securityStrategy.isDummy()
      if (e.code !== 'ENOENT' || hasRealSecurity) {
        console.error(
          'Could not parse security config at %s: %s',
          pathForSecurityConfig(app),
          e.message
        )
      }
      return {}
    }
  }
}

export function pathForSecurityConfig(app: WithConfig) {
  return path.join(app.config.configPath, 'security.json')
}

export function saveSecurityConfig(
  app: WithSecurityStrategy & WithConfig,
  data: any,
  callback: any
) {
  if (app.securityStrategy.configFromArguments) {
    app.securityStrategy.securityConfig = data
    if (callback) {
      callback(null)
    }
  } else {
    const configPath = pathForSecurityConfig(app)
    atomicWriteFile(configPath, JSON.stringify(data, null, 2))
      .then(() => {
        chmodSync(configPath, '600')
        if (callback) {
          callback(null)
        }
      })
      .catch((err: any) => {
        if (callback) {
          callback(err)
        }
      })
  }
}

export function getCertificateOptions(app: WithConfig, cb: any) {
  let certLocation

  if (!app.config.configPath || existsSync('./settings/ssl-cert.pem')) {
    certLocation = './settings'
  } else {
    certLocation = app.config.configPath
  }

  const certFile = path.join(certLocation, 'ssl-cert.pem')
  const keyFile = path.join(certLocation, 'ssl-key.pem')
  const chainFile = path.join(certLocation, 'ssl-chain.pem')

  if (existsSync(certFile) && existsSync(keyFile)) {
    if (!hasStrictPermissions(statSync(keyFile))) {
      cb(
        new Error(
          `${keyFile} must be accessible only by the user that is running the server, refusing to start`
        )
      )
      return
    }
    if (!hasStrictPermissions(statSync(certFile))) {
      cb(
        new Error(
          `${certFile} must be accessible only by the user that is running the server, refusing to start`
        )
      )
      return
    }
    let ca
    if (existsSync(chainFile)) {
      debug('Found ssl-chain.pem')
      ca = getCAChainArray(chainFile)
      debug.enabled && debug(JSON.stringify(ca, null, 2))
    }
    debug(`Using certificate ssl-key.pem and ssl-cert.pem in ${certLocation}`)
    cb(null, {
      key: readFileSync(keyFile),
      cert: readFileSync(certFile),
      ca
    })
  } else {
    createCertificateOptions(app, certFile, keyFile, cb)
  }
}

function hasStrictPermissions(stat: Stats) {
  if (process.platform === 'win32') {
    return true
  } else {
    return /^-r[-w][-x]------$/.test(new Mode(stat).toString())
  }
}

export function getCAChainArray(filename: string) {
  let chainCert = new Array<string>()
  return readFileSync(filename, 'utf8')
    .split('\n')
    .reduce((ca, line) => {
      chainCert.push(line)
      if (line.match(/-END CERTIFICATE-/)) {
        ca.push(chainCert.join('\n'))
        chainCert = []
      }
      return ca
    }, new Array<string>())
}

export function createCertificateOptions(
  app: WithConfig,
  certFile: string,
  keyFile: string,
  cb: any
) {
  const location = app.config.configPath ? app.config.configPath : './settings'
  debug(`Creating certificate files in ${location}`)
  generate(
    [{ name: 'commonName', value: 'localhost' }],
    { days: 3650, keySize: 2048 },
    function (err, pems) {
      writeFileSync(keyFile, pems.private)
      chmodSync(keyFile, '600')
      writeFileSync(certFile, pems.cert)
      chmodSync(certFile, '600')
      cb(null, {
        key: pems.private,
        cert: pems.cert
      })
    }
  )
}

export function requestAccess(
  app: WithSecurityStrategy & WithConfig,
  request: any,
  ip: any,
  updateCb: any
) {
  const config = getSecurityConfig(app)
  return app.securityStrategy.requestAccess(config, request, ip, updateCb)
}

export type SecurityConfigSaver = (
  app: any,
  securityConfig: any,
  cb: (err: any) => void
) => void
export type SecurityConfigGetter = (app: any) => any

/**
 * When Express trust proxy is enabled:
 * - req.ip will reflect the client IP and we don't want rateLimit to
 *   validate the presence of x-forwarded-for.
 * - trustProxy: false prevents ERR_ERL_PERMISSIVE_TRUST_PROXY warnings
 */
export function getRateLimitValidationOptions(app: WithConfig) {
  return app.config?.settings?.trustProxy &&
    app.config.settings.trustProxy !== 'false'
    ? { xForwardedForHeader: false, trustProxy: false }
    : undefined
}
