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
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash
} from 'crypto'
import { OIDCAuthState, OIDCError, STATE_MAX_AGE_MS } from './types'
import { generateCodeVerifier } from './pkce'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * Generate a cryptographically random state parameter
 * Used for CSRF protection in OAuth2 flows
 */
export function generateState(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Generate a cryptographically random nonce
 * Used for ID token replay protection
 */
export function generateNonce(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Create a complete auth state object for the OIDC flow
 */
export function createAuthState(
  redirectUri: string,
  originalUrl: string
): OIDCAuthState {
  return {
    state: generateState(),
    codeVerifier: generateCodeVerifier(),
    nonce: generateNonce(),
    redirectUri,
    originalUrl,
    createdAt: Date.now()
  }
}

/**
 * Validate that the returned state matches the stored state
 * and that the state hasn't expired
 */
export function validateState(
  returnedState: string,
  storedState: OIDCAuthState
): void {
  if (returnedState !== storedState.state) {
    throw new OIDCError(
      'State mismatch - possible CSRF attack',
      'INVALID_STATE'
    )
  }

  const age = Date.now() - storedState.createdAt
  if (age > STATE_MAX_AGE_MS) {
    throw new OIDCError(
      `State expired (${Math.round(age / 1000)}s old, max ${STATE_MAX_AGE_MS / 1000}s)`,
      'STATE_EXPIRED'
    )
  }
}

/**
 * Derive a 32-byte encryption key from the secret key
 */
function deriveKey(secretKey: string): Buffer {
  return createHash('sha256').update(secretKey).digest()
}

/**
 * Encrypt the auth state for storage in a cookie
 * Uses AES-256-GCM for authenticated encryption
 */
export function encryptState(state: OIDCAuthState, secretKey: string): string {
  const key = deriveKey(secretKey)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const plaintext = JSON.stringify(state)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()

  // Combine IV + authTag + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted])
  return combined.toString('base64url')
}

/**
 * Decrypt the auth state from a cookie
 */
export function decryptState(
  encryptedState: string,
  secretKey: string
): OIDCAuthState {
  const key = deriveKey(secretKey)
  const combined = Buffer.from(encryptedState, 'base64url')

  // Extract IV, authTag, and ciphertext
  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ])

  return JSON.parse(decrypted.toString('utf8')) as OIDCAuthState
}
