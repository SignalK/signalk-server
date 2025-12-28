/*
 * Copyright 2025 Matti Airas
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Request, Response, Application } from 'express'
import { createDebug } from '../debug'
import {
  isOIDCEnabled,
  createAuthState,
  validateState,
  encryptState,
  decryptState,
  getDiscoveryDocument,
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  validateIdToken,
  STATE_COOKIE_NAME,
  STATE_MAX_AGE_MS,
  OIDCError,
  OIDCConfig,
  OIDCUserInfo,
  OIDCCryptoService
} from './index'
import { User, SecurityConfig } from '../security'

const debug = createDebug('signalk-server:oidc-auth')
const skAuthPrefix = '/signalk/v1/auth'

/**
 * Dependencies injected by tokensecurity.
 * This interface defines the contract between tokensecurity and OIDC authentication.
 */
export interface OIDCAuthDependencies {
  /** Get the current security configuration */
  getConfiguration: () => SecurityConfig
  /** Get parsed OIDC configuration */
  getOIDCConfig: () => OIDCConfig
  /** Set session cookies after successful authentication */
  setSessionCookie: (
    res: Response,
    req: Request,
    token: string,
    username: string,
    options?: { rememberMe?: boolean }
  ) => void
  /** Clear session cookies on logout */
  clearSessionCookie: (res: Response) => void
  /** Generate a JWT for a user */
  generateJWT: (userId: string, expiration?: string) => string
  /** Save security configuration */
  saveConfig: (
    config: SecurityConfig,
    callback: (err: Error | null) => void
  ) => void
  /**
   * Crypto service for OIDC state encryption.
   * Provides a derived secret - OIDC handles its own encryption.
   */
  cryptoService: OIDCCryptoService
}

/**
 * Validate that a URL is a safe relative path (prevents open redirect attacks)
 */
function isSafeRelativeUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url) {
    return false
  }
  // Must start with / but not // (which would be protocol-relative URL)
  // Also reject URLs with backslashes or control characters
  const hasControlChars = url.split('').some((char) => {
    const code = char.charCodeAt(0)
    return code >= 0 && code <= 31
  })
  return (
    url.startsWith('/') &&
    !url.startsWith('//') &&
    !url.includes('\\') &&
    !hasControlChars
  )
}

/**
 * Find or create a user from OIDC authentication.
 * This function looks up existing users by OIDC subject+issuer, or creates
 * a new user if auto-creation is enabled.
 */
export async function findOrCreateOIDCUser(
  userInfo: OIDCUserInfo,
  oidcConfig: OIDCConfig,
  deps: Pick<OIDCAuthDependencies, 'getConfiguration' | 'saveConfig'>
): Promise<User | null> {
  const configuration = deps.getConfiguration()
  const issuer = oidcConfig.issuer

  // Look for existing user by OIDC sub + issuer
  const user = configuration.users.find(
    (u) => u.oidc && u.oidc.sub === userInfo.sub && u.oidc.issuer === issuer
  )

  if (user) {
    debug(`OIDC: found existing user ${user.username}`)
    return user
  }

  // User not found - check if auto-creation is enabled
  if (!oidcConfig.autoCreateUsers) {
    debug('OIDC: user not found and auto-creation disabled')
    return null
  }

  // Create new user
  const username =
    userInfo.preferredUsername || userInfo.email || `oidc-${userInfo.sub}`

  // Check for username collision with non-OIDC user
  const existingUser = configuration.users.find(
    (u) => u.username === username && !u.oidc
  )
  const finalUsername = existingUser
    ? `${username}-${userInfo.sub.substring(0, 8)}`
    : username

  const newUser: User = {
    username: finalUsername,
    type: oidcConfig.defaultPermission,
    oidc: {
      sub: userInfo.sub,
      issuer
    }
  }

  debug(
    `OIDC: creating new user ${newUser.username} with permission ${newUser.type}`
  )
  configuration.users.push(newUser)

  // Save configuration (async, but don't block)
  deps.saveConfig(configuration, (err) => {
    if (err) {
      console.error('Failed to save OIDC user:', err)
    }
  })

  return newUser
}

