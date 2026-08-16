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

import type { Request } from 'express'
import type passport from 'passport'
import type {
  Configuration,
  ServerMetadata,
  TokenEndpointResponse,
  TokenEndpointResponseHelpers
} from 'openid-client'
import type {
  AuthenticateOptions,
  Strategy as OpenIdStrategy,
  VerifyFunction
} from 'openid-client/passport'
import type {
  AuthenticationProvider,
  ExternalIdentity
} from '@signalk/server-api'
import { createDebug } from '../debug'
import { OIDCConfig } from './types'
import { mapGroupsToPermission } from './permission-mapping'

const debug = createDebug('signalk-server:oidc')

export const OIDC_PROVIDER_ID = 'oidc'
/** Matches the tolerance Signal K used before delegating validation to openid-client */
const CLOCK_TOLERANCE_SECONDS = 300
const DEFAULT_GROUPS_ATTRIBUTE = 'groups'
const DISCOVERY_PLACEHOLDER_CLIENT_ID = 'signalk-server'

type OpenIdClientModule = typeof import('openid-client')
type OpenIdPassportModule = typeof import('openid-client/passport')

// openid-client is ESM-only; loaded on first use so the CommonJS server can
// consume it without a build-time dependency on ESM interop.
let clientModule: Promise<OpenIdClientModule> | undefined
let passportModule: Promise<OpenIdPassportModule> | undefined

function openIdClient(): Promise<OpenIdClientModule> {
  clientModule ??= import('openid-client')
  return clientModule
}

function openIdPassport(): Promise<OpenIdPassportModule> {
  passportModule ??= import('openid-client/passport')
  return passportModule
}

/**
 * Fetches the provider's discovery document and builds an openid-client
 * configuration. Plain-http issuers are allowed for local test providers.
 */
export async function discoverOIDC(
  issuer: string,
  clientId: string = DISCOVERY_PLACEHOLDER_CLIENT_ID,
  clientSecret?: string
): Promise<Configuration> {
  const client = await openIdClient()
  const issuerUrl = new URL(issuer)
  const metadata = {
    client_secret: clientSecret,
    [client.clockTolerance]: CLOCK_TOLERANCE_SECONDS
  }
  const insecure = issuerUrl.protocol === 'http:'
  if (insecure) {
    console.warn(
      `OIDC: issuer ${issuerUrl.origin} uses plain http; tokens and the client secret travel unencrypted`
    )
  }
  return client.discovery(issuerUrl, clientId, metadata, undefined, {
    execute: insecure ? [client.allowInsecureRequests] : undefined
  })
}

/** Subset of provider metadata reported by the admin "test connection" endpoint */
export function summarizeMetadata(metadata: ServerMetadata) {
  return {
    issuer: metadata.issuer,
    authorization_endpoint: metadata.authorization_endpoint,
    token_endpoint: metadata.token_endpoint,
    userinfo_endpoint: metadata.userinfo_endpoint,
    jwks_uri: metadata.jwks_uri
  }
}

function normalizeGroups(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((g): g is string => typeof g === 'string')
  }
  if (typeof value === 'string' && value.length > 0) {
    return [value]
  }
  return undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Turns validated tokens into the identity the server provisions a user
 * from. openid-client has already checked the ID token signature, issuer,
 * audience, expiry and nonce, and `fetchUserInfo` rejects a userinfo
 * response whose `sub` differs from the ID token. Only profile claims are
 * taken from userinfo so it can never override the token's identity claims.
 */
async function identityFromTokens(
  client: OpenIdClientModule,
  configuration: Configuration,
  config: OIDCConfig,
  tokens: TokenEndpointResponse & TokenEndpointResponseHelpers
): Promise<ExternalIdentity> {
  const idToken = tokens.claims()
  if (!idToken) {
    throw new Error('The identity provider did not return an ID token')
  }
  const groupsAttribute = config.groupsAttribute || DEFAULT_GROUPS_ATTRIBUTE
  const claims: Record<string, unknown> = { ...idToken }

  if (configuration.serverMetadata().userinfo_endpoint) {
    try {
      const userinfo = await client.fetchUserInfo(
        configuration,
        tokens.access_token,
        idToken.sub
      )
      for (const claim of [
        'email',
        'name',
        'preferred_username',
        groupsAttribute
      ]) {
        if (userinfo[claim] !== undefined) {
          claims[claim] = userinfo[claim]
        }
      }
    } catch (err) {
      // Non-fatal: the ID token alone identifies the user
      console.warn(
        `OIDC: userinfo request failed, continuing with ID token claims: ${err instanceof Error ? err.message : err}`
      )
    }
  }

  const groups = normalizeGroups(claims[groupsAttribute])
  return {
    subject: idToken.sub,
    issuer: config.issuer,
    username: optionalString(claims.preferred_username),
    email: optionalString(claims.email),
    name: optionalString(claims.name),
    permission: mapGroupsToPermission(groups, config)
  }
}

