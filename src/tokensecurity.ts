/*
 * Copyright 2017 Scott Bender <scott@scottbender.net>
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

import { createDebug } from './debug'
import { createHash, randomBytes } from 'crypto'
import jwt, { SignOptions, VerifyErrors } from 'jsonwebtoken'
import _ from 'lodash'
import bcrypt from 'bcryptjs'
import { getSourceId } from '@signalk/signalk-schema'
import {
  InvalidTokenError,
  getRateLimitValidationOptions,
  SecurityStrategy,
  SecurityConfig,
  SkPrincipal,
  Delta,
  SignalKRequest,
  WsAuthRequest,
  LoginResponse,
  LoginStatusResponse,
  UserData,
  NewUserData,
  UserDataUpdate,
  Device,
  DeviceDataUpdate,
  RequestStatusData,
  User,
  saveSecurityConfig
} from './security'
import {
  createRequest,
  updateRequest,
  findRequest,
  filterRequests,
  Reply,
  ClientRequest,
  Request as RequestRecord
} from './requestResponse'
import ms from 'ms'
import rateLimit from 'express-rate-limit'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import { Request, Response, NextFunction, Application } from 'express'
import { Server } from 'http'

// OIDC imports
import {
  parseOIDCConfig,
  registerOIDCRoutes,
  registerOIDCAdminRoutes,
  OIDCConfig,
  OIDCCryptoService,
  ExternalUserService,
  ExternalUser,
  ProviderUserLookup,
  PartialOIDCConfig
} from './oidc'

import { SERVERROUTESPREFIX } from './constants'
import { ICallback } from './types'

const debug = createDebug('signalk-server:tokensecurity')

const CONFIG_PLUGINID = 'sk-simple-token-security-config'
const passwordSaltRounds = 10
const permissionDeniedMessage =
  "You do not have permission to view this resource, <a href='/admin/#/login'>Please Login</a>"

const skPrefix = '/signalk/v1'
const skAuthPrefix = `${skPrefix}/auth`

// cookie to hold login info for webapps to use
const BROWSER_LOGININFO_COOKIE_NAME = 'skLoginInfo'

const LOGIN_FAILED_MESSAGE = 'Invalid username/password'

// Dummy hash for timing attack prevention - pre-generated bcrypt hash
const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012'

// =============================================================================
// Internal Types
// =============================================================================

/** Application interface for tokensecurity */
interface TokenSecurityApp extends Application {
  server: Server
  selfContext: string
  selfId: string
  config: {
    configPath: string
    settings: {
      ssl?: boolean
      trustProxy?: string | boolean | number
    }
  }
  intervals: NodeJS.Timeout[]
  securityStrategy: SecurityStrategy
  handleMessage: (pluginId: string, delta: unknown) => void
  // Override emit to allow void return (EventEmitter compatibility)
  emit(event: string, data: unknown): boolean
}

/** JWT payload structure */
interface JWTPayload {
  id?: string
  device?: string
  exp?: number
  dummy?: string
}

/** Cookie options for session management */
interface CookieOptions {
  sameSite: 'strict' | 'lax' | 'none'
  secure: boolean
  httpOnly?: boolean
  maxAge?: number
}

/** Session cookie set options */
interface SessionCookieSetOptions {
  rememberMe?: boolean
}

/** Internal options state - standalone interface instead of extending Partial<SecurityConfig> */
interface SecurityOptions {
  allow_readonly: boolean
  expiration: string
  secretKey: string
  users: User[]
  devices: Device[]
  immutableConfig: boolean
  acls?: SecurityConfig['acls']
  allowDeviceAccessRequests: boolean
  allowNewUserRegistration: boolean
  oidc?: PartialOIDCConfig
}

/** Extended request record with access request fields */
interface AccessRequestRecord extends RequestRecord {
  accessIdentifier?: string
  accessDescription?: string
  accessPassword?: string
  requestedPermissions?: boolean
  permissions?: string
  token?: string
}

// =============================================================================
// Module Export
// =============================================================================