/**
 * Register OIDC authentication routes.
 * This function adds the OIDC login, callback, and status endpoints to the Express app.
 */
export function registerOIDCRoutes(
  app: Application,
  deps: OIDCAuthDependencies
): void {
  // OIDC login route - initiates the OIDC flow
  app.get(`${skAuthPrefix}/oidc/login`, async (req: Request, res: Response) => {
    try {
      const oidcConfig = deps.getOIDCConfig()
      if (!isOIDCEnabled(oidcConfig)) {
        res.status(500).json({ error: 'OIDC is not configured' })
        return
      }

      const metadata = await getDiscoveryDocument(oidcConfig.issuer)

      // Build redirect URI
      const protocol = req.secure ? 'https' : 'http'
      const host = req.get('host')
      const redirectUri =
        oidcConfig.redirectUri ||
        `${protocol}://${host}${skAuthPrefix}/oidc/callback`

      // Store original destination (validated to prevent open redirect attacks)
      const requestedRedirect = req.query.redirect
      const originalUrl = isSafeRelativeUrl(requestedRedirect)
        ? requestedRedirect
        : '/'

      // Create auth state
      const authState = createAuthState(redirectUri, originalUrl)

      // Encrypt and store state in cookie using derived secret
      const stateSecret = deps.cryptoService.getStateEncryptionSecret()
      const encryptedState = encryptState(authState, stateSecret)

      res.cookie(STATE_COOKIE_NAME, encryptedState, {
        httpOnly: true,
        secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
        sameSite: 'lax',
        maxAge: STATE_MAX_AGE_MS
      })

      // Build and redirect to authorization URL
      const authUrl = buildAuthorizationUrl(oidcConfig, metadata, authState)
      debug(`OIDC: redirecting to ${authUrl}`)
      res.redirect(authUrl)
    } catch (err) {
      console.error('OIDC login error:', err)
      res.status(500).json({
        error: 'OIDC login failed',
        message: err instanceof Error ? err.message : String(err)
      })
    }
  })

  // OIDC callback route - handles the response from the OIDC provider
  app.get(
    `${skAuthPrefix}/oidc/callback`,
    async (req: Request, res: Response) => {
      try {
        const { code, state, error, error_description } = req.query as Record<
          string,
          string
        >

        // Check for OIDC error from provider
        if (error) {
          res.clearCookie(STATE_COOKIE_NAME)
          console.error(`OIDC error: ${error} - ${error_description}`)
          res.status(400).json({
            error: 'OIDC authentication failed',
            message: error_description || error
          })
          return
        }

        // Validate required parameters
        if (!code || !state) {
          res.clearCookie(STATE_COOKIE_NAME)
          res.status(400).json({ error: 'Missing code or state parameter' })
          return
        }

        // Get and validate stored state
        const stateCookie = req.cookies[STATE_COOKIE_NAME]
        if (!stateCookie) {
          res.status(400).json({ error: 'Missing state cookie' })
          return
        }

        // Decrypt state using derived secret
        const stateSecret = deps.cryptoService.getStateEncryptionSecret()
        let authState
        try {
          authState = decryptState(stateCookie, stateSecret)
          validateState(state, authState)
        } catch (err) {
          res.clearCookie(STATE_COOKIE_NAME)
          console.error('OIDC state validation failed:', err)
          res.status(400).json({
            error: 'State validation failed',
            message:
              err instanceof OIDCError
                ? err.message
                : 'Invalid or expired state'
          })
          return
        }

        const oidcConfig = deps.getOIDCConfig()
        const metadata = await getDiscoveryDocument(oidcConfig.issuer)

        // Exchange code for tokens
        const tokens = await exchangeAuthorizationCode(
          code,
          oidcConfig,
          metadata,
          authState
        )

        // Validate ID token signature and claims (including nonce)
        const claims = await validateIdToken(
          tokens.idToken,
          oidcConfig,
          metadata,
          authState.nonce
        )

        // Clear state cookie after successful validation
        res.clearCookie(STATE_COOKIE_NAME)

        // Extract user info from validated claims
        const userInfo: OIDCUserInfo = {
          sub: claims.sub as string,
          email: claims.email as string | undefined,
          name: claims.name as string | undefined,
          preferredUsername: claims.preferred_username as string | undefined,
          groups: claims.groups as string[] | undefined
        }
        debug(`OIDC: user authenticated: ${userInfo.sub}`)

        // Find or create user
        const user = await findOrCreateOIDCUser(userInfo, oidcConfig, deps)
        if (!user) {
          res.status(403).json({
            error: 'User creation denied',
            message: 'OIDC user auto-creation is disabled'
          })
          return
        }

        // Issue local JWT token
        const token = deps.generateJWT(user.username)

        // Set session cookies using the shared helper (fixes security issue!)
        deps.setSessionCookie(res, req, token, user.username, {
          rememberMe: true
        })

        // Redirect to original destination
        res.redirect(authState.originalUrl)
      } catch (err) {
        console.error('OIDC callback error:', err)
        res.status(500).json({
          error: 'OIDC authentication failed',
          message: err instanceof Error ? err.message : String(err)
        })
      }
    }
  )

  // OIDC status endpoint - returns OIDC configuration status
  app.get(`${skAuthPrefix}/oidc/status`, (_req: Request, res: Response) => {
    try {
      const oidcConfig = deps.getOIDCConfig()
      res.json({
        enabled: isOIDCEnabled(oidcConfig),
        issuer: oidcConfig.enabled ? oidcConfig.issuer : undefined,
        loginUrl: oidcConfig.enabled ? `${skAuthPrefix}/oidc/login` : undefined
      })
    } catch (_err) {
      res.json({ enabled: false })
    }
  })

  // OIDC logout endpoint - clears local session and optionally redirects to provider logout
  app.get(
    `${skAuthPrefix}/oidc/logout`,
    async (req: Request, res: Response) => {
      try {
        // Clear local session cookies
        deps.clearSessionCookie(res)

        // Get post-logout redirect URI (validated to prevent open redirect attacks)
        const requestedRedirect = req.query.redirect
        const postLogoutRedirect = isSafeRelativeUrl(requestedRedirect)
          ? requestedRedirect
          : '/'

        // Check if OIDC is enabled and provider supports RP-initiated logout
        const oidcConfig = deps.getOIDCConfig()
        if (!isOIDCEnabled(oidcConfig)) {
          // OIDC not enabled, just redirect locally
          res.redirect(postLogoutRedirect)
          return
        }

        // Fetch discovery document to check for end_session_endpoint
        let metadata
        try {
          metadata = await getDiscoveryDocument(oidcConfig.issuer)
        } catch (err) {
          debug('OIDC: failed to fetch discovery document for logout:', err)
          // Fall back to local redirect
          res.redirect(postLogoutRedirect)
          return
        }

        if (!metadata.end_session_endpoint) {
          // Provider doesn't support RP-initiated logout
          debug('OIDC: provider does not support end_session_endpoint')
          res.redirect(postLogoutRedirect)
          return
        }

        // Build logout URL with post_logout_redirect_uri
        const protocol = req.secure ? 'https' : 'http'
        const host = req.get('host')
        const fullPostLogoutUri = `${protocol}://${host}${postLogoutRedirect}`

        const logoutUrl = new URL(metadata.end_session_endpoint)
        logoutUrl.searchParams.set(
          'post_logout_redirect_uri',
          fullPostLogoutUri
        )
        // Note: We don't send id_token_hint as we don't persist the ID token
        // The provider should still be able to identify the session via cookies

        debug(`OIDC: redirecting to logout URL: ${logoutUrl.toString()}`)
        res.redirect(logoutUrl.toString())
      } catch (err) {
        console.error('OIDC logout error:', err)
        // On error, still clear cookies and redirect to home
        deps.clearSessionCookie(res)
        res.redirect('/')
      }
    }
  )
}