async function buildStrategy(
  config: OIDCConfig,
  configuration: Configuration
): Promise<OpenIdStrategy> {
  const [client, { Strategy }] = await Promise.all([
    openIdClient(),
    openIdPassport()
  ])

  // openid-client only sends a nonce for response types that return the ID
  // token from the authorization endpoint; requesting one for the code flow
  // too keeps the ID token bound to this login attempt.
  class NonceStrategy extends Strategy {
    override authorizationRequestParams<TOptions extends AuthenticateOptions>(
      req: Request,
      options: TOptions
    ): URLSearchParams {
      const params = new URLSearchParams(
        super.authorizationRequestParams(req, options)
      )
      params.set('nonce', client.randomNonce())
      return params
    }
  }

  const verify: VerifyFunction = (tokens, done) => {
    identityFromTokens(client, configuration, config, tokens).then(
      (identity) => done(null, identity),
      (err) => done(err)
    )
  }

  return new NonceStrategy(
    {
      config: configuration,
      name: OIDC_PROVIDER_ID,
      sessionKey: OIDC_PROVIDER_ID,
      callbackURL: config.redirectUri,
      scope: config.scope
    },
    verify
  )
}

type Augmented = passport.StrategyCreated<passport.Strategy>

/**
 * Discovery needs the network, and the identity provider may well come up
 * after Signal K on the same box, so the real strategy is built on the
 * first login attempt and kept until the configuration changes. A failed
 * build is not cached, so the next attempt retries.
 */
function lazyStrategy(build: () => Promise<OpenIdStrategy>): passport.Strategy {
  let inner: Promise<OpenIdStrategy> | undefined
  const strategy = () => {
    inner ??= build().catch((err) => {
      inner = undefined
      throw err
    })
    return inner
  }

  return {
    name: OIDC_PROVIDER_ID,
    authenticate(this: Augmented, req: Request, options?: unknown) {
      strategy()
        .then((real) => {
          // passport augments a per-request object whose prototype is the
          // registered strategy; hand the same callbacks to the real one
          const delegate = Object.create(real) as passport.StrategyCreated<
            OpenIdStrategy,
            OpenIdStrategy & passport.StrategyCreatedStatic
          >
          delegate.success = this.success
          delegate.fail = this.fail
          delegate.redirect = this.redirect
          delegate.pass = this.pass
          delegate.error = this.error
          real.authenticate.call(delegate, req, options ?? {})
        })
        .catch((err) =>
          this.error(err instanceof Error ? err : new Error(String(err)))
        )
    }
  }
}

/**
 * The OpenID Connect login method, registered with the authentication
 * provider registry like any plugin-provided one.
 */
export function createOIDCProvider(config: OIDCConfig): AuthenticationProvider {
  let configuration: Promise<Configuration> | undefined
  const discovered = () => {
    configuration ??= discoverOIDC(
      config.issuer,
      config.clientId,
      config.clientSecret
    ).catch((err) => {
      configuration = undefined
      throw err
    })
    return configuration
  }

  return {
    id: OIDC_PROVIDER_ID,
    name: config.providerName,
    autoCreateUsers: config.autoCreateUsers,
    autoLogin: config.autoLogin,
    strategy: lazyStrategy(async () =>
      buildStrategy(config, await discovered())
    ),
    logoutUrl: async (_req, postLogoutRedirect) => {
      const client = await openIdClient()
      const oidcConfiguration = await discovered()
      if (!oidcConfiguration.serverMetadata().end_session_endpoint) {
        debug('provider has no end_session_endpoint, logging out locally')
        return undefined
      }
      // The origin comes from the configured redirect URI so a forged Host
      // header cannot steer the post-logout redirect
      const origin = new URL(config.redirectUri).origin
      return client.buildEndSessionUrl(oidcConfiguration, {
        post_logout_redirect_uri: `${origin}${postLogoutRedirect}`
      }).href
    }
  }
}
