import { IRouter, NextFunction, Request, Response } from 'express'
import passport from 'passport'
import { AuthenticationProvider, ExternalIdentity } from '@signalk/server-api'
import { createDebug } from '../debug'
import { AuthProviderStatus, User } from '../security'
import { UserCreationDisabledError, UserProvisioner } from './provisioning'
import {
  handshakeSession,
  HandshakeRequest,
  HandshakeSession
} from './handshake-session'
import { loginErrorUrl, safeRelativeUrlOr } from './redirect'

const debug = createDebug('signalk-server:auth:providers')

export const AUTH_ROUTE_PREFIX = '/signalk/v1/auth'
const HANDSHAKE_COOKIE_NAME = 'SK_AUTH_HANDSHAKE'
const HANDSHAKE_MAX_AGE_MS = 10 * 60 * 1000
const RETURN_TO_KEY = 'returnTo'
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/
const PERMISSIONS = new Set<string>(['readonly', 'readwrite', 'admin'])
const GENERIC_FAILURE = 'Authentication failed'

export function loginUrlFor(providerId: string): string {
  return `${AUTH_ROUTE_PREFIX}/${providerId}/login`
}

/**
 * Registered login methods. Each provider's passport strategy is mounted
 * under its own name on a private passport instance, so a provider added or
 * removed by a plugin at runtime is picked up by the next request.
 */
export class AuthenticationProviderRegistry {
  private readonly passport = new passport.Passport()
  private readonly providers = new Map<string, AuthenticationProvider>()

  register(provider: AuthenticationProvider): () => void {
    validateProvider(provider)
    if (this.providers.has(provider.id)) {
      throw new Error(
        `Authentication provider "${provider.id}" is already registered`
      )
    }
    this.providers.set(provider.id, provider)
    this.passport.use(provider.id, provider.strategy as passport.Strategy)
    debug(`registered provider ${provider.id}`)
    return () => this.unregister(provider.id, provider)
  }

  private unregister(id: string, provider: AuthenticationProvider): void {
    // A provider re-registered under the same id after this one was replaced
    // must not be removed by the stale unregister function
    if (this.providers.get(id) !== provider) {
      return
    }
    this.providers.delete(id)
    this.passport.unuse(id)
    debug(`unregistered provider ${id}`)
  }

  get(id: string): AuthenticationProvider | undefined {
    return this.providers.get(id)
  }

  status(): AuthProviderStatus[] {
    return [...this.providers.values()].map((p) => ({
      id: p.id,
      name: p.name,
      loginUrl: loginUrlFor(p.id),
      autoLogin: p.autoLogin === true
    }))
  }

  authenticate(
    id: string,
    options: passport.AuthenticateOptions,
    callback: passport.AuthenticateCallback
  ): (req: Request, res: Response, next: NextFunction) => void {
    return this.passport.authenticate(id, options, callback)
  }
}

