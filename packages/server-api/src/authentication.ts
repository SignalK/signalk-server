import type { IncomingMessage } from 'http'

/**
 * Signal K permission level granted to a user.
 *
 * @category Authentication Providers
 */
export type AuthenticationPermission = 'readonly' | 'readwrite' | 'admin'

/**
 * Identity established by an authentication provider.
 *
 * A provider's passport strategy passes an object of this shape as the
 * `user` argument of its verify callback (`done(null, identity)`). The
 * server maps it to a local user record keyed by `provider` + `issuer` +
 * `subject`, creating the record on first login when the provider allows
 * it, and issues the regular Signal K session for that user.
 *
 * @category Authentication Providers
 */
export interface ExternalIdentity {
  /** Stable, unique identifier of the user at the provider */
  subject: string
  /**
   * Issuer or realm the subject belongs to, when the provider has such a
   * concept (OIDC `iss`, SAML entity ID). Part of the identity key: the same
   * subject at a different issuer is a different user.
   */
  issuer?: string
  /** Preferred local username for an auto-created user */
  username?: string
  /**
   * Permission mapped by the provider (from groups, roles, ...). When set it
   * is applied on every login, so changes at the provider take effect on the
   * next sign-in. When omitted, new users get `readonly` and later changes
   * made by an admin are left alone.
   */
  permission?: AuthenticationPermission
  email?: string
  name?: string
}

/**
 * Structural subset of a [passport](https://www.passportjs.org/) `Strategy`.
 * Any strategy from the passport ecosystem satisfies it.
 *
 * @category Authentication Providers
 */
export interface AuthenticationStrategy {
  name?: string
  authenticate(req: IncomingMessage, options?: unknown): void
}

/**
 * A redirect-style login method offered on the login page, backed by a
 * passport strategy. See {@link ServerAPI.registerAuthenticationProvider}.
 *
 * @category Authentication Providers
 */
export interface AuthenticationProvider {
  /**
   * URL segment and stored provider key: `/signalk/v1/auth/<id>/login`,
   * `/signalk/v1/auth/<id>/callback`. Lowercase letters, digits and hyphens.
   */
  id: string
  /** Label of the login button */
  name: string
  /**
   * Passport strategy handling both the login redirect and the callback.
   * Its verify callback must produce an {@link ExternalIdentity}. Strategies
   * that need `req.session` get a short-lived encrypted cookie session
   * scoped to the auth routes.
   */
  strategy: AuthenticationStrategy
  /**
   * Create a local user record on first login (default `true`). When
   * `false`, unknown identities are rejected.
   */
  autoCreateUsers?: boolean
  /**
   * Send unauthenticated visitors of the login page straight to this
   * provider (default `false`). `/admin/#/login?noAutoLogin=true` bypasses it.
   */
  autoLogin?: boolean
  /**
   * Extra options passed to `passport.authenticate()` on the login leg
   * (e.g. `scope`, `prompt`).
   */
  authenticateOptions?: Record<string, unknown>
  /**
   * Builds the URL to send the browser to after
   * `/signalk/v1/auth/<id>/logout` has cleared the local session, for
   * providers that support single logout. `postLogoutRedirect` is the
   * validated relative path the user should return to. Return `undefined`
   * to redirect there directly.
   */
  logoutUrl?: (
    req: IncomingMessage,
    postLogoutRedirect: string
  ) => Promise<string | undefined> | string | undefined
}
