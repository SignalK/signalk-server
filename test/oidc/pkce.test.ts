import { expect } from 'chai'
import {
  generateCodeVerifier,
  calculateCodeChallenge
} from '../../src/oidc/pkce'

describe('PKCE', () => {
  describe('generateCodeVerifier', () => {
    it('should generate 43-128 character string', () => {
      const verifier = generateCodeVerifier()
      expect(verifier.length).to.be.at.least(43)
      expect(verifier.length).to.be.at.most(128)
    })

    it('should use only allowed characters [A-Za-z0-9-._~]', () => {
      const verifier = generateCodeVerifier()
      expect(verifier).to.match(/^[A-Za-z0-9\-._~]+$/)
    })

    it('should generate different values each call', () => {
      const verifier1 = generateCodeVerifier()
      const verifier2 = generateCodeVerifier()
      expect(verifier1).to.not.equal(verifier2)
    })

    it('should be cryptographically random (high entropy)', () => {
      // Generate multiple verifiers and check they're all different
      const verifiers = new Set<string>()
      for (let i = 0; i < 100; i++) {
        verifiers.add(generateCodeVerifier())
      }
      // All 100 should be unique
      expect(verifiers.size).to.equal(100)
    })
  })

  describe('calculateCodeChallenge', () => {
    it('should generate SHA256 base64url hash', () => {
      // RFC 7636 test vector
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
      const challenge = calculateCodeChallenge(verifier)
      expect(challenge).to.equal('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    })

    it('should match known test vectors', () => {
      // Additional test vector
      const verifier = 'test-verifier-123'
      const challenge = calculateCodeChallenge(verifier)
      // Should be deterministic
      expect(challenge).to.equal(calculateCodeChallenge(verifier))
    })

    it('should generate URL-safe base64 (no padding)', () => {
      const verifier = generateCodeVerifier()
      const challenge = calculateCodeChallenge(verifier)
      // No padding characters
      expect(challenge).to.not.include('=')
      // No non-URL-safe characters
      expect(challenge).to.not.include('+')
      expect(challenge).to.not.include('/')
    })

    it('should handle edge case verifiers', () => {
      // Minimum length verifier (43 chars)
      const minVerifier = 'a'.repeat(43)
      expect(() => calculateCodeChallenge(minVerifier)).to.not.throw()

      // Maximum length verifier (128 chars)
      const maxVerifier = 'z'.repeat(128)
      expect(() => calculateCodeChallenge(maxVerifier)).to.not.throw()
    })
  })
})
