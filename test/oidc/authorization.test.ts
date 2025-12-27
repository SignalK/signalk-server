import { expect } from 'chai'
import { buildAuthorizationUrl } from '../../src/oidc/authorization'
import {
  OIDCConfig,
  OIDCAuthState,
  OIDCProviderMetadata
} from '../../src/oidc/types'
import { calculateCodeChallenge } from '../../src/oidc/pkce'

describe('Authorization URL', () => {
  const config: OIDCConfig = {
    enabled: true,
    issuer: 'https://auth.example.com',
    clientId: 'signalk-server',
    clientSecret: 'test-secret',
    scope: 'openid email profile',
    defaultPermission: 'readonly',
    autoCreateUsers: true,
    providerName: 'SSO Login',
    autoLogin: false
  }

  const metadata: OIDCProviderMetadata = {
    issuer: 'https://auth.example.com',
    authorization_endpoint: 'https://auth.example.com/authorize',
    token_endpoint: 'https://auth.example.com/token',
    jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256']
  }

  const authState: OIDCAuthState = {
    state: 'test-state-value',
    codeVerifier: 'test-code-verifier-12345678901234567890',
    nonce: 'test-nonce-value',
    redirectUri: 'https://signalk.local:3000/signalk/v1/auth/oidc/callback',
    originalUrl: '/admin',
    createdAt: Date.now()
  }

  describe('buildAuthorizationUrl', () => {
    it('should include required OAuth parameters', () => {
      const url = buildAuthorizationUrl(config, metadata, authState)
      const parsed = new URL(url)

      expect(parsed.origin + parsed.pathname).to.equal(
        'https://auth.example.com/authorize'
      )
      expect(parsed.searchParams.get('response_type')).to.equal('code')
      expect(parsed.searchParams.get('client_id')).to.equal('signalk-server')
      expect(parsed.searchParams.get('redirect_uri')).to.equal(
        'https://signalk.local:3000/signalk/v1/auth/oidc/callback'
      )
    })

    it('should include PKCE code_challenge', () => {
      const url = buildAuthorizationUrl(config, metadata, authState)
      const parsed = new URL(url)

      const expectedChallenge = calculateCodeChallenge(authState.codeVerifier)
      expect(parsed.searchParams.get('code_challenge')).to.equal(
        expectedChallenge
      )
      expect(parsed.searchParams.get('code_challenge_method')).to.equal('S256')
    })

    it('should include state and nonce', () => {
      const url = buildAuthorizationUrl(config, metadata, authState)
      const parsed = new URL(url)

      expect(parsed.searchParams.get('state')).to.equal('test-state-value')
      expect(parsed.searchParams.get('nonce')).to.equal('test-nonce-value')
    })

    it('should URL-encode parameters correctly', () => {
      const stateWithSpecialChars: OIDCAuthState = {
        ...authState,
        redirectUri: 'https://signalk.local:3000/callback?foo=bar&baz=qux'
      }

      const url = buildAuthorizationUrl(config, metadata, stateWithSpecialChars)
      const parsed = new URL(url)

      // URL should be properly encoded
      expect(parsed.searchParams.get('redirect_uri')).to.equal(
        'https://signalk.local:3000/callback?foo=bar&baz=qux'
      )
    })

    it('should use authorization_endpoint from discovery', () => {
      const customMetadata: OIDCProviderMetadata = {
        ...metadata,
        authorization_endpoint: 'https://auth.example.com/oauth2/authorize'
      }

      const url = buildAuthorizationUrl(config, customMetadata, authState)
      const parsed = new URL(url)

      expect(parsed.origin + parsed.pathname).to.equal(
        'https://auth.example.com/oauth2/authorize'
      )
    })

    it('should include configured scope', () => {
      const url = buildAuthorizationUrl(config, metadata, authState)
      const parsed = new URL(url)

      expect(parsed.searchParams.get('scope')).to.equal('openid email profile')
    })

    it('should handle custom scope', () => {
      const customConfig: OIDCConfig = {
        ...config,
        scope: 'openid email profile groups'
      }

      const url = buildAuthorizationUrl(customConfig, metadata, authState)
      const parsed = new URL(url)

      expect(parsed.searchParams.get('scope')).to.equal(
        'openid email profile groups'
      )
    })
  })
})