function tokenSecurity(
  app: TokenSecurityApp,
  config: Partial<SecurityConfig>
): SecurityStrategy {
  const strategy = {} as SecurityStrategy

  const { expiration = 'NEVER' } = config

  let {
    users = [],
    immutableConfig = false,
    allowDeviceAccessRequests = true,
    allowNewUserRegistration = true
  } = config

  const {
    allow_readonly = true,
    secretKey = process.env.SECRETKEY || randomBytes(256).toString('hex'),
    devices = [],
    acls = []
  } = config

  /**
   * Derive a domain-specific secret from the master key.
   * Used to provide isolated secrets for different subsystems
   * without exposing the JWT signing key.
   */
  function deriveSecret(domain: string): string {
    return createHash('sha256').update(secretKey).update(domain).digest('hex')
  }

  /**
   * Crypto service for OIDC state encryption.
   * Provides derived secret - tokensecurity knows nothing about OIDC internals.
   */
  const oidcCryptoService: OIDCCryptoService = {
    getStateEncryptionSecret: () => deriveSecret('signalk-oidc')
  }

  /**
   * User service for external authentication providers (OIDC, etc.).
   * Abstracts user storage so auth providers don't need to know about
   * the underlying storage mechanism (currently array, could be SQLite etc).
   */
  const externalUserService: ExternalUserService = {
    async findUserByProvider(
      lookup: ProviderUserLookup
    ): Promise<ExternalUser | null> {
      // Currently only OIDC is supported
      if (lookup.provider === 'oidc') {
        const { sub, issuer } = lookup.criteria
        const user = options.users.find(
          (u) => u.oidc?.sub === sub && u.oidc?.issuer === issuer
        )
        if (user) {
          return {
            username: user.username,
            type: user.type,
            providerData: user.oidc as unknown as Record<string, unknown>
          }
        }
      }
      return null
    },

    async findUserByUsername(username: string): Promise<ExternalUser | null> {
      const user = options.users.find((u) => u.username === username)
      if (user) {
        return {
          username: user.username,
          type: user.type,
          providerData: user.oidc as unknown as Record<string, unknown>
        }
      }
      return null
    },

    async createUser(externalUser: ExternalUser): Promise<void> {
      // Convert ExternalUser to internal User format
      const newUser: User = {
        username: externalUser.username,
        type: externalUser.type
      }

      // Store full providerData in oidc field
      if (externalUser.providerData) {
        newUser.oidc = externalUser.providerData as unknown as User['oidc']
      }

      options.users.push(newUser)

      // Save configuration
      return new Promise((resolve, reject) => {
        saveSecurityConfig(
          app as unknown as Parameters<typeof saveSecurityConfig>[0],
          options as SecurityConfig,
          (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          }
        )
      })
    },

    async updateUser(
      username: string,
      updates: { type?: string; providerData?: Record<string, unknown> }
    ): Promise<void> {
      const user = options.users.find((u) => u.username === username)
      if (!user) {
        throw new Error(`User not found: ${username}`)
      }

      if (updates.type) {
        user.type = updates.type
      }

      if (updates.providerData) {
        user.oidc = updates.providerData as unknown as User['oidc']
      }

      // Save configuration
      return new Promise((resolve, reject) => {
        saveSecurityConfig(
          app as unknown as Parameters<typeof saveSecurityConfig>[0],
          options as SecurityConfig,
          (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          }
        )
      })
    }
  }

  if (process.env.ADMINUSER) {
    const adminUserParts = process.env.ADMINUSER.split(':')
    if (adminUserParts.length !== 2) {
      console.error(
        'ADMINUSER env parameters must be in username:password format'
      )
      process.exit(-1)
    }
    users = [
      {
        username: adminUserParts[0],
        type: 'admin',
        password: bcrypt.hashSync(
          adminUserParts[1],
          bcrypt.genSaltSync(passwordSaltRounds)
        )
      }
    ]
    immutableConfig = true
  }

  if (process.env.ALLOW_DEVICE_ACCESS_REQUESTS) {
    allowDeviceAccessRequests =
      process.env.ALLOW_DEVICE_ACCESS_REQUESTS === 'true'
  }

  if (process.env.ALLOW_NEW_USER_REGISTRATION) {
    allowNewUserRegistration =
      process.env.ALLOW_NEW_USER_REGISTRATION === 'true'
  }

  let options: SecurityOptions = {
    allow_readonly,
    expiration,
    secretKey,
    users,
    devices,
    immutableConfig,
    acls,
    allowDeviceAccessRequests,
    allowNewUserRegistration,
    oidc: config.oidc // Include OIDC config from security.json
  }

  // so that enableSecurity gets the defaults to save
  _.merge(config, options)

  function getConfiguration(): SecurityConfig {
    return options as SecurityConfig
  }
  strategy.getConfiguration = getConfiguration

  // Parse and cache OIDC configuration
  let cachedOIDCConfig: OIDCConfig | null = null
  function getOIDCConfig(): OIDCConfig {
    if (!cachedOIDCConfig) {
      cachedOIDCConfig = parseOIDCConfig(options as SecurityConfig)
    }
    return cachedOIDCConfig
  }

  // Update OIDC configuration in memory and clear cache
  function updateOIDCConfig(newOidcConfig: PartialOIDCConfig): void {
    options.oidc = newOidcConfig
    cachedOIDCConfig = null // Clear cache so it gets re-parsed
  }
  strategy.updateOIDCConfig = updateOIDCConfig

  /**
   * Get base cookie options with proper security settings
   */
  function getSessionCookieOptions(
    req: Request,
    rememberMe = false
  ): CookieOptions {
    const configuration = getConfiguration()
    const cookieOptions: CookieOptions = {
      sameSite: 'strict',
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
    }
    if (rememberMe) {
      const expirationStr =
        configuration.expiration === 'NEVER'
          ? '10y'
          : configuration.expiration || '1h'
      cookieOptions.maxAge = ms(expirationStr as ms.StringValue)
    }
    return cookieOptions
  }

  /**
   * Set session cookies for authenticated user
   */
  function setSessionCookie(
    res: Response,
    req: Request,
    token: string,
    username: string,
    cookieSetOptions: SessionCookieSetOptions = {}
  ): void {
    const cookieOptions = getSessionCookieOptions(
      req,
      cookieSetOptions.rememberMe
    )
    // Auth cookie must be httpOnly for security
    const authCookieOptions = { ...cookieOptions, httpOnly: true }
    res.cookie('JAUTHENTICATION', token, authCookieOptions)
    // Login info cookie must NOT be httpOnly so JS can access it
    res.cookie(
      BROWSER_LOGININFO_COOKIE_NAME,
      JSON.stringify({ status: 'loggedIn', user: username }),
      cookieOptions
    )
  }

  /**
   * Clear session cookies
   */
  function clearSessionCookie(res: Response): void {
    res.clearCookie('JAUTHENTICATION')
    res.clearCookie(BROWSER_LOGININFO_COOKIE_NAME)
  }

  /**
   * Generate a JWT for a user
   */
  function generateJWT(userId: string, tokenExpiration?: string): string {
    const configuration = getConfiguration()
    const theExpiration = tokenExpiration || configuration.expiration || '1h'
    const payload: JWTPayload = { id: userId }
    const jwtOptions: SignOptions = {}
    if (theExpiration !== 'NEVER') {
      jwtOptions.expiresIn = theExpiration as ms.StringValue
    }
    return jwt.sign(payload, configuration.secretKey, jwtOptions)
  }

  function getIsEnabled(): boolean {
    // var options = getOptions();
    // return typeof options.enabled !== 'undefined' && options.enabled;
    return true
  }

  function assertConfigImmutability(): void {
    if (options.immutableConfig) {
      throw new Error('Configuration is immutable')
    }
  }

  function handlePermissionDenied(req: Request, res: Response): void {
    res.status(401)
    if (req.accepts('application/json') && !req.accepts('text/html')) {
      res.set('Content-Type', 'application/json')
      res.json({ error: 'Permission Denied' })
    } else {
      res.type('text/plain').send(permissionDeniedMessage)
    }
  }

  function hasAdminAccess(req: Request): boolean {
    const skReq = req as SignalKRequest
    return (
      skReq.skIsAuthenticated === true &&
      skReq.skPrincipal !== undefined &&
      skReq.skPrincipal.permissions === 'admin'
    )
  }

  function writeAuthenticationMiddleware(): (
    req: Request,
    res: Response,
    next: NextFunction
  ) => void {
    return function (req: Request, res: Response, next: NextFunction): void {
      const skReq = req as SignalKRequest
      if (!getIsEnabled()) {
        next()
        return
      }

      debug('skIsAuthenticated: ' + skReq.skIsAuthenticated)
      if (skReq.skIsAuthenticated) {
        if (
          skReq.skPrincipal?.permissions === 'admin' ||
          skReq.skPrincipal?.permissions === 'readwrite'
        ) {
          next()
          return
        }
      }
      handlePermissionDenied(req, res)
    }
  }

  function adminAuthenticationMiddleware(
    redirect: boolean
  ): (req: Request, res: Response, next: NextFunction) => void {
    return function (req: Request, res: Response, next: NextFunction): void {
      const skReq = req as SignalKRequest
      if (!getIsEnabled()) {
        next()
        return
      }

      if (hasAdminAccess(req)) {
        next()
        return
      }

      if (skReq.skIsAuthenticated && skReq.skPrincipal) {
        if (skReq.skPrincipal.identifier === 'AUTO' && redirect) {
          res.redirect('/@signalk/server-admin-ui/#/login')
        } else {
          handlePermissionDenied(req, res)
        }
      } else if (redirect) {
        res.redirect('/@signalk/server-admin-ui/#/login')
      } else {
        handlePermissionDenied(req, res)
      }
    }
  }

  function setupApp(): void {
    const rawHttpRateLimits = process.env.HTTP_RATE_LIMITS
    const parsedParts =
      typeof rawHttpRateLimits === 'string'
        ? rawHttpRateLimits
            .split(/[\s,]+/)
            .map((p) => p.trim())
            .filter(Boolean)
        : []

    let loginWindowMs = 10 * 60 * 1000
    let loginMax = 100
    for (const part of parsedParts) {
      const eqIndex = part.indexOf('=')
      if (eqIndex === -1) {
        continue
      }

      const key = part.slice(0, eqIndex).trim().toLowerCase()
      const value = part.slice(eqIndex + 1).trim()
      const parsed = Number.parseInt(value, 10)

      if ((key === 'windowms' || key === 'window') && Number.isFinite(parsed)) {
        loginWindowMs = parsed
      } else if (
        (key === 'login' || key === 'loginmax') &&
        Number.isFinite(parsed)
      ) {
        loginMax = parsed
      }
    }

    const loginLimiter = rateLimit({
      windowMs: loginWindowMs,
      max: loginMax,
      message: {
        message:
          'Too many login attempts from this IP, please try again after 10 minutes'
      },
      validate: getRateLimitValidationOptions(
        app as unknown as Parameters<typeof getRateLimitValidationOptions>[0]
      )
    })

    app.use(bodyParser.urlencoded({ extended: true }))

    app.use(cookieParser())

    function getSafeDestination(destination: unknown): string {
      if (typeof destination !== 'string') {
        return '/'
      }
      const dest = destination.trim()
      // Allow only relative redirects. Reject protocol-relative URLs (//evil.com).
      if (!dest.startsWith('/') || dest.startsWith('//')) {
        return '/'
      }
      return dest
    }

    app.post(
      ['/login', `${skAuthPrefix}/login`],
      loginLimiter,
      (req: Request, res: Response) => {
        const name = req.body.username as string
        const password = req.body.password as string
        const remember = req.body.rememberMe as boolean | undefined

        login(name, password)
          .then((reply) => {
            const requestType = req.get('Content-Type')

            if (reply.statusCode === 200) {
              setSessionCookie(res, req, reply.token!, reply.user!, {
                rememberMe: remember
              })

              if (requestType === 'application/json') {
                res.json({ token: reply.token })
              } else {
                res.redirect(getSafeDestination(req.body.destination))
              }
            } else {
              if (requestType === 'application/json') {
                res.status(reply.statusCode).send(reply)
              } else {
                res.status(reply.statusCode).send(reply.message)
              }
            }
          })
          .catch((err: Error) => {
            console.log(err)
            res.status(502).send('Login Failure')
          })
      }
    )

    app.use('/', http_authorize(false, true)) // semicolon required
    ;[
      '/apps',
      '/appstore',
      '/plugins',
      '/restart',
      '/runDiscovery',
      '/security',
      '/vessel',
      '/providers',
      '/settings',
      '/webapps',
      '/availablePaths',
      '/hasAnalyzer',
      '/skServer/inputTest'
    ].forEach((p) =>
      app.use(`${SERVERROUTESPREFIX}${p}`, http_authorize(false))
    )

    app.put(
      ['/logout', `${skAuthPrefix}/logout`],
      function (req: Request, res: Response) {
        void req
        clearSessionCookie(res)
        res.json('Logout OK')
      }
    )

    // Register OIDC authentication routes
    registerOIDCRoutes(app as Application, {
      getOIDCConfig,
      setSessionCookie,
      clearSessionCookie,
      generateJWT,
      cryptoService: oidcCryptoService,
      userService: externalUserService
    })

    // Register OIDC admin routes (GET/PUT /security/oidc, POST /security/oidc/test)
    registerOIDCAdminRoutes(app as Application, {
      allowConfigure: (req: Request) => strategy.allowConfigure(req),
      getSecurityConfig: () => options,
      saveSecurityConfig: (config, callback) =>
        saveSecurityConfig(
          app as unknown as Parameters<typeof saveSecurityConfig>[0],
          config as SecurityConfig,
          callback
        ),
      updateOIDCConfig
    })
    ;[
      '/restart',
      '/runDiscovery',
      '/plugins',
      '/appstore',
      '/security',
      '/settings',
      '/backup',
      '/restore',
      '/providers',
      '/vessel',
      '/serialports'
    ].forEach((p) =>
      app.use(`${SERVERROUTESPREFIX}${p}`, adminAuthenticationMiddleware(false))
    )

    app.use('/plugins', adminAuthenticationMiddleware(false))

    // TODO remove after grace period
    app.use('/loginStatus', http_authorize(false, true))
    app.use(`${SERVERROUTESPREFIX}/loginStatus`, http_authorize(false, true))

    const no_redir = http_authorize(false)
    app.use(
      '/signalk/v1/api/*',
      function (req: Request, res: Response, next: NextFunction) {
        no_redir(req, res, next)
      }
    )
    app.put('/signalk/v1/*', writeAuthenticationMiddleware())
  }

  function login(name: string, password: string): Promise<LoginResponse> {
    return new Promise((resolve, reject) => {
      debug('handing login for user: ' + name)

      // Validate input to prevent crashes on malformed requests
      if (typeof name !== 'string' || typeof password !== 'string') {
        // Still run bcrypt to prevent timing attacks on input validation
        bcrypt.compare('dummy', DUMMY_HASH, () => {
          resolve({ statusCode: 401, message: LOGIN_FAILED_MESSAGE })
        })
        return
      }

      const configuration = getConfiguration()
      const user = configuration.users.find((aUser) => aUser.username === name)

      // Always run bcrypt.compare to prevent timing attacks that reveal
      // whether a username exists. Use a dummy hash if user not found.
      const hashToCompare = user && user.password ? user.password : DUMMY_HASH

      bcrypt.compare(
        password,
        hashToCompare,
        (err: Error | null, matches: boolean) => {
          if (err) {
            reject(err)
          } else if (matches === true && user && user.password) {
            // Only succeed if user exists AND password matched real hash
            const payload: JWTPayload = { id: user.username }
            const theExpiration = configuration.expiration || '1h'
            const jwtOptions: SignOptions = {}
            if (theExpiration !== 'NEVER') {
              jwtOptions.expiresIn = theExpiration as ms.StringValue
            }
            debug(`jwt expiration:${JSON.stringify(jwtOptions)}`)
            try {
              const token = jwt.sign(
                payload,
                configuration.secretKey,
                jwtOptions
              )
              resolve({ statusCode: 200, token, user: user.username })
            } catch (signErr) {
              const signError = signErr as Error
              resolve({
                statusCode: 500,
                message: 'Unable to sign token: ' + signError.message
              })
            }
          } else {
            debug('password did not match')
            resolve({ statusCode: 401, message: LOGIN_FAILED_MESSAGE })
          }
        }
      )
    })
  }

  strategy.validateConfiguration = (newConfiguration: SecurityConfig): void => {
    const configuration = getConfiguration()
    const theExpiration = newConfiguration.expiration || '1h'
    if (theExpiration !== 'NEVER') {
      jwt.sign({ dummy: 'payload' }, configuration.secretKey, {
        expiresIn: theExpiration as ms.StringValue
      })
    }
  }

  strategy.getAuthRequiredString = (): 'never' | 'forwrite' | 'always' => {
    return strategy.allowReadOnly() ? 'forwrite' : 'always'
  }

  strategy.supportsLogin = (): boolean => true
  strategy.login = login

  strategy.addAdminMiddleware = function (aPath: string): void {
    app.use(aPath, http_authorize(false))
    app.use(aPath, adminAuthenticationMiddleware(false))
  }

  strategy.addAdminWriteMiddleware = function (aPath: string): void {
    app.use(aPath, http_authorize(false))
    app.put(aPath, adminAuthenticationMiddleware(false))
    app.post(aPath, adminAuthenticationMiddleware(false))
  }

  strategy.addWriteMiddleware = function (aPath: string): void {
    app.use(aPath, http_authorize(false))
    app.put(aPath, writeAuthenticationMiddleware())
    app.post(aPath, writeAuthenticationMiddleware())
  }

  strategy.generateToken = function (
    req: Request,
    res: Response,
    next: NextFunction,
    id: string,
    theExpiration: string
  ): void {
    void req
    void next
    const configuration = getConfiguration()
    const payload: JWTPayload = { id: id }
    const token = jwt.sign(payload, configuration.secretKey, {
      expiresIn: theExpiration as ms.StringValue
    })
    res.type('text/plain').send(token)
  }

  strategy.allowReadOnly = function (): boolean {
    const configuration = getConfiguration()
    return configuration.allow_readonly
  }

  strategy.allowRestart = function (req: Request): boolean {
    return hasAdminAccess(req)
  }

  strategy.allowConfigure = function (req: Request): boolean {
    return hasAdminAccess(req)
  }

  strategy.getLoginStatus = function (req: Request): LoginStatusResponse {
    const skReq = req as SignalKRequest
    const configuration = getConfiguration()
    const result: LoginStatusResponse = {
      status: skReq.skIsAuthenticated ? 'loggedIn' : 'notLoggedIn',
      readOnlyAccess: configuration.allow_readonly,
      authenticationRequired: true,
      allowNewUserRegistration: configuration.allowNewUserRegistration,
      allowDeviceAccessRequests: configuration.allowDeviceAccessRequests
    }
    if (skReq.skIsAuthenticated) {
      result.userLevel = skReq.skPrincipal?.permissions
      result.username = skReq.skPrincipal?.identifier
    }
    if (configuration.users.length === 0) {
      result.noUsers = true
    }
    // Add OIDC status
    const oidcConfig = getOIDCConfig()
    if (oidcConfig.enabled) {
      result.oidcEnabled = true
      result.oidcAutoLogin = oidcConfig.autoLogin || false
      result.oidcLoginUrl = '/signalk/v1/auth/oidc/login'
      if (oidcConfig.providerName) {
        result.oidcProviderName = oidcConfig.providerName
      }
    }
    return result
  }

  strategy.getConfig = (
    aConfig: SecurityConfig
  ): Omit<SecurityConfig, 'secretKey' | 'users'> => {
    const configCopy = { ...aConfig } as Partial<SecurityConfig>
    delete configCopy.users
    delete configCopy.secretKey
    return configCopy as Omit<SecurityConfig, 'secretKey' | 'users'>
  }

  strategy.setConfig = (
    aConfig: SecurityConfig,
    newConfig: SecurityConfig
  ): SecurityConfig => {
    assertConfigImmutability()
    newConfig.users = aConfig.users
    newConfig.devices = aConfig.devices
    newConfig.secretKey = aConfig.secretKey
    options = newConfig as SecurityOptions
    return newConfig
  }

  strategy.getUsers = (aConfig: SecurityConfig): UserData[] => {
    if (aConfig && aConfig.users) {
      return aConfig.users.map((user) => {
        const userData: UserData = {
          userId: user.username,
          type: user.type,
          isOIDC: !!user.oidc
        }
        // Include OIDC metadata for OIDC users
        if (user.oidc) {
          userData.oidc = {
            issuer: user.oidc.issuer,
            email: user.oidc.email,
            name: user.oidc.name
          }
        }
        return userData
      })
    } else {
      return []
    }
  }

  function addUser(
    theConfig: SecurityConfig,
    user: NewUserData,
    callback: ICallback<SecurityConfig>
  ): void {
    assertConfigImmutability()
    const newUser: User = {
      username: user.userId,
      type: user.type
    }

    function finish(finishedUser: User, err: Error | undefined): void {
      if (!theConfig.users) {
        theConfig.users = []
      }
      theConfig.users.push(finishedUser)
      options = theConfig as SecurityOptions
      callback(err, theConfig)
    }

    if (user.password) {
      bcrypt.hash(
        user.password,
        passwordSaltRounds,
        (err: Error | null, hash: string) => {
          if (err) {
            callback(err)
          } else {
            newUser.password = hash
            finish(newUser, undefined)
          }
        }
      )
    } else {
      finish(newUser, undefined)
    }
  }

  strategy.updateUser = (
    theConfig: SecurityConfig,
    username: string,
    updates: UserDataUpdate,
    callback: ICallback<SecurityConfig>
  ): void => {
    assertConfigImmutability()
    const user = theConfig.users.find((aUser) => aUser.username === username)

    if (!user) {
      callback(new Error('user not found'))
      return
    }

    if (updates.type) {
      user.type = updates.type
    }

    if (updates.password) {
      bcrypt.hash(
        updates.password,
        passwordSaltRounds,
        (err: Error | null, hash: string) => {
          if (err) {
            callback(err)
          } else {
            user.password = hash
            callback(err, theConfig)
          }
        }
      )
    } else {
      callback(null, theConfig)
    }
    options = theConfig as SecurityOptions
  }

  strategy.addUser = addUser

  strategy.setPassword = (
    theConfig: SecurityConfig,
    username: string,
    password: string,
    callback: ICallback<SecurityConfig>
  ): void => {
    assertConfigImmutability()
    bcrypt.hash(
      password,
      passwordSaltRounds,
      (err: Error | null, hash: string) => {
        if (err) {
          callback(err)
        } else {
          const user = theConfig.users.find((u) => u.username === username)
          if (user) {
            user.password = hash
          }
          options = theConfig as SecurityOptions
          callback(err, theConfig)
        }
      }
    )
  }

  strategy.deleteUser = (
    theConfig: SecurityConfig,
    username: string,
    callback: ICallback<SecurityConfig>
  ): void => {
    assertConfigImmutability()
    for (let i = theConfig.users.length - 1; i >= 0; i--) {
      if (theConfig.users[i].username === username) {
        theConfig.users.splice(i, 1)
        break
      }
    }
    options = theConfig as SecurityOptions
    callback(null, theConfig)
  }

  strategy.getDevices = (theConfig: SecurityConfig): Device[] => {
    if (theConfig && theConfig.devices) {
      return theConfig.devices
    } else {
      return []
    }
  }

  strategy.deleteDevice = (
    theConfig: SecurityConfig,
    clientId: string,
    callback: ICallback<SecurityConfig>
  ): void => {
    assertConfigImmutability()
    for (let i = theConfig.devices.length - 1; i >= 0; i--) {
      if (theConfig.devices[i].clientId === clientId) {
        theConfig.devices.splice(i, 1)
        break
      }
    }
    options = theConfig as SecurityOptions
    callback(null, theConfig)
  }

  strategy.updateDevice = (
    theConfig: SecurityConfig,
    clientId: string,
    updates: DeviceDataUpdate,
    callback: ICallback<SecurityConfig>
  ): void => {
    assertConfigImmutability()
    const device = theConfig.devices.find((d) => d.clientId === clientId)

    if (!device) {
      callback(new Error('device not found'))
      return
    }

    if (updates.permissions) {
      device.permissions = updates.permissions
    }

    if (updates.description) {
      device.description = updates.description
    }

    callback(null, theConfig)
    options = theConfig as SecurityOptions
  }

  strategy.shouldAllowWrite = function (
    req: SignalKRequest,
    delta: Delta
  ): boolean {
    if (
      req.skPrincipal &&
      (req.skPrincipal.permissions === 'admin' ||
        req.skPrincipal.permissions === 'readwrite')
    ) {
      const context =
        delta.context === app.selfContext ? 'vessels.self' : delta.context

      const notAllowed = delta.updates?.find((update) => {
        let source = update.$source
        if (!source) {
          source = getSourceId(update.source)
        }
        return (
          (update.values &&
            update.values.find((valuePath) => {
              return (
                strategy.checkACL(
                  req.skPrincipal!.identifier,
                  context!,
                  valuePath.path,
                  source ?? null,
                  'write'
                ) === false
              )
            })) ||
          (update.meta &&
            update.meta.find((valuePath) => {
              return (
                strategy.checkACL(
                  req.skPrincipal!.identifier,
                  context!,
                  valuePath.path,
                  source ?? null,
                  'write'
                ) === false
              )
            }))
        )
      })

      // true if we did not find anything disallowing the write
      return notAllowed === undefined
    }
    return false
  }

  strategy.shouldAllowPut = function (
    req: Request,
    _context: string,
    source: string | null,
    thePath: string
  ): boolean {
    const skReq = req as SignalKRequest
    if (
      skReq.skPrincipal &&
      (skReq.skPrincipal.permissions === 'admin' ||
        skReq.skPrincipal.permissions === 'readwrite')
    ) {
      const context = _context === app.selfContext ? 'vessels.self' : _context

      return strategy.checkACL(
        skReq.skPrincipal.identifier,
        context,
        thePath,
        source,
        'put'
      )
    }
    return false
  }

  strategy.anyACLs = (): boolean => {
    const configuration = getConfiguration()
    return !!(configuration.acls && configuration.acls.length)
  }

  strategy.filterReadDelta = (
    principal: SkPrincipal | undefined,
    delta: Delta
  ): Delta | null => {
    const configuration = getConfiguration()
    if (
      delta.updates &&
      configuration.acls &&
      configuration.acls.length &&
      principal
    ) {
      const filtered = { ...delta }
      const context =
        delta.context === app.selfContext ? 'vessels.self' : delta.context

      filtered.updates = delta.updates
        .map((update) => {
          const res = (update.values || update.meta || [])
            .map((valuePath) => {
              return strategy.checkACL(
                principal.identifier,
                context!,
                valuePath.path,
                update.source as string | null,
                'read'
              )
                ? valuePath
                : null
            })
            .filter((vp): vp is NonNullable<typeof vp> => vp !== null)
          if (update.values) {
            update.values = res
            return update.values.length > 0 ? update : null
          } else {
            update.meta = res
            return (update.meta?.length ?? 0) > 0 ? update : null
          }
        })
        .filter(
          (update): update is NonNullable<typeof update> => update !== null
        )
      return filtered.updates.length > 0 ? filtered : null
    } else if (!principal) {
      return null
    } else {
      return delta
    }
  }

  strategy.verifyWS = function (spark: WsAuthRequest): void {
    if (!spark.lastTokenVerify) {
      spark.lastTokenVerify = Date.now()
      return
    }

    if (!getIsEnabled()) {
      return
    }

    const now = Date.now()
    if (now - spark.lastTokenVerify > 60 * 1000) {
      debug('verify token')
      spark.lastTokenVerify = now
      strategy.authorizeWS(spark)
    }
  }

  function getAuthorizationFromHeaders(
    req: WsAuthRequest | Request
  ): string | undefined {
    if (req.headers) {
      let header = req.headers.authorization as string | undefined
      if (!header) {
        header = req.headers['x-authorization'] as string | undefined
      }
      if (header && header.startsWith('Bearer ')) {
        return header.substring('Bearer '.length)
      }
      if (header && header.startsWith('JWT ')) {
        return header.substring('JWT '.length)
      }
    }
    return undefined
  }

  strategy.authorizeWS = function (req: WsAuthRequest): void {
    let token = req.token
    let error: InvalidTokenError | Error | undefined
    let payload: JWTPayload | undefined

    if (!getIsEnabled()) {
      return
    }

    const configuration = getConfiguration()

    if (!token) {
      if (req.query && req.query.token) {
        token = req.query.token
      } else {
        token = getAuthorizationFromHeaders(req)
      }
    }

    if (!token) {
      token = req.cookies?.JAUTHENTICATION
    }

    //
    // `jwt-simple` throws errors if something goes wrong when decoding the JWT.
    //
    if (token) {
      payload = jwt.verify(token, configuration.secretKey) as JWTPayload

      if (!payload) {
        error = new InvalidTokenError('Invalid access token')
      } else if (payload.exp && Date.now() / 1000 > payload.exp) {
        //
        // At this point we have decoded and verified the token. Check if it is
        // expired.
        //

        error = new InvalidTokenError('Expired access token')
      }
    }

    if (!token || error) {
      if (configuration.allow_readonly) {
        req.skPrincipal = { identifier: 'AUTO', permissions: 'readonly' }
        return
      } else {
        if (!error) {
          error = new Error('Missing access token')
        }
        debug(error.message)
        throw error
      }
    }

    //
    // Check if the user/device is still present and allowed in our db. You could tweak
    // this to invalidate a token.
    //

    const principal = getPrincipal(payload!)
    if (!principal) {
      error = new InvalidTokenError(
        `Invalid identity ${JSON.stringify(payload)}`
      )
      debug(error.message)
      throw error
    }

    req.skPrincipal = principal
    req.skIsAuthenticated = true
  }

  strategy.checkACL = (
    id: string,
    context: string,
    thePath: string,
    source: string | null,
    operation: 'read' | 'write' | 'put'
  ): boolean => {
    const configuration = getConfiguration()

    if (!configuration.acls || configuration.acls.length === 0) {
      // no acls, so allow anything
      return true
    }

    const acl = configuration.acls.find((theAcl) => {
      const pattern = theAcl.context.replace(/\./g, '\\.').replace(/\*/g, '.*')
      const matcher = new RegExp('^' + pattern + '$')
      return matcher.test(context)
    })

    if (acl) {
      const pathPerms = acl.resources.find((p) => {
        let perms: string | undefined

        if (p.paths) {
          perms = p.paths.find((aPath) => {
            const pattern = aPath.replace(/\./g, '\\.').replace(/\*/g, '.*')
            const matcher = new RegExp('^' + pattern + '$')
            return matcher.test(thePath)
          })
        } else if (p.sources) {
          perms = p.sources.find((s) => {
            const pattern = s.replace(/\./g, '\\.').replace(/\*/g, '.*')
            const matcher = new RegExp('^' + pattern + '$')
            return source !== null && matcher.test(source)
          })
        }

        return perms
      })

      if (pathPerms) {
        let perms = pathPerms.permissions.filter((p) => p.subject === id)
        perms = perms.concat(
          pathPerms.permissions.filter((p) => p.subject === 'any')
        )
        if (perms.length === 0) {
          return false
        }

        return (
          perms.find((perm) => {
            if (
              operation === 'read' &&
              (perm.permission === 'write' || perm.permission === 'read')
            ) {
              return true
            } else if (operation === 'write' && perm.permission === 'write') {
              return true
            } else if (operation === 'put' && perm.permission === 'put') {
              return true
            } else {
              return false
            }
          }) !== undefined
        )
      }
    }
    return false
  }

  strategy.isDummy = (): boolean => {
    return false
  }

  strategy.canAuthorizeWS = (): boolean => {
    return true
  }

  strategy.shouldFilterDeltas = (): boolean => {
    const configuration = getConfiguration()
    return !!(configuration.acls && configuration.acls.length > 0)
  }

  function getPrincipal(payload: JWTPayload): SkPrincipal | undefined {
    let principal: SkPrincipal | undefined
    if (payload.id) {
      const user = options.users.find(
        (theUser) => theUser.username === payload.id
      )
      if (user) {
        principal = {
          identifier: user.username,
          permissions: user.type as SkPrincipal['permissions']
        }
      }
    } else if (payload.device && options.devices) {
      const device = options.devices.find(
        (aDevice) => aDevice.clientId === payload.device
      )
      if (device) {
        principal = {
          identifier: device.clientId,
          permissions: device.permissions as SkPrincipal['permissions']
        }
      }
    }
    return principal
  }

  function http_authorize(
    redirect: boolean,
    forLoginStatus?: boolean
  ): (req: Request, res: Response, next: NextFunction) => void {
    // debug('http_authorize: ' + redirect)
    return function (req: Request, res: Response, next: NextFunction): void {
      const skReq = req as SignalKRequest
      let token: string | undefined = (req.cookies as Record<string, string>)
        ?.JAUTHENTICATION

      debug(`http_authorize: ${req.path} (forLogin: ${forLoginStatus})`)

      if (!getIsEnabled()) {
        next()
        return
      }

      const configuration = getConfiguration()

      if (!token) {
        token = getAuthorizationFromHeaders(req)
      }

      if (token) {
        jwt.verify(
          token,
          configuration.secretKey,
          function (err: VerifyErrors | null, decoded: unknown) {
            debug('verify')
            if (!err) {
              const principal = getPrincipal(decoded as JWTPayload)
              if (principal) {
                debug('authorized')
                skReq.skPrincipal = principal
                skReq.skIsAuthenticated = true
                skReq.userLoggedIn = true
                next()
                return
              } else {
                const decodedPayload = decoded as JWTPayload
                debug(
                  'unknown user: ' +
                    (decodedPayload.id || decodedPayload.device)
                )
              }
            } else {
              debug(`bad token: ${err.message} ${req.path}`)
              res.clearCookie('JAUTHENTICATION')
            }

            if (configuration.allow_readonly) {
              skReq.skIsAuthenticated = false
              next()
            } else {
              res.status(401).send('bad auth token')
            }
          }
        )
      } else {
        debug('no token')

        if (configuration.allow_readonly && !forLoginStatus) {
          skReq.skPrincipal = { identifier: 'AUTO', permissions: 'readonly' }
          skReq.skIsAuthenticated = true
          next()
          return
        } else {
          skReq.skIsAuthenticated = false

          if (forLoginStatus) {
            next()
          } else if (redirect) {
            debug('redirecting to login')
            res.redirect('/@signalk/server-admin-ui/#/login')
          } else {
            res.status(401).send('Unauthorized')
          }
        }
      }
    }
  }

  strategy.getAccessRequestsResponse = (): RequestRecord[] => {
    return filterRequests('accessRequest', 'PENDING')
  }

  function sendAccessRequestsUpdate(): void {
    app.emit('serverAdminEvent', {
      type: 'ACCESS_REQUEST',
      from: CONFIG_PLUGINID,
      data: strategy.getAccessRequestsResponse()
    })
  }

  strategy.setAccessRequestStatus = (
    theConfig: SecurityConfig,
    identifier: string,
    status: string,
    body: RequestStatusData,
    cb: ICallback<SecurityConfig>
  ): void => {
    const request = findRequest(
      (r) => r.state === 'PENDING' && r.accessIdentifier === identifier
    ) as AccessRequestRecord | undefined
    if (!request) {
      cb(new Error('not found'))
      return
    }

    const permissionPart = request.requestedPermissions
      ? request.permissions
      : 'any'

    app.handleMessage(CONFIG_PLUGINID, {
      context: 'vessels.' + app.selfId,
      updates: [
        {
          values: [
            {
              path: `notifications.security.accessRequest.${permissionPart}.${identifier}`,
              value: {
                state: 'normal',
                method: [],
                message: `The device "${request.accessDescription}" has been ${status}`,
                timestamp: new Date().toISOString()
              }
            }
          ]
        }
      ]
    })

    let approved: boolean
    if (status === 'approved') {
      const clientRequest = request.clientRequest as {
        accessRequest?: {
          clientId?: string
        }
        requestedPermissions?: boolean
      }
      if (clientRequest.accessRequest?.clientId) {
        const payload: JWTPayload = { device: identifier }
        const jwtOptions: SignOptions = {}

        const expiresIn = body.expiration || theConfig.expiration
        if (expiresIn !== 'NEVER') {
          jwtOptions.expiresIn = expiresIn as ms.StringValue
        }
        const token = jwt.sign(payload, theConfig.secretKey, jwtOptions)

        if (!theConfig.devices) {
          theConfig.devices = []
        }

        theConfig.devices = theConfig.devices.filter(
          (d) => d.clientId !== identifier
        )

        theConfig.devices.push({
          clientId: request.accessIdentifier!,
          permissions: !clientRequest.requestedPermissions
            ? body.permissions
            : request.permissions!,
          config: body.config,
          description: request.accessDescription,
          requestedPermissions: clientRequest.requestedPermissions
        })
        request.token = token
      } else {
        theConfig.users.push({
          username: identifier,
          password: request.accessPassword,
          type: body.permissions
        })
      }
      approved = true
    } else if (status === 'denied') {
      approved = false
    } else {
      cb(new Error('Unknown status value'), theConfig)
      return
    }

    options = theConfig as SecurityOptions

    updateRequest(request.requestId, 'COMPLETED', {
      statusCode: 200,
      data: {
        permission: approved ? 'APPROVED' : 'DENIED',
        token: request.token
      }
    })
      .then(() => {
        cb(null, theConfig)
        sendAccessRequestsUpdate()
      })
      .catch((err: Error) => {
        cb(err)
      })
  }

  function validateAccessRequest(request: {
    userId?: string
    password?: string
    clientId?: string
    description?: string
  }): boolean {
    if (request.userId) {
      return request.password !== undefined
    } else if (request.clientId) {
      return request.description !== undefined
    } else {
      return false
    }
  }

  strategy.requestAccess = (
    theConfig: SecurityConfig,
    clientRequest: ClientRequest,
    sourceIp: string | null | undefined,
    updateCb?: (reply: Reply) => void
  ): Promise<Reply> => {
    return new Promise((resolve, reject) => {
      if (filterRequests('accessRequest', 'PENDING').length >= 100) {
        const err = new Error('Too many pending access requests') as Error & {
          statusCode?: number
        }
        err.statusCode = 503
        reject(err)
        return
      }
      createRequest(
        app as unknown as { intervals: NodeJS.Timeout[] },
        'accessRequest',
        clientRequest,
        undefined,
        sourceIp ?? undefined,
        updateCb
      )
        .then((request) => {
          const accessRequest = (
            clientRequest as {
              accessRequest?: {
                clientId?: string
                description?: string
                userId?: string
                password?: string
                permissions?: string
              }
            }
          ).accessRequest
          if (!accessRequest || !validateAccessRequest(accessRequest)) {
            updateRequest(request.requestId, 'COMPLETED', { statusCode: 400 })
              .then(resolve)
              .catch(reject)
            return
          }

          const extendedRequest = request as AccessRequestRecord
          extendedRequest.requestedPermissions =
            accessRequest.permissions !== undefined
          if (!extendedRequest.requestedPermissions) {
            extendedRequest.permissions = 'readonly'
          } else {
            extendedRequest.permissions = accessRequest.permissions
          }

          let alertMessage: string
          if (accessRequest.clientId) {
            if (!options.allowDeviceAccessRequests) {
              updateRequest(request.requestId, 'COMPLETED', { statusCode: 403 })
                .then(resolve)
                .catch(reject)
              return
            }

            if (
              findRequest(
                (r) =>
                  r.state === 'PENDING' &&
                  r.accessIdentifier === accessRequest.clientId
              )
            ) {
              updateRequest(request.requestId, 'COMPLETED', {
                statusCode: 400,
                message: `A device with clientId '${accessRequest.clientId}' has already requested access`
              })
                .then(resolve)
                .catch(reject)
              return
            }

            extendedRequest.accessIdentifier = accessRequest.clientId
            extendedRequest.accessDescription = accessRequest.description

            debug(
              `A device with IP ${request.ip} and CLIENTID ${accessRequest.clientId} has requested access to the server`
            )
            alertMessage = `The device "${accessRequest.description}" has requested access to the server`
          } else {
            if (!options.allowNewUserRegistration) {
              updateRequest(request.requestId, 'COMPLETED', { statusCode: 403 })
                .then(resolve)
                .catch(reject)
              return
            }

            const existing = options.users.find(
              (user) => user.username === accessRequest.userId
            )
            if (existing) {
              updateRequest(request.requestId, 'COMPLETED', {
                statusCode: 400,
                message: 'User already exists'
              })
                .then(resolve)
                .catch(reject)
              return
            }
            extendedRequest.accessDescription = 'New User Request'
            extendedRequest.accessIdentifier = accessRequest.userId
            extendedRequest.accessPassword = bcrypt.hashSync(
              accessRequest.password!,
              bcrypt.genSaltSync(passwordSaltRounds)
            )
            alertMessage = `${accessRequest.userId} has requested server access`
            debug(alertMessage)
          }

          const permissionPart = extendedRequest.requestedPermissions
            ? extendedRequest.permissions
            : 'any'
          sendAccessRequestsUpdate()
          app.handleMessage(CONFIG_PLUGINID, {
            context: 'vessels.' + app.selfId,
            updates: [
              {
                values: [
                  {
                    path: `notifications.security.accessRequest.${permissionPart}.${extendedRequest.accessIdentifier}`,
                    value: {
                      state: 'alert',
                      method: ['visual', 'sound'],
                      message: alertMessage,
                      timestamp: new Date().toISOString()
                    }
                  }
                ]
              }
            ]
          })
          updateRequest(request.requestId, 'PENDING', { statusCode: 202 })
            .then((reply) => {
              resolve(reply)
            })
            .catch(reject)
        })
        .catch(reject)
    })
  }

  // Set up the securityConfig property with getter and setter
  Object.defineProperty(strategy, 'securityConfig', {
    get: function (): SecurityConfig {
      return options as SecurityConfig
    },
    set: function (value: SecurityConfig) {
      options = value as SecurityOptions
    },
    enumerable: true,
    configurable: true
  })

  strategy.configFromArguments = false

  setupApp()

  return strategy
}

module.exports = tokenSecurity
