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
  fetchUserinfo,
  mapGroupsToPermission,
  STATE_COOKIE_NAME,
  STATE_MAX_AGE_MS,
  OIDCError,
  OIDCConfig,
  OIDCUserInfo,
  OIDCCryptoService,
  ExternalUserService,
  ExternalUser
} from './index'

const debug = createDebug('signalk-server:oidc-auth')
const skAuthPrefix = '/signalk/v1/auth'

/**
 * Compare two arrays for equality, ignoring order
 */
function arraysEqualIgnoringOrder(
  arr1: string[] | undefined,
  arr2: string[] | undefined
): boolean {
  if (arr1 === arr2) return true
  if (!arr1 || !arr2) return arr1 === arr2
  if (arr1.length !== arr2.length) return false
  const sorted1 = [...arr1].sort()
  const sorted2 = [...arr2].sort()
  return sorted1.every((val, idx) => val === sorted2[idx])
}

/**
 * Dependencies injected by tokensecurity.
 * This interface defines the contract between tokensecurity and OIDC authentication.
 */
export interface OIDCAuthDependencies {
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
  /**
   * Crypto service for OIDC state encryption.
   * Provides a derived secret - OIDC handles its own encryption.
   */
  cryptoService: OIDCCryptoService
  /**
   * User service for external authentication providers.
   * Abstracts user storage so OIDC doesn't need to know about
   * the underlying storage mechanism.
   */
  userService: ExternalUserService
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
 *
 * For existing users, permissions are recalculated on each login based on
 * current group memberships. This allows permission changes to take effect
 * when group assignments change in the identity provider.
 */
export async function findOrCreateOIDCUser(
  userInfo: OIDCUserInfo,
  oidcConfig: OIDCConfig,
  deps: Pick<OIDCAuthDependencies, 'userService'>
): Promise<ExternalUser | null> {
  const issuer = oidcConfig.issuer

  // Calculate permission based on user's groups
  const mappedPermission = mapGroupsToPermission(userInfo.groups, oidcConfig)

  // Build OIDC metadata to store with user
  const oidcMetadata = {
    sub: userInfo.sub,
    issuer,
    email: userInfo.email,
    name: userInfo.name,
    groups: userInfo.groups
  }

  // Look for existing user by OIDC sub + issuer
  const user = await deps.userService.findUserByProvider({
    provider: 'oidc',
    criteria: { sub: userInfo.sub, issuer }
  })

  if (user) {
    debug(`OIDC: found existing user ${user.username}`)

    // Check if anything changed
    const existingOidc = user.providerData as typeof oidcMetadata | undefined
    const previousPermission = user.type
    const permissionChanged = previousPermission !== mappedPermission
    const metadataChanged =
      existingOidc?.email !== oidcMetadata.email ||
      existingOidc?.name !== oidcMetadata.name ||
      !arraysEqualIgnoringOrder(existingOidc?.groups, oidcMetadata.groups)

    if (permissionChanged) {
      debug(
        `OIDC: updating user ${user.username} permission from ${previousPermission} to ${mappedPermission}`
      )
    }

    // Only save if something changed
    if (permissionChanged || metadataChanged) {
      try {
        await deps.userService.updateUser(user.username, {
          type: mappedPermission,
          providerData: oidcMetadata
        })
        // Update local reference for return
        user.type = mappedPermission
        user.providerData = oidcMetadata
      } catch (err) {
        console.error('Failed to update OIDC user:', err)
      }
    }

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
  const existingUser = await deps.userService.findUserByUsername(username)
  // Only consider it a collision if the existing user is NOT an OIDC user
  const isCollision = existingUser && !existingUser.providerData
  const finalUsername = isCollision
    ? `${username}-${userInfo.sub.substring(0, 8)}`
    : username

  const newUser: ExternalUser = {
    username: finalUsername,
    type: mappedPermission,
    providerData: oidcMetadata
  }

  debug(
    `OIDC: creating new user ${newUser.username} with permission ${newUser.type}`
  )

  try {
    await deps.userService.createUser(newUser)
  } catch (err) {
    console.error('Failed to create OIDC user:', err)
    throw err
  }

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
      // Helper to redirect to login page with error (better UX for browser-based login)
      const redirectWithError = (message: string) => {
        const errorParam = encodeURIComponent(message)
        res.redirect(`/admin/#/login?oidcError=true&message=${errorParam}`)
      }

      try {
        const { code, state, error, error_description } = req.query as Record<
          string,
          string
        >

        // Check for OIDC error from provider
        if (error) {
          res.clearCookie(STATE_COOKIE_NAME)
          console.error(`OIDC error: ${error} - ${error_description}`)
          redirectWithError(error_description || error)
          return
        }

        // Validate required parameters
        if (!code || !state) {
          res.clearCookie(STATE_COOKIE_NAME)
          redirectWithError('Missing code or state parameter')
          return
        }

        // Get and validate stored state
        const stateCookie = req.cookies[STATE_COOKIE_NAME]
        if (!stateCookie) {
          redirectWithError('Session expired. Please try again.')
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
          redirectWithError(
            err instanceof OIDCError
              ? err.message
              : 'Session expired or invalid'
          )
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

        // Fetch additional claims from userinfo endpoint
        // ID token typically only contains minimal claims; userinfo has groups, email, etc.
        const userinfoClaims = await fetchUserinfo(tokens.accessToken, metadata)
        if (userinfoClaims) {
          // Merge userinfo claims into ID token claims (userinfo takes precedence)
          Object.assign(claims, userinfoClaims)
        }

        // Clear state cookie after successful validation
        res.clearCookie(STATE_COOKIE_NAME)

        // Extract user info from validated claims
        // Use configured groupsAttribute or default to 'groups'
        const groupsAttr = oidcConfig.groupsAttribute || 'groups'
        const rawGroups = claims[groupsAttr]
        // Normalize groups: handle array, single string, or undefined
        let groups: string[] | undefined
        if (Array.isArray(rawGroups)) {
          groups = rawGroups as string[]
        } else if (typeof rawGroups === 'string' && rawGroups.length > 0) {
          groups = [rawGroups]
        }

        const userInfo: OIDCUserInfo = {
          sub: claims.sub as string,
          email: claims.email as string | undefined,
          name: claims.name as string | undefined,
          preferredUsername: claims.preferred_username as string | undefined,
          groups
        }
        debug(`OIDC: user authenticated: ${userInfo.sub}`)

        // Find or create user
        const user = await findOrCreateOIDCUser(userInfo, oidcConfig, deps)
        if (!user) {
          redirectWithError('User auto-creation is disabled')
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
        redirectWithError(
          err instanceof Error ? err.message : 'Authentication failed'
        )
      }
    }
  )

  // OIDC status endpoint - returns OIDC configuration status (used by login page)
  app.get(`${skAuthPrefix}/oidc/status`, (_req: Request, res: Response) => {
    try {
      const oidcConfig = deps.getOIDCConfig()
      res.json({
        enabled: isOIDCEnabled(oidcConfig),
        issuer: oidcConfig.enabled ? oidcConfig.issuer : undefined,
        loginUrl: oidcConfig.enabled ? `${skAuthPrefix}/oidc/login` : undefined,
        providerName: oidcConfig.enabled ? oidcConfig.providerName : undefined,
        autoLogin: oidcConfig.enabled ? oidcConfig.autoLogin : false
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
