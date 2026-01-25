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

import { NextFunction, Request, Response } from 'express'
import { PartialOIDCConfig } from './oidc/types'
import {
  chmodSync,
  existsSync,
  readFileSync,
  Stats,
  statSync,
  writeFile,
  writeFileSync
} from 'fs'
import _ from 'lodash'
import path from 'path'
import { generate } from 'selfsigned'
import { Mode } from 'stat-mode'
import { SkPrincipal as SkPrincipalBase } from '@signalk/server-api'
import { WithConfig } from './app'
import { createDebug } from './debug'
import dummysecurity from './dummysecurity'
import { ICallback } from './types'
import { Reply, Request as AccessRequestType } from './requestResponse'
const debug = createDebug('signalk-server:security')

// =============================================================================
// Shared Types - Exported for use in other modules
// =============================================================================

/** Principal (authenticated user/device identity) - re-exported from server-api */
export type SkPrincipal = SkPrincipalBase

/** Delta message structure */
export interface Delta {
  context?: string
  updates?: DeltaUpdate[]
}

export interface DeltaUpdate {
  $source?: string
  source?: unknown
  timestamp?: string
  values?: Array<{ path: string; value: unknown }>
  meta?: Array<{ path: string; value: unknown }>
}

/** WebSocket authentication request */
export interface WsAuthRequest {
  token?: string
  query?: { token?: string }
  headers?: Record<string, string | string[] | undefined>
  cookies?: Record<string, string>
  skPrincipal?: SkPrincipal
  skIsAuthenticated?: boolean
  lastTokenVerify?: number
}

/** SignalK-enhanced Express request */
export interface SignalKRequest extends Request {
  skPrincipal?: SkPrincipal
  skIsAuthenticated?: boolean
  userLoggedIn?: boolean
}

/** Login response from authentication */
export interface LoginResponse {
  statusCode: number
  token?: string
  user?: string
  message?: string
}

// =============================================================================
// Security Configuration Types
// =============================================================================

export interface WithSecurityStrategy {
  securityStrategy: SecurityStrategy
}

export interface LoginStatusResponse {
  status: 'loggedIn' | 'notLoggedIn'
  readOnlyAccess?: boolean
  authenticationRequired?: boolean
  allowNewUserRegistration?: boolean
  allowDeviceAccessRequests?: boolean
  userLevel?: string
  username?: string
  noUsers?: boolean
  oidcEnabled?: boolean
  oidcAutoLogin?: boolean
  oidcLoginUrl?: string
  oidcProviderName?: string
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
export interface OIDCUserIdentifier {
  sub: string
  issuer: string
  /** User's email from OIDC claims */
  email?: string
  /** User's display name from OIDC claims */
  name?: string
  /** User's groups from OIDC claims (used for permission mapping) */
  groups?: string[]
}

/** Internal user representation stored in config */
export interface User {
  username: string
  type: string
  password?: string
  oidc?: OIDCUserIdentifier
}

/** User data passed to addUser - uses userId instead of username */
export interface NewUserData {
  userId: string
  type: string
  password?: string
}
export interface UserData {
  userId: string
  type: string
  isOIDC?: boolean
  oidc?: {
    issuer?: string
    email?: string
    name?: string
  }
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
  config?: unknown
  description?: string
  requestedPermissions?: boolean
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
  permissions: string
  config: unknown
}

export interface SecurityStrategy {
  // Core identification
  isDummy: () => boolean

  // Configuration
  configFromArguments: boolean
  securityConfig: SecurityConfig
  getConfiguration: () => SecurityConfig
  validateConfiguration: (config: SecurityConfig) => void
  getConfig: (ss: SecurityConfig) => Omit<SecurityConfig, 'secretKey' | 'users'>
  setConfig: (prev: SecurityConfig, next: SecurityConfig) => SecurityConfig

  // Authentication
  supportsLogin: () => boolean
  login: (username: string, password: string) => Promise<LoginResponse>
  getLoginStatus: (req: Request) => LoginStatusResponse
  getAuthRequiredString: () => 'never' | 'forwrite' | 'always'
  generateToken: (
    req: Request,
    res: Response,
    next: NextFunction,
    id: string,
    expiration: string
  ) => void

  // Authorization
  allowReadOnly: () => boolean
  allowRestart: (req: Request) => boolean
  allowConfigure: (req: Request) => boolean
  shouldAllowPut: (
    req: Request,
    context: string,
    source: string | null,
    path: string
  ) => boolean
  shouldAllowWrite: (req: SignalKRequest, delta: Delta) => boolean

  // WebSocket authentication
  canAuthorizeWS: () => boolean
  authorizeWS: (req: WsAuthRequest) => void
  verifyWS: (req: WsAuthRequest) => void

  // ACL system
  checkACL: (
    id: string,
    context: string,
    path: string,
    source: string | null,
    operation: 'read' | 'write' | 'put'
  ) => boolean
  anyACLs: () => boolean
  shouldFilterDeltas: () => boolean
  filterReadDelta: (
    principal: SkPrincipal | undefined,
    delta: Delta
  ) => Delta | null

