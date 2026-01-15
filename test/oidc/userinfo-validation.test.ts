import { expect } from 'chai'
import { validateAndMergeUserinfoClaims } from '../../dist/oidc/oidc-auth.js'
import { OIDCError } from '../../dist/oidc/types.js'

describe('Userinfo Validation Security', () => {
  describe('validateAndMergeUserinfoClaims', () => {
    it('should throw when userinfo sub does not match ID token sub', () => {
      const idTokenClaims = { sub: 'user-123', iss: 'https://auth.example.com' }
      const userinfoClaims = {
        sub: 'different-user',
        email: 'user@example.com'
      }

      expect(() =>
        validateAndMergeUserinfoClaims(idTokenClaims, userinfoClaims)
      ).to.throw(OIDCError)

      try {
        validateAndMergeUserinfoClaims(idTokenClaims, userinfoClaims)
      } catch (err) {
        expect((err as OIDCError).code).to.equal('INVALID_TOKEN')
        expect((err as OIDCError).message).to.include('sub does not match')
      }
    })

    it('should merge safe claims when sub matches', () => {
      const idTokenClaims: Record<string, unknown> = {
        sub: 'user-123',
        iss: 'https://auth.example.com'
      }
      const userinfoClaims = {
        sub: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
        preferred_username: 'testuser',
        groups: ['admin', 'users']
      }

      validateAndMergeUserinfoClaims(idTokenClaims, userinfoClaims)

      expect(idTokenClaims.email).to.equal('user@example.com')
      expect(idTokenClaims.name).to.equal('Test User')
      expect(idTokenClaims.preferred_username).to.equal('testuser')
      expect(idTokenClaims.groups).to.deep.equal(['admin', 'users'])
    })

    it('should NOT merge security-critical claims from userinfo', () => {
      const idTokenClaims: Record<string, unknown> = {
        sub: 'user-123',
        iss: 'https://auth.example.com',
        aud: 'signalk-server',
        nonce: 'original-nonce'
      }
      const userinfoClaims = {
        sub: 'user-123',
        iss: 'https://evil.com', // Attacker tries to change issuer
        aud: 'attacker-app', // Attacker tries to change audience
        nonce: 'malicious-nonce', // Attacker tries to change nonce
        email: 'user@example.com'
      }

      validateAndMergeUserinfoClaims(idTokenClaims, userinfoClaims)

      // Security-critical claims should NOT be overwritten
      expect(idTokenClaims.iss).to.equal('https://auth.example.com')
      expect(idTokenClaims.aud).to.equal('signalk-server')
      expect(idTokenClaims.nonce).to.equal('original-nonce')
      // Safe claims should be merged
      expect(idTokenClaims.email).to.equal('user@example.com')
    })

    it('should accept when userinfo has no sub claim', () => {
      const idTokenClaims: Record<string, unknown> = {
        sub: 'user-123',
        iss: 'https://auth.example.com'
      }
      const userinfoClaims = {
        email: 'user@example.com',
        name: 'Test User'
        // no sub claim
      }

      // Should not throw
      validateAndMergeUserinfoClaims(idTokenClaims, userinfoClaims)

      expect(idTokenClaims.email).to.equal('user@example.com')
      expect(idTokenClaims.name).to.equal('Test User')
    })

    it('should merge custom groups attribute', () => {
      const idTokenClaims: Record<string, unknown> = { sub: 'user-123' }
      const userinfoClaims = {
        sub: 'user-123',
        roles: ['admin', 'editor'] // Custom groups attribute
      }

      validateAndMergeUserinfoClaims(idTokenClaims, userinfoClaims, 'roles')

      expect(idTokenClaims.roles).to.deep.equal(['admin', 'editor'])
    })

    it('should handle undefined claims gracefully', () => {
      const idTokenClaims: Record<string, unknown> = { sub: 'user-123' }
      const userinfoClaims = {
        sub: 'user-123'
        // no email, name, groups, etc.
      }

      // Should not throw
      validateAndMergeUserinfoClaims(idTokenClaims, userinfoClaims)

      expect(idTokenClaims.email).to.equal(undefined)
      expect(idTokenClaims.name).to.equal(undefined)
    })
  })
})
