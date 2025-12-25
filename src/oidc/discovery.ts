/*
 * Copyright 2024 Matti Airas
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

import { DiscoveryCache, OIDCError, OIDCProviderMetadata } from './types'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

// In-memory cache for discovery documents
const discoveryCache = new Map<string, DiscoveryCache>()

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

/**
 * Fetch the OpenID Connect discovery document from an issuer
 * @param issuer The OIDC issuer URL
 * @returns The parsed discovery document
 * @throws OIDCError if fetch fails or document is invalid
 */
export async function fetchDiscoveryDocument(
  issuer: string
): Promise<OIDCProviderMetadata> {
  const discoveryUrl = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`

  let response: Response
  try {
    response = await fetchFn(discoveryUrl)
  } catch (err) {
    throw new OIDCError(
      `Failed to fetch OIDC discovery document from ${discoveryUrl}: ${err}`,
      'DISCOVERY_FAILED',
      err instanceof Error ? err : undefined
    )
  }

  if (!response.ok) {
    throw new OIDCError(
      `OIDC discovery document request failed with status ${response.status}`,
      'DISCOVERY_FAILED'
    )
  }

  let metadata: OIDCProviderMetadata
  try {
    metadata = (await response.json()) as OIDCProviderMetadata
  } catch (err) {
    throw new OIDCError(
      'Failed to parse OIDC discovery document as JSON',
      'DISCOVERY_FAILED',
      err instanceof Error ? err : undefined
    )
  }

  // Validate required fields
  if (
    !metadata.issuer ||
    !metadata.authorization_endpoint ||
    !metadata.token_endpoint ||
    !metadata.jwks_uri
  ) {
    throw new OIDCError(
      'OIDC discovery document is missing required fields',
      'DISCOVERY_FAILED'
    )
  }

  return metadata
}

/**
 * Get the discovery document for an issuer, using cache if available
 * @param issuer The OIDC issuer URL
 * @returns The discovery document
 */
export async function getDiscoveryDocument(
  issuer: string
): Promise<OIDCProviderMetadata> {
  const cached = discoveryCache.get(issuer)
  const now = Date.now()

  if (cached && cached.expiresAt > now) {
    return cached.metadata
  }

  const metadata = await fetchDiscoveryDocument(issuer)

  discoveryCache.set(issuer, {
    metadata,
    fetchedAt: now,
    expiresAt: now + CACHE_TTL_MS
  })

  return metadata
}

/**
 * Clear the discovery document cache
 * Useful for testing and when re-configuring OIDC
 */
export function clearDiscoveryCache(): void {
  discoveryCache.clear()
}
