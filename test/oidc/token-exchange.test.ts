import { expect } from 'chai'
import {
  exchangeAuthorizationCode,
  fetchUserinfo,
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

  describe('fetchUserinfo', () => {
    const issuer = 'https://auth.example.com'

    afterEach(() => {
      resetTokenFetch()
    })

    it('should return undefined when no userinfo_endpoint in metadata', async () => {
      const metadataWithoutUserinfo: OIDCProviderMetadata = {
        ...metadata
        // no userinfo_endpoint
      }

      const result = await fetchUserinfo(
        'access-token',
        metadataWithoutUserinfo,
        issuer
      )

      expect(result).to.equal(undefined)
    })

    it('should fetch and return userinfo claims', async () => {
      const userinfoClaims = {
        sub: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
        groups: ['admin', 'users']
      }

      const mockFetch = async (): Promise<Response> => {
        return new Response(JSON.stringify(userinfoClaims), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      setTokenFetch(mockFetch)

      const metadataWithUserinfo: OIDCProviderMetadata = {
        ...metadata,
        userinfo_endpoint: 'https://auth.example.com/userinfo'
      }

      const result = await fetchUserinfo(
        'access-token',
        metadataWithUserinfo,
        issuer
      )

      expect(result).to.deep.equal(userinfoClaims)
    })

    it('should reject userinfo endpoint with mismatched hostname (security)', async () => {
      // This tests protection against malicious discovery documents
      // that redirect userinfo to an attacker-controlled server
      const metadataWithMaliciousUserinfo: OIDCProviderMetadata = {
        ...metadata,
        userinfo_endpoint: 'https://evil.com/steal-token'
      }

      const result = await fetchUserinfo(
        'access-token',
        metadataWithMaliciousUserinfo,
        issuer
      )

      // Should return undefined instead of making request to evil.com
      expect(result).to.equal(undefined)
    })

    it('should accept userinfo endpoint with matching hostname', async () => {
      const userinfoClaims = { sub: 'user-123', email: 'user@example.com' }

      const mockFetch = async (): Promise<Response> => {
        return new Response(JSON.stringify(userinfoClaims), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      setTokenFetch(mockFetch)

      const metadataWithMatchingHost: OIDCProviderMetadata = {
        ...metadata,
        // Different path but same hostname as issuer
        userinfo_endpoint: 'https://auth.example.com/api/v1/userinfo'
      }

      const result = await fetchUserinfo(
        'access-token',
        metadataWithMatchingHost,
        issuer
      )

      expect(result).to.deep.equal(userinfoClaims)
    })

    it('should return undefined on HTTP error', async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response('Unauthorized', {
          status: 401,
          headers: { 'Content-Type': 'text/plain' }
        })
      }
      setTokenFetch(mockFetch)

      const metadataWithUserinfo: OIDCProviderMetadata = {
        ...metadata,
        userinfo_endpoint: 'https://auth.example.com/userinfo'
      }

      const result = await fetchUserinfo(
        'invalid-token',
        metadataWithUserinfo,
        issuer
      )

      expect(result).to.equal(undefined)
    })

    it('should return undefined on network error', async () => {
      const mockFetch = async (): Promise<Response> => {
        throw new Error('Network error')
      }
      setTokenFetch(mockFetch)

      const metadataWithUserinfo: OIDCProviderMetadata = {
        ...metadata,
        userinfo_endpoint: 'https://auth.example.com/userinfo'
      }

      const result = await fetchUserinfo(
        'access-token',
        metadataWithUserinfo,
        issuer
      )

      expect(result).to.equal(undefined)
    })

    it('should return undefined on invalid JSON response', async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response('not valid json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      setTokenFetch(mockFetch)

      const metadataWithUserinfo: OIDCProviderMetadata = {
        ...metadata,
        userinfo_endpoint: 'https://auth.example.com/userinfo'
      }

      const result = await fetchUserinfo(
        'access-token',
        metadataWithUserinfo,
        issuer
      )

      expect(result).to.equal(undefined)
    })

    it('should send correct Authorization header', async () => {
      let capturedHeaders: HeadersInit | undefined

      const mockFetch = async (
        _url: string | URL | Request,
        init?: RequestInit
      ): Promise<Response> => {
        capturedHeaders = init?.headers
        return new Response(JSON.stringify({ sub: 'user-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      setTokenFetch(mockFetch)

      const metadataWithUserinfo: OIDCProviderMetadata = {
        ...metadata,
        userinfo_endpoint: 'https://auth.example.com/userinfo'
      }

      await fetchUserinfo('my-access-token', metadataWithUserinfo, issuer)

      expect(capturedHeaders).to.deep.include({
        Authorization: 'Bearer my-access-token'
      })
    })
  })
})
