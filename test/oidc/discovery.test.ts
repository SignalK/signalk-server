import { expect } from 'chai'
import {
  fetchDiscoveryDocument,
  getDiscoveryDocument,
  clearDiscoveryCache,
  setFetchFunction,
  resetFetchFunction
} from '../../src/oidc/discovery'
import { OIDCError } from '../../src/oidc/types'

describe('Discovery', () => {
  const issuer = 'https://auth.example.com'
  const discoveryDoc = {
    issuer: 'https://auth.example.com',
    authorization_endpoint: 'https://auth.example.com/authorize',
    token_endpoint: 'https://auth.example.com/token',
    userinfo_endpoint: 'https://auth.example.com/userinfo',
    jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256']
  }

  // Helper to create a mock fetch function
  function createMockFetch(
    responses: Map<string, { status: number; body: unknown; error?: Error }>
  ) {
    return async (url: string | URL | Request): Promise<Response> => {
      const urlStr = url.toString()
      const response = responses.get(urlStr)

      if (!response) {
        throw new Error(`No mock response for ${urlStr}`)
      }

      if (response.error) {
        throw response.error
      }

      return new Response(
        typeof response.body === 'string'
          ? response.body
          : JSON.stringify(response.body),
        { status: response.status }
      )
    }
  }

  beforeEach(() => {
    clearDiscoveryCache()
    resetFetchFunction()
  })

  afterEach(() => {
    resetFetchFunction()
  })

  describe('fetchDiscoveryDocument', () => {
    it('should fetch discovery document from issuer', async () => {
      const responses = new Map([
        [
          `${issuer}/.well-known/openid-configuration`,
          { status: 200, body: discoveryDoc }
        ]
      ])
      setFetchFunction(createMockFetch(responses))

      const result = await fetchDiscoveryDocument(issuer)

      expect(result.issuer).to.equal(issuer)
      expect(result.authorization_endpoint).to.equal(
        'https://auth.example.com/authorize'
      )
      expect(result.token_endpoint).to.equal('https://auth.example.com/token')
      expect(result.jwks_uri).to.equal(
        'https://auth.example.com/.well-known/jwks.json'
      )
    })

    it('should throw on network error', async () => {
      const responses = new Map([
        [
          `${issuer}/.well-known/openid-configuration`,
          { status: 0, body: null, error: new Error('Connection refused') }
        ]
      ])
      setFetchFunction(createMockFetch(responses))

      try {
        await fetchDiscoveryDocument(issuer)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('DISCOVERY_FAILED')
      }
    })

    it('should throw on non-200 response', async () => {
      const responses = new Map([
        [
          `${issuer}/.well-known/openid-configuration`,
          { status: 404, body: 'Not found' }
        ]
      ])
      setFetchFunction(createMockFetch(responses))

      try {
        await fetchDiscoveryDocument(issuer)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('DISCOVERY_FAILED')
      }
    })

    it('should throw on invalid JSON', async () => {
      const responses = new Map([
        [
          `${issuer}/.well-known/openid-configuration`,
          { status: 200, body: 'not json' }
        ]
      ])
      setFetchFunction(createMockFetch(responses))

      try {
        await fetchDiscoveryDocument(issuer)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('DISCOVERY_FAILED')
      }
    })

    it('should throw if required fields are missing', async () => {
      const incomplete = {
        issuer: 'https://auth.example.com'
        // Missing authorization_endpoint, token_endpoint, jwks_uri
      }

      const responses = new Map([
        [
          `${issuer}/.well-known/openid-configuration`,
          { status: 200, body: incomplete }
        ]
      ])
      setFetchFunction(createMockFetch(responses))

      try {
        await fetchDiscoveryDocument(issuer)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('DISCOVERY_FAILED')
      }
    })
  })

  describe('getDiscoveryDocument (with caching)', () => {
    it('should cache discovery document', async () => {
      let callCount = 0
      const mockFetch = async (): Promise<Response> => {
        callCount++
        return new Response(JSON.stringify(discoveryDoc), { status: 200 })
      }
      setFetchFunction(mockFetch)

      // First call
      const result1 = await getDiscoveryDocument(issuer)
      expect(result1.issuer).to.equal(issuer)
      expect(callCount).to.equal(1)

      // Second call should use cache
      const result2 = await getDiscoveryDocument(issuer)
      expect(result2.issuer).to.equal(issuer)
      expect(callCount).to.equal(1) // Should not have fetched again
    })

    it('should clear cache with clearDiscoveryCache', async () => {
      let callCount = 0
      const mockFetch = async (): Promise<Response> => {
        callCount++
        return new Response(JSON.stringify(discoveryDoc), { status: 200 })
      }
      setFetchFunction(mockFetch)

      // First call
      await getDiscoveryDocument(issuer)
      expect(callCount).to.equal(1)

      // Clear cache
      clearDiscoveryCache()

      // Second call should fetch again
      await getDiscoveryDocument(issuer)
      expect(callCount).to.equal(2)
    })

    it('should handle different issuers separately', async () => {
      const issuer2 = 'https://other.example.com'
      const discoveryDoc2 = {
        ...discoveryDoc,
        issuer: issuer2,
        authorization_endpoint: 'https://other.example.com/authorize',
        token_endpoint: 'https://other.example.com/token',
        jwks_uri: 'https://other.example.com/jwks'
      }

      const mockFetch = async (
        url: string | URL | Request
      ): Promise<Response> => {
        const urlStr = url.toString()
        if (urlStr.includes('other.example.com')) {
          return new Response(JSON.stringify(discoveryDoc2), { status: 200 })
        }
        return new Response(JSON.stringify(discoveryDoc), { status: 200 })
      }
      setFetchFunction(mockFetch)

      const result1 = await getDiscoveryDocument(issuer)
      const result2 = await getDiscoveryDocument(issuer2)

      expect(result1.issuer).to.equal(issuer)
      expect(result2.issuer).to.equal(issuer2)
    })
  })
})