function validateProvider(provider: AuthenticationProvider): void {
  if (
    typeof provider.id !== 'string' ||
    !PROVIDER_ID_PATTERN.test(provider.id)
  ) {
    throw new Error(
      'Authentication provider id must consist of lowercase letters, digits and hyphens'
    )
  }
  if (typeof provider.name !== 'string' || provider.name.trim() === '') {
    throw new Error('Authentication provider name is required')
  }
  if (typeof provider.strategy?.authenticate !== 'function') {
    throw new Error(
      'Authentication provider strategy must be a passport Strategy'
    )
  }
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

/**
 * Providers are external code, so what their verify callback hands back is
 * checked before it reaches user provisioning.
 */
export function isExternalIdentity(value: unknown): value is ExternalIdentity {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const v = value as Record<string, unknown>
  return (
    typeof v.subject === 'string' &&
    v.subject.length > 0 &&
    isOptionalString(v.issuer) &&
    isOptionalString(v.username) &&
    isOptionalString(v.email) &&
    isOptionalString(v.name) &&
    (v.permission === undefined ||
      (typeof v.permission === 'string' && PERMISSIONS.has(v.permission)))
  )
}

export interface AuthProviderRouteDeps {
  provisioner: UserProvisioner
  /** Secret the handshake cookie is encrypted with; derived from the master key */
  getHandshakeSecret: () => string
  /** Issue the regular Signal K session for a provisioned user */
  loginUser: (req: Request, res: Response, user: User) => void
  clearSessionCookie: (res: Response) => void
}

export function registerAuthProviderRoutes(
  app: IRouter,
  registry: AuthenticationProviderRegistry,
  deps: AuthProviderRouteDeps
): void {
  const handshake = handshakeSession({
    cookieName: HANDSHAKE_COOKIE_NAME,
    cookiePath: AUTH_ROUTE_PREFIX,
    getSecret: deps.getHandshakeSecret,
    maxAgeMs: HANDSHAKE_MAX_AGE_MS
  })

  function withProvider(
    handler: (
      provider: AuthenticationProvider,
      req: HandshakeRequest,
      res: Response,
      next: NextFunction
    ) => void
  ) {
    return (req: Request, res: Response, next: NextFunction) => {
      const provider = registry.get(req.params.providerId)
      if (!provider) {
        res.status(404).json({ error: 'Unknown authentication provider' })
        return
      }
      handler(provider, req as HandshakeRequest, res, next)
    }
  }

  function session(req: HandshakeRequest): HandshakeSession {
    req.session ??= {}
    return req.session
  }

  /**
   * Both legs share this: a strategy that redirects to an identity provider
   * finishes on the callback route, one that authenticates immediately
   * finishes on the login route.
   */
  function complete(
    provider: AuthenticationProvider,
    req: HandshakeRequest,
    res: Response,
    next: NextFunction,
    options: passport.AuthenticateOptions
  ): void {
    const fail = (message: string) => {
      req.session = {}
      res.redirect(loginErrorUrl(message))
    }
    registry.authenticate(
      provider.id,
      { ...options, session: false },
      (err, identity, info) => {
        // Only messages meant for the user reach the login page; internal
        // errors are logged and shown as a generic failure
        if (err) {
          console.error(`${provider.id} authentication error:`, err)
          fail(GENERIC_FAILURE)
          return
        }
        if (!identity) {
          const message =
            typeof info === 'object' &&
            info !== null &&
            'message' in info &&
            typeof info.message === 'string'
              ? info.message
              : GENERIC_FAILURE
          fail(message)
          return
        }
        if (!isExternalIdentity(identity)) {
          console.error(
            `${provider.id} returned an invalid identity (subject missing or fields of the wrong type)`
          )
          fail('Authentication provider returned an invalid identity')
          return
        }
        deps.provisioner
          .resolve(provider.id, provider.autoCreateUsers !== false, identity)
          .then(
            (user) => {
              const returnTo = safeRelativeUrlOr(
                session(req)[RETURN_TO_KEY],
                '/'
              )
              req.session = {}
              deps.loginUser(req, res, user)
              debug(`${provider.id}: ${user.username} logged in`)
              res.redirect(returnTo)
            },
            (provisioningError: Error) => {
              console.error(
                `${provider.id}: user provisioning failed:`,
                provisioningError
              )
              fail(
                provisioningError instanceof UserCreationDisabledError
                  ? provisioningError.message
                  : GENERIC_FAILURE
              )
            }
          )
          .catch((err) => {
            console.error(`${provider.id}: login could not be completed:`, err)
            if (!res.headersSent) {
              fail(GENERIC_FAILURE)
            }
          })
      }
    )(req, res, next)
  }

  app.get(
    `${AUTH_ROUTE_PREFIX}/:providerId/login`,
    handshake,
    withProvider((provider, req, res, next) => {
      session(req)[RETURN_TO_KEY] = safeRelativeUrlOr(req.query.redirect, '/')
      complete(provider, req, res, next, provider.authenticateOptions ?? {})
    })
  )

  const callback = withProvider((provider, req, res, next) =>
    complete(provider, req, res, next, {})
  )
  app.get(`${AUTH_ROUTE_PREFIX}/:providerId/callback`, handshake, callback)
  app.post(`${AUTH_ROUTE_PREFIX}/:providerId/callback`, handshake, callback)

  app.get(
    `${AUTH_ROUTE_PREFIX}/:providerId/logout`,
    withProvider(async (provider, req, res) => {
      deps.clearSessionCookie(res)
      const postLogoutRedirect = safeRelativeUrlOr(req.query.redirect, '/')
      let target: string | undefined
      try {
        target = await provider.logoutUrl?.(req, postLogoutRedirect)
      } catch (err) {
        debug(`${provider.id}: logout URL unavailable:`, err)
      }
      res.redirect(target ?? postLogoutRedirect)
    })
  )
}
