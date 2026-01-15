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

import { OIDCAuthState, OIDCConfig, OIDCProviderMetadata } from './types'
import { calculateCodeChallenge } from './pkce'

/**
 * Build the authorization URL for the OIDC flow
 * @param config OIDC configuration
 * @param metadata Discovery document metadata
 * @param authState The auth state containing state, nonce, code verifier
 * @returns The authorization URL to redirect the user to
 */
export function buildAuthorizationUrl(
  config: OIDCConfig,
  metadata: OIDCProviderMetadata,
  authState: OIDCAuthState
): string {
  const url = new URL(metadata.authorization_endpoint)

  // Required OAuth 2.0 parameters
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', authState.redirectUri)
  url.searchParams.set('scope', config.scope)

  // State for CSRF protection
  url.searchParams.set('state', authState.state)

  // Nonce for ID token replay protection
  url.searchParams.set('nonce', authState.nonce)

  // PKCE parameters (S256 method)
  url.searchParams.set(
    'code_challenge',
    calculateCodeChallenge(authState.codeVerifier)
  )
  url.searchParams.set('code_challenge_method', 'S256')

  return url.toString()
}
