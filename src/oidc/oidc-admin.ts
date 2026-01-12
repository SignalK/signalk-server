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

import { Request, Response, IRouter } from 'express'
import { OIDCError, PartialOIDCConfig } from './types'
import { parseEnvConfig, validateOIDCConfig, mergeConfigs } from './config'
import { getDiscoveryDocument } from './discovery'

const SERVERROUTESPREFIX = '/skServer'

/**
 * Security configuration structure (subset needed for OIDC admin)
 */
export interface SecurityConfigForOIDC {
  oidc?: PartialOIDCConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

/**
 * Dependencies injected by serverroutes for OIDC admin endpoints.
 */
export interface OIDCAdminDependencies {
  /** Check if request is authorized for configuration changes */
  allowConfigure: (req: Request) => boolean
  /** Get the current security configuration */
  getSecurityConfig: () => SecurityConfigForOIDC
  /** Save the security configuration */
  saveSecurityConfig: (
    config: SecurityConfigForOIDC,
    callback: (err?: Error | null) => void
  ) => void
  /** Update OIDC config in memory (clears cache so changes take effect immediately) */
  updateOIDCConfig?: (newOidcConfig: PartialOIDCConfig) => void
}

/**
 * Admin response structure for GET /security/oidc
 * Includes UI metadata like envOverrides and clientSecretSet
 */
interface OIDCAdminResponse {
  enabled: boolean
  issuer: string
  clientId: string
  clientSecret: string // Always empty (redacted)
  clientSecretSet: boolean
  redirectUri: string
  scope: string
  defaultPermission: string
  autoCreateUsers: boolean
  adminGroups: string[]
  readwriteGroups: string[]
  groupsAttribute: string
  providerName: string
  autoLogin: boolean
  envOverrides: Record<string, boolean>
}

/**
 * Build the admin response for GET /security/oidc
 * Reuses mergeConfigs() logic and adds UI metadata (envOverrides, clientSecretSet)
 */
function buildOIDCAdminResponse(
  securityConfig: SecurityConfigForOIDC
): OIDCAdminResponse {
  const oidcConfig = securityConfig.oidc || {}
  const envConfig = parseEnvConfig()

  // Build envOverrides to indicate which fields come from environment variables
  const envOverrides: Record<string, boolean> = {}
  const envFields: (keyof PartialOIDCConfig)[] = [
    'enabled',
    'issuer',
    'clientId',
    'clientSecret',
    'redirectUri',
    'scope',
    'defaultPermission',
    'autoCreateUsers',
    'adminGroups',
    'readwriteGroups',
    'groupsAttribute',
    'providerName',
    'autoLogin'
  ]

  envFields.forEach((field) => {
    if (envConfig[field] !== undefined) {
      envOverrides[field] = true
    }
  })

  // Use mergeConfigs to get the merged configuration (DRY)
  const merged = mergeConfigs(oidcConfig, envConfig)

  // Build response with redacted secret and UI metadata
  return {
    enabled: merged.enabled,
    issuer: merged.issuer,
    clientId: merged.clientId,
    clientSecret: '', // Never send the actual secret
    clientSecretSet: !!(envConfig.clientSecret || oidcConfig.clientSecret),
    redirectUri: merged.redirectUri ?? '',
    scope: merged.scope,
    defaultPermission: merged.defaultPermission,
    autoCreateUsers: merged.autoCreateUsers,
    adminGroups: merged.adminGroups ?? [],
    readwriteGroups: merged.readwriteGroups ?? [],
    groupsAttribute: merged.groupsAttribute ?? 'groups',
    providerName: merged.providerName,
    autoLogin: merged.autoLogin,
    envOverrides
  }
}

/**
 * Helper to check authorization and send 401 if not allowed
 */
function checkAllowConfigure(
  req: Request,
  res: Response,
  deps: OIDCAdminDependencies
): boolean {
  if (deps.allowConfigure(req)) {
    return true
  }
  res.status(401).json('Security config not allowed')
  return false
}

/**
 * Parse groups from comma-separated string if provided that way
 */
function parseGroupsIfString(groups: unknown): string[] | undefined {
  if (typeof groups === 'string' && groups) {
    return groups
      .split(',')
      .map((g) => g.trim())
      .filter((g) => g.length > 0)
  }
  if (Array.isArray(groups)) {
    return groups as string[]
  }
  return undefined
}

/**
 * Register OIDC admin routes for configuration management.
 * These endpoints are separate from the auth flow routes in oidc-auth.ts.
 */
export function registerOIDCAdminRoutes(
  app: IRouter,
  deps: OIDCAdminDependencies
): void {
  /**
   * Get current OIDC configuration
   * Returns config with secrets redacted and env override indicators
   */
  app.get(
    `${SERVERROUTESPREFIX}/security/oidc`,
    (req: Request, res: Response) => {
      if (!checkAllowConfigure(req, res, deps)) {
        return
      }

      const config = deps.getSecurityConfig()
      const response = buildOIDCAdminResponse(config)
      res.json(response)
    }
  )

  /**
   * Update OIDC configuration
   * Validates config and saves to security.json
   */
  app.put(
    `${SERVERROUTESPREFIX}/security/oidc`,
    (req: Request, res: Response) => {
      if (!checkAllowConfigure(req, res, deps)) {
        return
      }

      const config = deps.getSecurityConfig()
      const newOidcConfig = { ...req.body }

      // Parse groups from comma-separated string if provided that way
      const adminGroups = parseGroupsIfString(newOidcConfig.adminGroups)
      if (adminGroups !== undefined) {
        newOidcConfig.adminGroups = adminGroups
      }
      const readwriteGroups = parseGroupsIfString(newOidcConfig.readwriteGroups)
      if (readwriteGroups !== undefined) {
        newOidcConfig.readwriteGroups = readwriteGroups
      }

      // Preserve existing client secret if new one is empty
      if (!newOidcConfig.clientSecret && config.oidc?.clientSecret) {
        newOidcConfig.clientSecret = config.oidc.clientSecret
      }

      // Validate the configuration
      try {
        validateOIDCConfig(newOidcConfig)
      } catch (err) {
        if (err instanceof OIDCError) {
          res.status(400).json({ error: err.message })
          return
        }
        throw err
      }

      // Update the config
      config.oidc = newOidcConfig

      deps.saveSecurityConfig(config, (err) => {
        if (err) {
          console.log(err)
          res.status(500).json({ error: 'Unable to save OIDC configuration' })
          return
        }
        // Update in-memory config so changes take effect immediately
        if (deps.updateOIDCConfig) {
          deps.updateOIDCConfig(newOidcConfig)
        }
        res.json({ message: 'OIDC configuration saved' })
      })
    }
  )

  /**
   * Test OIDC connection by fetching the discovery document
   */
  app.post(
    `${SERVERROUTESPREFIX}/security/oidc/test`,
    async (req: Request, res: Response) => {
      if (!checkAllowConfigure(req, res, deps)) {
        return
      }

      const { issuer } = req.body

      if (!issuer) {
        res.status(400).json({ error: 'Issuer URL is required' })
        return
      }

      // Validate issuer is a valid URL
      try {
        new URL(issuer)
      } catch {
        res.status(400).json({ error: 'Invalid issuer URL format' })
        return
      }

      try {
        const metadata = await getDiscoveryDocument(issuer)
        res.json({
          success: true,
          issuer: metadata.issuer,
          authorization_endpoint: metadata.authorization_endpoint,
          token_endpoint: metadata.token_endpoint,
          userinfo_endpoint: metadata.userinfo_endpoint,
          jwks_uri: metadata.jwks_uri
        })
      } catch (err) {
        console.error('OIDC connection test failed:', err)
        res.status(502).json({
          error:
            err instanceof Error
              ? err.message
              : 'Failed to fetch OIDC discovery document'
        })
      }
    }
  )
}
