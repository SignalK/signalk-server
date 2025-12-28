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

/**
 * OIDC Configuration - merged from environment variables and security.json
 */
export interface OIDCConfig {
  enabled: boolean
  issuer: string
  clientId: string
  clientSecret: string
  redirectUri?: string
  scope: string
  defaultPermission: 'readonly' | 'readwrite' | 'admin'
  autoCreateUsers: boolean
}

/**
 * Partial OIDC config for merging from different sources
 */
export interface PartialOIDCConfig {
  enabled?: boolean
  issuer?: string
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scope?: string
  defaultPermission?: 'readonly' | 'readwrite' | 'admin'
  autoCreateUsers?: boolean
}

/**
 * OIDC Authorization State - stored in cookie during auth flow
 */
export interface OIDCAuthState {
  state: string
  codeVerifier: string
  nonce: string
  redirectUri: string
  originalUrl: string
  createdAt: number
}

/**
 * OIDC Token Response
 */
export interface OIDCTokens {
  accessToken: string
  idToken: string
  refreshToken?: string
  expiresIn?: number
  tokenType: string
}

/**
 * OIDC User Info - extracted from ID token or userinfo endpoint
 */
export interface OIDCUserInfo {
  sub: string
  email?: string
  name?: string
  preferredUsername?: string
  groups?: string[]
}

/**
 * OIDC user identifier stored in security.json
 */
export interface OIDCUserIdentifier {
  sub: string
  issuer: string
}

/**
 * Discovery document cache entry
 */
export interface DiscoveryCache {
  metadata: OIDCProviderMetadata
  fetchedAt: number
  expiresAt: number
}

/**
 * OIDC Provider Metadata (subset of OpenID Discovery)
 */
export interface OIDCProviderMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint?: string
  jwks_uri: string
  response_types_supported: string[]
  code_challenge_methods_supported?: string[]
  end_session_endpoint?: string
}

/**
 * OIDC Error codes
 */
export type OIDCErrorCode =
  | 'DISCOVERY_FAILED'
  | 'INVALID_STATE'
  | 'STATE_EXPIRED'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXCHANGE_FAILED'
  | 'USER_INFO_FAILED'
  | 'CONFIG_INVALID'
  | 'PKCE_FAILED'
  | 'NOT_CONFIGURED'
  | 'USER_CREATION_DENIED'

/**
 * OIDC Error class
 */
export class OIDCError extends Error {
  constructor(
    message: string,
    public code: OIDCErrorCode,
    public cause?: Error
  ) {
    super(message)
    this.name = 'OIDCError'
    Error.captureStackTrace(this, OIDCError)
  }
}

/**
 * Default OIDC configuration values
 */
export const OIDC_DEFAULTS: Omit<
  OIDCConfig,
  'issuer' | 'clientId' | 'clientSecret'
> = {
  enabled: false,
  scope: 'openid email profile',
  defaultPermission: 'readonly',
  autoCreateUsers: true
}

/**
 * State cookie configuration
 */
export const STATE_COOKIE_NAME = 'OIDC_STATE'
export const STATE_MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Crypto service interface for OIDC state encryption.
 *
 * tokensecurity implements this by providing a derived secret.
 * OIDC handles its own encryption - tokensecurity knows nothing
 * about OIDC state structure (separation of concerns).
 */
export interface OIDCCryptoService {
  /**
   * Get the secret for OIDC state encryption.
   * This is derived from the master secret, ensuring OIDC
   * never has access to the JWT signing key.
   */
  getStateEncryptionSecret(): string
}
