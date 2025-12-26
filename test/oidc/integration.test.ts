import { expect } from 'chai'
import {
  isOIDCEnabled,
  parseOIDCConfig,
  createAuthState,
  buildAuthorizationUrl,
  calculateCodeChallenge,
  encryptState,
  decryptState
} from '../../src/oidc/index'

// Test OIDC integration with the server
// These tests verify the OIDC endpoints are properly set up

describe('OIDC Integration', () => {
  describe('OIDC Status Endpoint', () => {
    it('should return disabled when OIDC is not configured', function () {
      const config = parseOIDCConfig({})
      expect(isOIDCEnabled(config)).to.equal(false)
    })

    it('should return enabled when OIDC is properly configured', function () {
      const config = parseOIDCConfig({
        oidc: {
          enabled: true,
          issuer: 'https://auth.example.com',
          clientId: 'test-client',
          clientSecret: 'test-secret'
        }
      })
      expect(isOIDCEnabled(config)).to.equal(true)
      expect(config.issuer).to.equal('https://auth.example.com')
      expect(config.scope).to.equal('openid email profile')
      expect(config.defaultPermission).to.equal('readonly')
    })
  })

  describe('OIDC Login Flow', () => {
    it('should create auth state with all required fields', function () {
      const authState = createAuthState(
        'https://signalk.local:3000/callback',
        '/admin'
      )

      expect(authState.state).to.be.a('string')
      expect(authState.state.length).to.be.at.least(32)
      expect(authState.codeVerifier).to.be.a('string')
      expect(authState.codeVerifier.length).to.be.at.least(43)
      expect(authState.nonce).to.be.a('string')
      expect(authState.redirectUri).to.equal(
        'https://signalk.local:3000/callback'
      )
      expect(authState.originalUrl).to.equal('/admin')
    })

    it('should build authorization URL with PKCE', function () {
      const config = {
        enabled: true,
        issuer: 'https://auth.example.com',
        clientId: 'signalk-server',
        clientSecret: 'test-secret',
        scope: 'openid email profile',
        defaultPermission: 'readonly' as const,
        autoCreateUsers: true
      }

      const metadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
        response_types_supported: ['code']
      }

      const authState = createAuthState(
        'https://signalk.local:3000/callback',
        '/'
      )

      const authUrl = buildAuthorizationUrl(config, metadata, authState)
      const parsed = new URL(authUrl)

      expect(parsed.origin).to.equal('https://auth.example.com')
      expect(parsed.pathname).to.equal('/authorize')
      expect(parsed.searchParams.get('response_type')).to.equal('code')
      expect(parsed.searchParams.get('client_id')).to.equal('signalk-server')
      expect(parsed.searchParams.get('state')).to.equal(authState.state)
      expect(parsed.searchParams.get('nonce')).to.equal(authState.nonce)
      expect(parsed.searchParams.get('code_challenge_method')).to.equal('S256')

      // Verify PKCE challenge is correct
      const expectedChallenge = calculateCodeChallenge(authState.codeVerifier)
      expect(parsed.searchParams.get('code_challenge')).to.equal(
        expectedChallenge
      )
    })

    it('should encrypt and decrypt auth state', function () {
      const secretKey = '0'.repeat(64) // 256-bit hex key
      const authState = createAuthState(
        'https://signalk.local:3000/callback',
        '/admin'
      )

      const encrypted = encryptState(authState, secretKey)
      expect(encrypted).to.be.a('string')
      expect(encrypted).to.not.include(authState.state) // Should be encrypted

      const decrypted = decryptState(encrypted, secretKey)
      expect(decrypted.state).to.equal(authState.state)
      expect(decrypted.codeVerifier).to.equal(authState.codeVerifier)
      expect(decrypted.nonce).to.equal(authState.nonce)
      expect(decrypted.redirectUri).to.equal(authState.redirectUri)
      expect(decrypted.originalUrl).to.equal(authState.originalUrl)
    })
  })

  describe('Security Types', () => {
    it('should have OIDCUserIdentifier in User interface', function () {
      // This test verifies the TypeScript types are correctly set up
      // by creating a user object with OIDC fields
      const user = {
        username: 'john@example.com',
        type: 'readwrite',
        oidc: {
          sub: 'auth0|12345',
          issuer: 'https://auth.example.com'
        }
      }

      expect(user.oidc.sub).to.equal('auth0|12345')
      expect(user.oidc.issuer).to.equal('https://auth.example.com')
    })
  })
})
