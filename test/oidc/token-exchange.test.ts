import { expect } from 'chai'
import {
  exchangeAuthorizationCode,
  setFetchFunction as setTokenFetch,
  resetFetchFunction as resetTokenFetch
} from '../../src/oidc/token-exchange'
import {
  OIDCConfig,
  OIDCAuthState,
  OIDCProviderMetadata,
  OIDCError
} from '../../src/oidc/types'

describe('Token Exchange', () => {
  const config: OIDCConfig = {
    enabled: true,
    issuer: 'https://auth.example.com',
    clientId: 'signalk-server',
    clientSecret: 'test-secret',
    scope: 'openid email profile',
    defaultPermission: 'readonly',
    autoCreateUsers: true
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

  const validTokenResponse = {
    access_token: 'access-token-value',
    id_token: 'id-token-value',
    token_type: 'Bearer',
    expires_in: 3600
  }

  afterEach(() => {
    resetTokenFetch()
  })

  describe('exchangeAuthorizationCode', () => {
    it('should send correct POST request to token endpoint', async () => {
      let capturedUrl: string | undefined
      let capturedInit: RequestInit | undefined

      const mockFetch = async (
        url: string | URL | Request,
        init?: RequestInit
      ): Promise<Response> => {
        capturedUrl = url.toString()
        capturedInit = init
        return new Response(JSON.stringify(validTokenResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      setTokenFetch(mockFetch)

      await exchangeAuthorizationCode(
        'auth-code-123',
        config,
        metadata,
        authState
      )

      expect(capturedUrl).to.equal('https://auth.example.com/token')
      expect(capturedInit?.method).to.equal('POST')
      expect(capturedInit?.headers).to.include({
        'Content-Type': 'application/x-www-form-urlencoded'
      })
    })

    it('should include code_verifier for PKCE', async () => {
      let capturedBody: string | undefined

      const mockFetch = async (
        _url: string | URL | Request,
        init?: RequestInit
      ): Promise<Response> => {
        capturedBody = init?.body as string
        return new Response(JSON.stringify(validTokenResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      setTokenFetch(mockFetch)

      await exchangeAuthorizationCode(
        'auth-code-123',
        config,
        metadata,
        authState
      )

      const params = new URLSearchParams(capturedBody)
      expect(params.get('code_verifier')).to.equal(authState.codeVerifier)
      expect(params.get('code')).to.equal('auth-code-123')
      expect(params.get('grant_type')).to.equal('authorization_code')
      expect(params.get('client_id')).to.equal('signalk-server')
      expect(params.get('client_secret')).to.equal('test-secret')
      expect(params.get('redirect_uri')).to.equal(authState.redirectUri)
    })

    it('should handle successful response', async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response(JSON.stringify(validTokenResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      setTokenFetch(mockFetch)

      const tokens = await exchangeAuthorizationCode(
        'auth-code-123',
        config,
        metadata,
        authState
      )

      expect(tokens.accessToken).to.equal('access-token-value')
      expect(tokens.idToken).to.equal('id-token-value')
      expect(tokens.tokenType).to.equal('Bearer')
      expect(tokens.expiresIn).to.equal(3600)
    })

    it('should handle error response', async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Authorization code expired'
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
      setTokenFetch(mockFetch)

      try {
        await exchangeAuthorizationCode(
          'auth-code-123',
          config,
          metadata,
          authState
        )
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('TOKEN_EXCHANGE_FAILED')
        expect((err as OIDCError).message).to.include('invalid_grant')
      }
    })

    it('should handle network errors', async () => {
      const mockFetch = async (): Promise<Response> => {
        throw new Error('Network error')
      }
      setTokenFetch(mockFetch)

      try {
        await exchangeAuthorizationCode(
          'auth-code-123',
          config,
          metadata,
          authState
        )
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('TOKEN_EXCHANGE_FAILED')
      }
    })

    it('should validate response structure', async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            // Missing access_token
            id_token: 'id-token-value',
            token_type: 'Bearer'
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
      setTokenFetch(mockFetch)

      try {
        await exchangeAuthorizationCode(
          'auth-code-123',
          config,
          metadata,
          authState
        )
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('TOKEN_EXCHANGE_FAILED')
      }
    })
  })
})
