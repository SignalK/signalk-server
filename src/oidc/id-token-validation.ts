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

import * as jose from 'jose'
import { OIDCConfig, OIDCError, OIDCProviderMetadata } from './types'

/**
 * ID Token claims after validation
 */
export interface ValidatedIdTokenClaims {
  iss: string
  sub: string
  aud: string | string[]
  exp: number
  iat: number
  nonce?: string
  email?: string
  name?: string
  preferred_username?: string
  groups?: string[]
  [key: string]: unknown
}

// Fetch function that can be overridden for testing
type FetchFn = typeof fetch
let fetchFn: FetchFn = fetch

/**
 * Set the fetch function (for testing)
 */
export function setFetchFunction(fn: FetchFn): void {
  fetchFn = fn
}

/**
 * Reset the fetch function to the default
 */
export function resetFetchFunction(): void {
  fetchFn = fetch
}

// JWKS cache
interface JwksCache {
  jwks: jose.JSONWebKeySet
  fetchedAt: number
}

const jwksCache = new Map<string, JwksCache>()
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Clear the JWKS cache
 */
export function clearJwksCache(): void {
  jwksCache.clear()
}

/**
 * Fetch JWKS from the provider
 * @param metadata Provider metadata containing jwks_uri
 * @returns The JWKS
 */
export async function fetchJwks(
  metadata: OIDCProviderMetadata
): Promise<jose.JSONWebKeySet> {
  const cached = jwksCache.get(metadata.jwks_uri)
  if (cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.jwks
  }

  let response: Response
  try {
    response = await fetchFn(metadata.jwks_uri)
  } catch (err) {
    throw new OIDCError(
      `Failed to fetch JWKS from ${metadata.jwks_uri}: ${err}`,
      'DISCOVERY_FAILED',
      err instanceof Error ? err : undefined
    )
  }

  if (!response.ok) {
    throw new OIDCError(
      `JWKS fetch failed with status ${response.status}`,
      'DISCOVERY_FAILED'
    )
  }

  let jwks: jose.JSONWebKeySet
  try {
    jwks = (await response.json()) as jose.JSONWebKeySet
  } catch (err) {
    throw new OIDCError(
      'Failed to parse JWKS as JSON',
      'DISCOVERY_FAILED',
      err instanceof Error ? err : undefined
    )
  }

  // Cache the JWKS
  jwksCache.set(metadata.jwks_uri, {
    jwks,
    fetchedAt: Date.now()
  })

  return jwks
}

/**
 * Validate an ID token according to OIDC spec
 *
 * Validates:
 * - Signature using provider's JWKS
 * - Issuer matches expected issuer
 * - Audience contains client_id
 * - Token is not expired (with 5 min clock skew tolerance)
 * - Nonce matches expected nonce
 *
 * @param idToken The ID token string
 * @param config OIDC configuration
 * @param metadata Provider metadata
 * @param expectedNonce The nonce from the auth state
 * @returns Validated claims from the ID token
 * @throws OIDCError if validation fails
 */
export async function validateIdToken(
  idToken: string,
  config: OIDCConfig,
  metadata: OIDCProviderMetadata,
  expectedNonce: string
): Promise<ValidatedIdTokenClaims> {
  // Fetch JWKS
  const jwks = await fetchJwks(metadata)

  // Create JWKS from the fetched keys
  const keySet = jose.createLocalJWKSet(jwks)

  // Verify the token signature and decode claims
  let payload: jose.JWTPayload
  try {
    const result = await jose.jwtVerify(idToken, keySet, {
      issuer: config.issuer,
      audience: config.clientId,
      clockTolerance: 300 // 5 minutes clock skew tolerance
    })
    payload = result.payload
  } catch (err) {
    if (err instanceof jose.errors.JWTExpired) {
      throw new OIDCError(
        'ID token has expired',
        'INVALID_TOKEN',
        err instanceof Error ? err : undefined
      )
    }
    if (err instanceof jose.errors.JWTClaimValidationFailed) {
      const message = err.message.toLowerCase()
      if (message.includes('iss') || message.includes('issuer')) {
        throw new OIDCError(
          `ID token issuer mismatch: expected ${config.issuer}`,
          'INVALID_TOKEN',
          err
        )
      }
      if (message.includes('aud') || message.includes('audience')) {
        throw new OIDCError(
          `ID token audience mismatch: expected ${config.clientId}`,
          'INVALID_TOKEN',
          err
        )
      }
    }
    throw new OIDCError(
      `ID token validation failed: ${err}`,
      'INVALID_TOKEN',
      err instanceof Error ? err : undefined
    )
  }

  // Validate nonce
  if (payload.nonce !== expectedNonce) {
    throw new OIDCError(
      `ID token nonce mismatch: expected ${expectedNonce}, got ${payload.nonce}`,
      'INVALID_TOKEN'
    )
  }

  // Validate required claims exist
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new OIDCError(
      'ID token missing required "sub" claim',
      'INVALID_TOKEN'
    )
  }

  return payload as unknown as ValidatedIdTokenClaims
}