  // Access requests
  requestAccess: (
    config: SecurityConfig,
    request: { accessRequest?: unknown; requestId?: string },
    ip: string | null | undefined,
    updateCb?: (reply: Reply) => void
  ) => Promise<Reply>
  getAccessRequestsResponse: () => AccessRequestType[]
  setAccessRequestStatus: (
    theConfig: SecurityConfig,
    identifier: string,
    status: string,
    body: RequestStatusData,
    cb: ICallback<SecurityConfig>
  ) => void

  // User management
  getUsers: (theConfig: SecurityConfig) => UserData[]
  addUser: (
    theConfig: SecurityConfig,
    user: NewUserData,
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

  // Device management
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

  // Middleware
  addAdminMiddleware: (path: string) => void
  addAdminWriteMiddleware: (path: string) => void
  addWriteMiddleware: (path: string) => void

  /** Update OIDC config in memory (optional - only available when token security is active) */
  updateOIDCConfig?: (newOidcConfig: PartialOIDCConfig) => void
}

export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, InvalidTokenError)
  }
}

export function startSecurity(
  app: WithSecurityStrategy & WithConfig,
  securityConfig: SecurityConfig | null
): void {
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
): SecurityConfig {
  if (!forceRead && app.securityStrategy?.configFromArguments) {
    return app.securityStrategy.securityConfig
  } else {
    try {
      const optionsAsString = readFileSync(pathForSecurityConfig(app), 'utf8')
      return JSON.parse(optionsAsString) as SecurityConfig
    } catch (e: unknown) {
      const error = e as Error
      console.error('Could not parse security config')
      console.error(error.message)
      return {} as SecurityConfig
    }
  }
}

export function pathForSecurityConfig(app: WithConfig): string {
  return path.join(app.config.configPath, 'security.json')
}

export function saveSecurityConfig(
  app: WithSecurityStrategy & WithConfig,
  data: SecurityConfig,
  callback?: ICallback<void>
): void {
  if (app.securityStrategy.configFromArguments) {
    app.securityStrategy.securityConfig = data
    if (callback) {
      callback(undefined)
    }
  } else {
    const configPath = pathForSecurityConfig(app)
    writeFile(configPath, JSON.stringify(data, null, 2), (err) => {
      if (!err) {
        chmodSync(configPath, '600')
      }
      if (callback) {
        callback(err ?? undefined)
      }
    })
  }
}

interface CertificateOptions {
  key: Buffer | string
  cert: Buffer | string
  ca?: string[]
}

export function getCertificateOptions(
  app: WithConfig,
  cb: ICallback<CertificateOptions>
): void {
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
    let ca: string[] | undefined
    if (existsSync(chainFile)) {
      debug('Found ssl-chain.pem')
      ca = getCAChainArray(chainFile)
      debug(JSON.stringify(ca, null, 2))
    }
    debug(`Using certificate ssl-key.pem and ssl-cert.pem in ${certLocation}`)
    cb(undefined, {
      key: readFileSync(keyFile),
      cert: readFileSync(certFile),
      ca
    })
  } else {
    createCertificateOptions(app, certFile, keyFile, cb)
  }
}

function hasStrictPermissions(stat: Stats): boolean {
  if (process.platform === 'win32') {
    return true
  } else {
    return /^-r[-w][-x]------$/.test(new Mode(stat).toString())
  }
}

export function getCAChainArray(filename: string): string[] {
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
  cb: ICallback<CertificateOptions>
): void {
  const location = app.config.configPath ? app.config.configPath : './settings'
  debug(`Creating certificate files in ${location}`)
  generate(
    [{ name: 'commonName', value: 'localhost' }],
    { days: 3650 },
    function (err, pems) {
      if (err) {
        cb(err)
        return
      }
      writeFileSync(keyFile, pems.private)
      chmodSync(keyFile, '600')
      writeFileSync(certFile, pems.cert)
      chmodSync(certFile, '600')
      cb(undefined, {
        key: pems.private,
        cert: pems.cert
      })
    }
  )
}

export function requestAccess(
  app: WithSecurityStrategy & WithConfig,
  request: { accessRequest?: unknown; requestId?: string },
  ip: string | null | undefined,
  updateCb?: (reply: Reply) => void
): Promise<Reply> {
  const config = getSecurityConfig(app)
  return app.securityStrategy.requestAccess(config, request, ip, updateCb)
}

export type SecurityConfigSaver = (
  app: WithSecurityStrategy & WithConfig,
  securityConfig: SecurityConfig,
  cb: ICallback<void>
) => void

export type SecurityConfigGetter = (
  app: WithConfig & WithSecurityStrategy
) => SecurityConfig

/**
 * When Express trust proxy is enabled:
 * - req.ip will reflect the client IP and we don't want rateLimit to
 *   validate the presence of x-forwarded-for.
 * - trustProxy: false prevents ERR_ERL_PERMISSIVE_TRUST_PROXY warnings
 */
export function getRateLimitValidationOptions(
  app: WithConfig
): { xForwardedForHeader: boolean; trustProxy: boolean } | undefined {
  return app.config?.settings?.trustProxy &&
    app.config.settings.trustProxy !== 'false'
    ? { xForwardedForHeader: false, trustProxy: false }
    : undefined
}
