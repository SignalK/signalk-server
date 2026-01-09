import { expect } from 'chai'
import {
  generateState,
  generateNonce,
  createAuthState,
  validateState,
  encryptState,
  decryptState
} from '../../src/oidc/state'
import { OIDCError, STATE_MAX_AGE_MS } from '../../src/oidc/types'

describe('State Management', () => {
  const secretKey = '0'.repeat(64) // 256-bit hex key

  describe('generateState', () => {
    it('should generate cryptographically random string', () => {
      const state1 = generateState()
      const state2 = generateState()
      expect(state1).to.not.equal(state2)
    })

    it('should be URL-safe', () => {
      const state = generateState()
      expect(state).to.match(/^[A-Za-z0-9\-_]+$/)
    })

    it('should be at least 32 characters', () => {
      const state = generateState()
      expect(state.length).to.be.at.least(32)
    })
  })

  describe('generateNonce', () => {
    it('should generate cryptographically random string', () => {
      const nonce1 = generateNonce()
      const nonce2 = generateNonce()
      expect(nonce1).to.not.equal(nonce2)
    })

    it('should be URL-safe', () => {
      const nonce = generateNonce()
      expect(nonce).to.match(/^[A-Za-z0-9\-_]+$/)
    })
  })

  describe('createAuthState', () => {
    it('should create complete state object', () => {
      const authState = createAuthState(
        'https://example.com/callback',
        '/admin'
      )

      expect(authState.state).to.be.a('string')
      expect(authState.codeVerifier).to.be.a('string')
      expect(authState.nonce).to.be.a('string')
      expect(authState.redirectUri).to.equal('https://example.com/callback')
      expect(authState.originalUrl).to.equal('/admin')
      expect(authState.createdAt).to.be.a('number')
    })

    it('should include timestamp', () => {
      const before = Date.now()
      const authState = createAuthState('https://example.com/callback', '/')
      const after = Date.now()

      expect(authState.createdAt).to.be.at.least(before)
      expect(authState.createdAt).to.be.at.most(after)
    })

    it('should generate unique state, verifier, nonce', () => {
      const state1 = createAuthState('https://example.com/callback', '/')
      const state2 = createAuthState('https://example.com/callback', '/')

      expect(state1.state).to.not.equal(state2.state)
      expect(state1.codeVerifier).to.not.equal(state2.codeVerifier)
      expect(state1.nonce).to.not.equal(state2.nonce)
    })
  })

  describe('validateState', () => {
    it('should accept valid state', () => {
      const authState = createAuthState('https://example.com/callback', '/')
      expect(() => validateState(authState.state, authState)).to.not.throw()
    })

    it('should reject mismatched state', () => {
      const authState = createAuthState('https://example.com/callback', '/')
      expect(() => validateState('wrong-state', authState)).to.throw(
        OIDCError,
        /mismatch/
      )
    })

    it('should reject expired state (>10 min)', () => {
      const authState = createAuthState('https://example.com/callback', '/')
      // Set createdAt to 11 minutes ago
      authState.createdAt = Date.now() - STATE_MAX_AGE_MS - 60000

      expect(() => validateState(authState.state, authState)).to.throw(
        OIDCError,
        /expired/
      )
    })

    it('should accept state just under expiry limit', () => {
      const authState = createAuthState('https://example.com/callback', '/')
      // Set createdAt to 9 minutes ago (still valid)
      authState.createdAt = Date.now() - STATE_MAX_AGE_MS + 60000

      expect(() => validateState(authState.state, authState)).to.not.throw()
    })
  })

  describe('encryptState/decryptState', () => {
    it('should roundtrip state correctly', () => {
      const authState = createAuthState(
        'https://example.com/callback',
        '/admin'
      )
      const encrypted = encryptState(authState, secretKey)
      const decrypted = decryptState(encrypted, secretKey)

      expect(decrypted.state).to.equal(authState.state)
      expect(decrypted.codeVerifier).to.equal(authState.codeVerifier)
      expect(decrypted.nonce).to.equal(authState.nonce)
      expect(decrypted.redirectUri).to.equal(authState.redirectUri)
      expect(decrypted.originalUrl).to.equal(authState.originalUrl)
      expect(decrypted.createdAt).to.equal(authState.createdAt)
    })

    it('should fail on tampering', () => {
      const authState = createAuthState('https://example.com/callback', '/')
      const encrypted = encryptState(authState, secretKey)

      // Tamper with encrypted data
      const tamperedChars = encrypted.split('')
      tamperedChars[20] = tamperedChars[20] === 'a' ? 'b' : 'a'
      const tampered = tamperedChars.join('')

      expect(() => decryptState(tampered, secretKey)).to.throw()
    })

    it('should fail with wrong key', () => {
      const authState = createAuthState('https://example.com/callback', '/')
      const encrypted = encryptState(authState, secretKey)
      const wrongKey = '1'.repeat(64)

      expect(() => decryptState(encrypted, wrongKey)).to.throw()
    })

    it('should produce different ciphertext each time (IV randomness)', () => {
      const authState = createAuthState('https://example.com/callback', '/')
      const encrypted1 = encryptState(authState, secretKey)
      const encrypted2 = encryptState(authState, secretKey)

      expect(encrypted1).to.not.equal(encrypted2)
    })
  })
})
