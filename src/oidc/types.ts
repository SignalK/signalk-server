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
 * Signal K permission type
 */
export type SignalKPermission = 'readonly' | 'readwrite' | 'admin'

/**
 * OIDC Configuration - merged from environment variables and security.json
 */
export interface OIDCConfig {
  enabled: boolean
  issuer: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scope: string
  defaultPermission: SignalKPermission
  autoCreateUsers: boolean
  /** Groups that grant admin permission */
  adminGroups?: string[]
  /** Groups that grant readwrite permission */
  readwriteGroups?: string[]
  /**
   * ID token claim key for groups (default: 'groups').
   * Common alternatives: 'roles', 'memberOf', 'cognito:groups'
   * Note: Groups must be present in the ID token, not the userinfo endpoint.
   * Both array and single string values are supported.
   */
  groupsAttribute?: string
  /**
   * Display name for the OIDC provider shown on the login button.
   * Default: 'SSO Login'
   */
  providerName: string
  /**
   * If true, automatically redirect to OIDC login when not authenticated.
   * Default: false
   */
  autoLogin: boolean
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
  defaultPermission?: SignalKPermission
  autoCreateUsers?: boolean
  adminGroups?: string[]
  readwriteGroups?: string[]
  groupsAttribute?: string
  providerName?: string
  autoLogin?: boolean
}

/**
 * OIDC Error codes
 */
export type OIDCErrorCode = 'CONFIG_INVALID'

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
  'issuer' | 'clientId' | 'clientSecret' | 'redirectUri'
> = {
  enabled: false,
  scope: 'openid email profile',
  defaultPermission: 'readonly',
  autoCreateUsers: true,
  providerName: 'SSO Login',
  autoLogin: false
}
