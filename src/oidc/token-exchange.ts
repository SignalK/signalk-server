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
  OIDCAuthState,
  OIDCConfig,
  OIDCError,
  OIDCProviderMetadata,
  OIDCTokens
} from './types'

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
 * Exchange an authorization code for tokens
 * @param code The authorization code from the callback
 * @param config OIDC configuration
 * @param metadata Discovery document metadata
 * @param authState The auth state containing code verifier
 * @returns The token response
 * @throws OIDCError if the exchange fails
 */
export async function exchangeAuthorizationCode(
  code: string,
  config: OIDCConfig,
  metadata: OIDCProviderMetadata,
  authState: OIDCAuthState
): Promise<OIDCTokens> {
  const params = new URLSearchParams()
  params.set('grant_type', 'authorization_code')
  params.set('code', code)
  params.set('redirect_uri', authState.redirectUri)
  params.set('client_id', config.clientId)
  params.set('client_secret', config.clientSecret)
  params.set('code_verifier', authState.codeVerifier)

  let response: Response
  try {
    response = await fetchFn(metadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    })
  } catch (err) {
    throw new OIDCError(
      `Token exchange request failed: ${err}`,
      'TOKEN_EXCHANGE_FAILED',
      err instanceof Error ? err : undefined
    )
  }

  let body: {
    access_token?: string
    id_token?: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
    error?: string
    error_description?: string
  }
  try {
    body = (await response.json()) as typeof body
  } catch (err) {
    throw new OIDCError(
      'Failed to parse token response as JSON',
      'TOKEN_EXCHANGE_FAILED',
      err instanceof Error ? err : undefined
    )
  }

  if (!response.ok) {
    const errorMessage = body.error_description || body.error || 'Unknown error'
    throw new OIDCError(
      `Token exchange failed: ${body.error} - ${errorMessage}`,
      'TOKEN_EXCHANGE_FAILED'
    )
  }

  // Validate response structure
  if (!body.access_token || !body.id_token) {
    throw new OIDCError(
      'Token response missing required fields (access_token, id_token)',
      'TOKEN_EXCHANGE_FAILED'
    )
  }

  return {
    accessToken: body.access_token,
    idToken: body.id_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in,
    tokenType: body.token_type || 'Bearer'
  }
}

/**
 * Fetch additional claims from the userinfo endpoint
 *
 * The ID token typically only contains minimal claims (sub, iss, aud, etc.).
 * Claims like groups, email, name are returned via the userinfo endpoint.
 *
 * @param accessToken The access token from the token response
 * @param metadata Discovery document metadata containing userinfo_endpoint
 * @returns Additional claims from the userinfo endpoint, or undefined if unavailable
 */
export async function fetchUserinfo(
  accessToken: string,
  metadata: OIDCProviderMetadata
): Promise<Record<string, unknown> | undefined> {
  // Not all providers have a userinfo endpoint
  if (!metadata.userinfo_endpoint) {
    return undefined
  }

  let response: Response
  try {
    response = await fetchFn(metadata.userinfo_endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })
  } catch (err) {
    // Non-fatal: continue with ID token claims only
    console.warn(
      `OIDC: Failed to fetch userinfo: ${err instanceof Error ? err.message : err}`
    )
    return undefined
  }

  if (!response.ok) {
    console.warn(
      `OIDC: Userinfo request failed with status ${response.status}`
    )
    return undefined
  }

  try {
    return (await response.json()) as Record<string, unknown>
  } catch (err) {
    console.warn(
      `OIDC: Failed to parse userinfo response: ${err instanceof Error ? err.message : err}`
    )
    return undefined
  }
}
