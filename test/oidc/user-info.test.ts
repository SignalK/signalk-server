import { expect } from 'chai'
import { extractUserInfo, decodeIdToken } from '../../src/oidc/user-info'
import { OIDCError } from '../../src/oidc/types'

describe('User Info', () => {
  // Helper to create a JWT (unsigned, for testing claims extraction only)
  function createTestJwt(payload: object): string {
    const header = { alg: 'none', typ: 'JWT' }
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
      'base64url'
    )
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url'
    )
    return `${encodedHeader}.${encodedPayload}.`
  }

  describe('decodeIdToken', () => {
    it('should decode a valid JWT payload', () => {
      const payload = {
        sub: 'user123',
        email: 'user@example.com',
        name: 'Test User'
      }
      const token = createTestJwt(payload)
      const decoded = decodeIdToken(token)

      expect(decoded.sub).to.equal('user123')
      expect(decoded.email).to.equal('user@example.com')
      expect(decoded.name).to.equal('Test User')
    })

    it('should throw on invalid token format', () => {
      expect(() => decodeIdToken('not-a-jwt')).to.throw(OIDCError, /Invalid/)
      expect(() => decodeIdToken('only.two')).to.throw(OIDCError, /Invalid/)
    })

    it('should throw on invalid base64', () => {
      expect(() => decodeIdToken('xxx.!!!invalid!!!.zzz')).to.throw(OIDCError)
    })
  })

  describe('extractUserInfo', () => {
    it('should extract sub from ID token', () => {
      const token = createTestJwt({ sub: 'unique-user-id-123' })
      const userInfo = extractUserInfo(token)

      expect(userInfo.sub).to.equal('unique-user-id-123')
    })

    it('should extract email if present', () => {
      const token = createTestJwt({
        sub: 'user123',
        email: 'user@example.com'
      })
      const userInfo = extractUserInfo(token)

      expect(userInfo.email).to.equal('user@example.com')
    })

    it('should extract name/preferred_username', () => {
      const tokenWithName = createTestJwt({
        sub: 'user123',
        name: 'John Doe'
      })
      const userInfo1 = extractUserInfo(tokenWithName)
      expect(userInfo1.name).to.equal('John Doe')

      const tokenWithPreferredUsername = createTestJwt({
        sub: 'user123',
        preferred_username: 'johndoe'
      })
      const userInfo2 = extractUserInfo(tokenWithPreferredUsername)
      expect(userInfo2.preferredUsername).to.equal('johndoe')
    })

    it('should extract groups if present', () => {
      const token = createTestJwt({
        sub: 'user123',
        groups: ['admin', 'users', 'signalk-readwrite']
      })
      const userInfo = extractUserInfo(token)

      expect(userInfo.groups).to.deep.equal([
        'admin',
        'users',
        'signalk-readwrite'
      ])
    })

    it('should handle missing optional claims', () => {
      const token = createTestJwt({ sub: 'user123' })
      const userInfo = extractUserInfo(token)

      expect(userInfo.sub).to.equal('user123')
      expect(userInfo.email).to.equal(undefined)
      expect(userInfo.name).to.equal(undefined)
      expect(userInfo.preferredUsername).to.equal(undefined)
      expect(userInfo.groups).to.equal(undefined)
    })

    it('should throw if sub is missing', () => {
      const token = createTestJwt({ email: 'user@example.com' })

      expect(() => extractUserInfo(token)).to.throw(OIDCError, /sub/)
    })
  })
})
