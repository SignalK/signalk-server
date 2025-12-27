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

import {
  OIDCConfig,
  OIDCError,
  OIDC_DEFAULTS,
  PartialOIDCConfig
} from './types'

/**
 * Parse OIDC configuration from environment variables
 */
export function parseEnvConfig(): PartialOIDCConfig {
  const config: PartialOIDCConfig = {}

  if (process.env.SIGNALK_OIDC_ENABLED !== undefined) {
    config.enabled = process.env.SIGNALK_OIDC_ENABLED.toLowerCase() === 'true'
  }

  if (process.env.SIGNALK_OIDC_ISSUER) {
    config.issuer = process.env.SIGNALK_OIDC_ISSUER
  }

  if (process.env.SIGNALK_OIDC_CLIENT_ID) {
    config.clientId = process.env.SIGNALK_OIDC_CLIENT_ID
  }

  if (process.env.SIGNALK_OIDC_CLIENT_SECRET) {
    config.clientSecret = process.env.SIGNALK_OIDC_CLIENT_SECRET
  }

  if (process.env.SIGNALK_OIDC_REDIRECT_URI) {
    config.redirectUri = process.env.SIGNALK_OIDC_REDIRECT_URI
  }

  if (process.env.SIGNALK_OIDC_SCOPE) {
    config.scope = process.env.SIGNALK_OIDC_SCOPE
  }

  if (process.env.SIGNALK_OIDC_DEFAULT_PERMISSION) {
    const perm = process.env.SIGNALK_OIDC_DEFAULT_PERMISSION.toLowerCase()
    if (perm === 'readonly' || perm === 'readwrite' || perm === 'admin') {
      config.defaultPermission = perm
    }
  }

  if (process.env.SIGNALK_OIDC_AUTO_CREATE_USERS !== undefined) {
    config.autoCreateUsers =
      process.env.SIGNALK_OIDC_AUTO_CREATE_USERS.toLowerCase() === 'true'
  }

  // Parse admin groups from comma-separated string
  if (process.env.SIGNALK_OIDC_ADMIN_GROUPS) {
    const groups = process.env.SIGNALK_OIDC_ADMIN_GROUPS.split(',')
      .map((g) => g.trim())
      .filter((g) => g.length > 0)
    if (groups.length > 0) {
      config.adminGroups = groups
    }
  }

  // Parse readwrite groups from comma-separated string
  if (process.env.SIGNALK_OIDC_READWRITE_GROUPS) {
    const groups = process.env.SIGNALK_OIDC_READWRITE_GROUPS.split(',')
      .map((g) => g.trim())
      .filter((g) => g.length > 0)
    if (groups.length > 0) {
      config.readwriteGroups = groups
    }
  }

  // Parse groups attribute (ID token claim key for groups)
  if (process.env.SIGNALK_OIDC_GROUPS_ATTRIBUTE) {
    config.groupsAttribute = process.env.SIGNALK_OIDC_GROUPS_ATTRIBUTE
  }

  return config
}

/**
 * Merge configuration from security.json and environment variables
 * Priority: env vars > security.json > defaults
 */
export function mergeConfigs(
  securityJsonConfig: PartialOIDCConfig,
  envConfig: PartialOIDCConfig
): OIDCConfig {
  return {
    enabled:
      envConfig.enabled ?? securityJsonConfig.enabled ?? OIDC_DEFAULTS.enabled,
    issuer: envConfig.issuer ?? securityJsonConfig.issuer ?? '',
    clientId: envConfig.clientId ?? securityJsonConfig.clientId ?? '',
    clientSecret:
      envConfig.clientSecret ?? securityJsonConfig.clientSecret ?? '',
    redirectUri: envConfig.redirectUri ?? securityJsonConfig.redirectUri,
    scope: envConfig.scope ?? securityJsonConfig.scope ?? OIDC_DEFAULTS.scope,
    defaultPermission:
      envConfig.defaultPermission ??
      securityJsonConfig.defaultPermission ??
      OIDC_DEFAULTS.defaultPermission,
    autoCreateUsers:
      envConfig.autoCreateUsers ??
      securityJsonConfig.autoCreateUsers ??
      OIDC_DEFAULTS.autoCreateUsers,
    adminGroups: envConfig.adminGroups ?? securityJsonConfig.adminGroups,
    readwriteGroups:
      envConfig.readwriteGroups ?? securityJsonConfig.readwriteGroups,
    groupsAttribute:
      envConfig.groupsAttribute ?? securityJsonConfig.groupsAttribute
  }
}

/**
 * Validate OIDC configuration
 * @throws OIDCError if configuration is invalid
 */
export function validateOIDCConfig(
  config: Partial<OIDCConfig>
): asserts config is OIDCConfig {
  // If OIDC is disabled, no validation needed
  if (config.enabled === false || config.enabled === undefined) {
    return
  }

  // Validate required fields when enabled
  if (!config.issuer) {
    throw new OIDCError(
      'OIDC issuer is required when enabled',
      'CONFIG_INVALID'
    )
  }

  if (!config.clientId) {
    throw new OIDCError(
      'OIDC clientId is required when enabled',
      'CONFIG_INVALID'
    )
  }

  if (!config.clientSecret) {
    throw new OIDCError(
      'OIDC clientSecret is required when enabled',
      'CONFIG_INVALID'
    )
  }

  // Validate issuer is a valid URL
  try {
    new URL(config.issuer)
  } catch {
    throw new OIDCError(
      `OIDC issuer must be a valid URL: ${config.issuer}`,
      'CONFIG_INVALID'
    )
  }

  // Validate scope contains 'openid'
  if (config.scope && !config.scope.split(' ').includes('openid')) {
    throw new OIDCError('OIDC scope must contain "openid"', 'CONFIG_INVALID')
  }

  // Validate defaultPermission
  if (
    config.defaultPermission &&
    !['readonly', 'readwrite', 'admin'].includes(config.defaultPermission)
  ) {
    throw new OIDCError(
      `OIDC defaultPermission must be one of: readonly, readwrite, admin`,
      'CONFIG_INVALID'
    )
  }
}

/**
 * Parse OIDC configuration from security.json and environment variables
 * @param securityConfig The security configuration object (may contain oidc section)
 * @returns Complete OIDC configuration
 * @throws OIDCError if configuration is invalid
 */
export function parseOIDCConfig(securityConfig: {
  oidc?: PartialOIDCConfig
}): OIDCConfig {
  const securityJsonConfig = securityConfig.oidc ?? {}
  const envConfig = parseEnvConfig()
  const merged = mergeConfigs(securityJsonConfig, envConfig)

  validateOIDCConfig(merged)

  return merged
}

/**
 * Check if OIDC is enabled
 */
export function isOIDCEnabled(config: OIDCConfig): boolean {
  return config.enabled === true
}
