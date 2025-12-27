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

import { randomBytes, createHash } from 'crypto'

/**
 * Generate a cryptographically random code verifier for PKCE
 * Per RFC 7636, the code verifier must be:
 * - 43-128 characters long
 * - Use only unreserved URI characters: [A-Za-z0-9-._~]
 */
export function generateCodeVerifier(): string {
  // Generate 48 bytes of random data, which will produce 64 base64url chars
  const buffer = randomBytes(48)
  return buffer.toString('base64url').slice(0, 64) // Use 64 characters (within 43-128 range)
}

/**
 * Calculate the code challenge from a code verifier using S256 method
 * Per RFC 7636: code_challenge = BASE64URL(SHA256(code_verifier))
 * @param verifier The code verifier string
 * @returns The code challenge (base64url-encoded SHA256 hash)
 */
export function calculateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}
