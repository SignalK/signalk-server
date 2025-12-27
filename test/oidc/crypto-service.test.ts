import { expect } from 'chai'
import { createHash } from 'crypto'
import { createAuthState, encryptState, decryptState } from '../../src/oidc/state'

/**
 * Tests for the OIDC crypto service pattern.
 *
 * The key security property: OIDC module receives only a derived secret,
 * never the master JWT signing key. tokensecurity knows nothing about
 * OIDC state structure - it just provides a secret derivation function.
 */
describe('OIDC Crypto Service', () => {
  const masterSecretKey = '0'.repeat(64) // Simulates the JWT signing secret
  const differentSecretKey = '1'.repeat(64)

  /**
   * This function will be implemented in tokensecurity.
   * It derives a domain-specific secret from the master key.
   */
  function deriveSecret(masterKey: string, domain: string): string {
    return createHash('sha256')
      .update(masterKey)
      .update(domain)
      .digest('hex')
  }

  describe('deriveSecret', () => {
    it('should derive a different key than the original', () => {
      const derived = deriveSecret(masterSecretKey, 'signalk-oidc')
      expect(derived).to.not.equal(masterSecretKey)
    })

    it('should be deterministic (same inputs = same output)', () => {
      const derived1 = deriveSecret(masterSecretKey, 'signalk-oidc')
      const derived2 = deriveSecret(masterSecretKey, 'signalk-oidc')
      expect(derived1).to.equal(derived2)
    })

    it('should produce different outputs for different master keys', () => {
      const derived1 = deriveSecret(masterSecretKey, 'signalk-oidc')
      const derived2 = deriveSecret(differentSecretKey, 'signalk-oidc')
      expect(derived1).to.not.equal(derived2)
    })

    it('should produce different outputs for different domains', () => {
      const oidcSecret = deriveSecret(masterSecretKey, 'signalk-oidc')
      const otherSecret = deriveSecret(masterSecretKey, 'signalk-other')
      expect(oidcSecret).to.not.equal(otherSecret)
    })

    it('should produce a 64-character hex string (256 bits)', () => {
      const derived = deriveSecret(masterSecretKey, 'signalk-oidc')
      expect(derived).to.have.length(64)
      expect(derived).to.match(/^[0-9a-f]+$/)
    })
  })

  describe('OIDC state encryption with derived secret', () => {
    // This simulates what OIDC module does - it gets the secret and handles encryption itself
    const oidcSecret = deriveSecret(masterSecretKey, 'signalk-oidc')

    it('should roundtrip state correctly using derived secret', () => {
      const authState = createAuthState('https://example.com/callback', '/admin')
      const encrypted = encryptState(authState, oidcSecret)
      const decrypted = decryptState(encrypted, oidcSecret)

      expect(decrypted.state).to.equal(authState.state)
      expect(decrypted.codeVerifier).to.equal(authState.codeVerifier)
      expect(decrypted.nonce).to.equal(authState.nonce)
      expect(decrypted.redirectUri).to.equal(authState.redirectUri)
      expect(decrypted.originalUrl).to.equal(authState.originalUrl)
    })

    it('should NOT be decryptable with the master secret', () => {
      const authState = createAuthState('https://example.com/callback', '/')
      const encrypted = encryptState(authState, oidcSecret)

      // This is the key security property
      expect(() => decryptState(encrypted, masterSecretKey)).to.throw()
    })

    it('should NOT be decryptable with a different derived secret', () => {
      const authState = createAuthState('https://example.com/callback', '/')
      const encrypted = encryptState(authState, oidcSecret)
      const wrongSecret = deriveSecret(differentSecretKey, 'signalk-oidc')

      expect(() => decryptState(encrypted, wrongSecret)).to.throw()
    })
  })

  describe('Security properties', () => {
    it('attacker with OIDC secret cannot forge JWTs', () => {
      const oidcSecret = deriveSecret(masterSecretKey, 'signalk-oidc')

      // The derived secret is cryptographically different from master
      expect(oidcSecret).to.not.equal(masterSecretKey)

      // SHA-256 is one-way - cannot reverse to get master key
      // (This is a cryptographic property we document, not directly testable)
    })

    it('derived secret changes when master secret rotates', () => {
      const derived1 = deriveSecret(masterSecretKey, 'signalk-oidc')
      const derived2 = deriveSecret(differentSecretKey, 'signalk-oidc')

      expect(derived1).to.not.equal(derived2)
      // This means pending OIDC logins invalidate on key rotation (correct)
    })
  })
})
