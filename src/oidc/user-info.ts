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

import { OIDCError, OIDCUserInfo } from './types'

/**
 * Decode the payload of a JWT token (without verification)
 * NOTE: This should only be used for debugging or after the token has been
 * properly validated using validateIdToken(). For production use, always
 * validate the token first using the id-token-validation module.
 */
export function decodeIdToken(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.')
  if (parts.length !== 3) {
    throw new OIDCError(
      'Invalid ID token format - expected 3 parts',
      'INVALID_TOKEN'
    )
  }

  try {
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8')
    return JSON.parse(payload)
  } catch (err) {
    throw new OIDCError(
      'Failed to decode ID token payload',
      'INVALID_TOKEN',
      err instanceof Error ? err : undefined
    )
  }
}

/**
 * Extract user information from an ID token
 * @param idToken The ID token string
 * @returns User information extracted from claims
 * @throws OIDCError if the token is invalid or missing required claims
 */
export function extractUserInfo(idToken: string): OIDCUserInfo {
  const claims = decodeIdToken(idToken)

  if (typeof claims.sub !== 'string' || !claims.sub) {
    throw new OIDCError(
      'ID token missing required "sub" claim',
      'INVALID_TOKEN'
    )
  }

  return {
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    name: typeof claims.name === 'string' ? claims.name : undefined,
    preferredUsername:
      typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : undefined,
    groups: Array.isArray(claims.groups)
      ? (claims.groups as string[])
      : undefined
  }
}
