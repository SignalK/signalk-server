import { expect } from 'chai'
import { webcrypto } from 'crypto'
import {
  validateIdToken,
  fetchJwks,
  clearJwksCache,
  setFetchFunction as setJwksFetch,
  resetFetchFunction as resetJwksFetch,
  JSONWebKeySet
} from '../../src/oidc/id-token-validation'
import {
  OIDCConfig,
  OIDCProviderMetadata,
  OIDCError
} from '../../src/oidc/types'

// Polyfill for Node 18 which doesn't have crypto as a global
if (typeof globalThis.crypto === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).crypto = webcrypto
}

// Dynamic import for jose (ESM-only module)

type JoseModule = typeof import('jose')
let jose: JoseModule

describe('ID Token Validation', () => {
  // Test key pair for signing tokens
  let privateKey: CryptoKey
  let publicKey: CryptoKey
  let jwks: JSONWebKeySet

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

  before(async () => {
    // Dynamically import jose
    jose = await import('jose')

    // Generate a test key pair
    const keyPair = await jose.generateKeyPair('RS256')
    privateKey = keyPair.privateKey
    publicKey = keyPair.publicKey

    // Export public key as JWK for JWKS endpoint
    const publicJwk = await jose.exportJWK(publicKey)
    publicJwk.kid = 'test-key-1'
    publicJwk.alg = 'RS256'
    publicJwk.use = 'sig'
    // Cast to our JSONWebKeySet type - kty is guaranteed to exist for exported RSA keys
    jwks = { keys: [publicJwk as JSONWebKeySet['keys'][0]] }
  })

  beforeEach(() => {
    clearJwksCache()
    resetJwksFetch()
  })

  afterEach(() => {
    resetJwksFetch()
  })

  // Helper to create a signed ID token
  async function createIdToken(
    claims: Record<string, unknown>
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const defaultClaims = {
      iss: 'https://auth.example.com',
      sub: 'user-123',
      aud: 'signalk-server',
      exp: now + 3600,
      iat: now,
      nonce: 'test-nonce'
    }
    return new jose.SignJWT({ ...defaultClaims, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .sign(privateKey)
  }

  // Helper to setup JWKS mock
  function setupJwksMock() {
    const mockFetch = async (
      url: string | URL | Request
    ): Promise<Response> => {
      const urlStr = url.toString()
      if (urlStr === 'https://auth.example.com/.well-known/jwks.json') {
        return new Response(JSON.stringify(jwks), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      throw new Error(`Unexpected URL: ${urlStr}`)
    }
    setJwksFetch(mockFetch)
  }

  describe('fetchJwks', () => {
    it('should fetch JWKS from provider', async () => {
      setupJwksMock()
      const result = await fetchJwks(metadata)
      expect(result.keys).to.have.length(1)
      expect(result.keys[0].kid).to.equal('test-key-1')
    })

    it('should cache JWKS', async () => {
      let callCount = 0
      const mockFetch = async (): Promise<Response> => {
        callCount++
        return new Response(JSON.stringify(jwks), { status: 200 })
      }
      setJwksFetch(mockFetch)

      await fetchJwks(metadata)
      await fetchJwks(metadata)

      expect(callCount).to.equal(1)
    })

    it('should throw on network error', async () => {
      const mockFetch = async (): Promise<Response> => {
        throw new Error('Network error')
      }
      setJwksFetch(mockFetch)

      try {
        await fetchJwks(metadata)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('DISCOVERY_FAILED')
      }
    })
  })

  describe('validateIdToken', () => {
    it('should validate a properly signed token', async () => {
      setupJwksMock()
      const idToken = await createIdToken({})
      const claims = await validateIdToken(
        idToken,
        config,
        metadata,
        'test-nonce'
      )

      expect(claims.sub).to.equal('user-123')
      expect(claims.iss).to.equal('https://auth.example.com')
      expect(claims.aud).to.equal('signalk-server')
    })

    it('should reject token with wrong issuer', async () => {
      setupJwksMock()
      const idToken = await createIdToken({ iss: 'https://wrong-issuer.com' })

      try {
        await validateIdToken(idToken, config, metadata, 'test-nonce')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('INVALID_TOKEN')
        expect((err as OIDCError).message).to.include('issuer')
      }
    })

    it('should reject token with wrong audience', async () => {
      setupJwksMock()
      const idToken = await createIdToken({ aud: 'wrong-client' })

      try {
        await validateIdToken(idToken, config, metadata, 'test-nonce')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('INVALID_TOKEN')
        expect((err as OIDCError).message).to.include('audience')
      }
    })

    it('should reject expired token', async () => {
      setupJwksMock()
      const now = Math.floor(Date.now() / 1000)
      const idToken = await createIdToken({
        exp: now - 3600, // expired 1 hour ago
        iat: now - 7200
      })

      try {
        await validateIdToken(idToken, config, metadata, 'test-nonce')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('INVALID_TOKEN')
        expect((err as OIDCError).message).to.include('expired')
      }
    })

    it('should reject token with wrong nonce', async () => {
      setupJwksMock()
      const idToken = await createIdToken({ nonce: 'wrong-nonce' })

      try {
        await validateIdToken(idToken, config, metadata, 'expected-nonce')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('INVALID_TOKEN')
        expect((err as OIDCError).message).to.include('nonce')
      }
    })

    it('should reject token with missing nonce when expected', async () => {
      setupJwksMock()
      const now = Math.floor(Date.now() / 1000)
      // Create token without nonce claim
      const idToken = await new jose.SignJWT({
        iss: 'https://auth.example.com',
        sub: 'user-123',
        aud: 'signalk-server',
        exp: now + 3600,
        iat: now
        // no nonce
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
        .sign(privateKey)

      try {
        await validateIdToken(idToken, config, metadata, 'expected-nonce')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('INVALID_TOKEN')
        expect((err as OIDCError).message).to.include('nonce')
      }
    })

    it('should accept token with audience as array containing client_id', async () => {
      setupJwksMock()
      const idToken = await createIdToken({
        aud: ['other-client', 'signalk-server', 'another-client']
      })

      const claims = await validateIdToken(
        idToken,
        config,
        metadata,
        'test-nonce'
      )
      expect(claims.sub).to.equal('user-123')
    })

    it('should reject token with invalid signature', async () => {
      setupJwksMock()
      // Create a token signed with a different key
      const differentKey = await jose.generateKeyPair('RS256')
      const now = Math.floor(Date.now() / 1000)
      const idToken = await new jose.SignJWT({
        iss: 'https://auth.example.com',
        sub: 'user-123',
        aud: 'signalk-server',
        exp: now + 3600,
        iat: now,
        nonce: 'test-nonce'
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
        .sign(differentKey.privateKey)

      try {
        await validateIdToken(idToken, config, metadata, 'test-nonce')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('INVALID_TOKEN')
      }
    })

    it('should allow 5 minute clock skew for expiration', async () => {
      setupJwksMock()
      const now = Math.floor(Date.now() / 1000)
      // Token expired 2 minutes ago (within 5 min skew)
      const idToken = await createIdToken({
        exp: now - 120,
        iat: now - 3720
      })

      // Should not throw due to clock skew tolerance
      const claims = await validateIdToken(
        idToken,
        config,
        metadata,
        'test-nonce'
      )
      expect(claims.sub).to.equal('user-123')
    })

    it('should extract all standard claims', async () => {
      setupJwksMock()
      const idToken = await createIdToken({
        email: 'user@example.com',
        name: 'Test User',
        preferred_username: 'testuser',
        groups: ['admin', 'users']
      })

      const claims = await validateIdToken(
        idToken,
        config,
        metadata,
        'test-nonce'
      )

      expect(claims.email).to.equal('user@example.com')
      expect(claims.name).to.equal('Test User')
      expect(claims.preferred_username).to.equal('testuser')
      expect(claims.groups).to.deep.equal(['admin', 'users'])
    })
  })

  describe('JWKS key rotation handling', () => {
    it('should retry with fresh JWKS when signature verification fails due to key rotation', async () => {
      // Generate a new key pair (simulating key rotation)
      const newKeyPair = await jose.generateKeyPair('RS256')
      const newPublicJwk = await jose.exportJWK(newKeyPair.publicKey)
      newPublicJwk.kid = 'new-key-1'
      newPublicJwk.alg = 'RS256'
      newPublicJwk.use = 'sig'
      const newJwks = { keys: [newPublicJwk as JSONWebKeySet['keys'][0]] }

      // Create token signed with the NEW key
      const now = Math.floor(Date.now() / 1000)
      const idToken = await new jose.SignJWT({
        iss: 'https://auth.example.com',
        sub: 'user-123',
        aud: 'signalk-server',
        exp: now + 3600,
        iat: now,
        nonce: 'test-nonce'
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'new-key-1' })
        .sign(newKeyPair.privateKey)

      // First call returns old JWKS (wrong key), second call returns new JWKS
      let fetchCount = 0
      const mockFetch = async (): Promise<Response> => {
        fetchCount++
        if (fetchCount === 1) {
          // First fetch: return old JWKS (will fail signature verification)
          return new Response(JSON.stringify(jwks), { status: 200 })
        }
        // Second fetch: return new JWKS (will succeed)
        return new Response(JSON.stringify(newJwks), { status: 200 })
      }
      setJwksFetch(mockFetch)

      // Should succeed after retry
      const claims = await validateIdToken(
        idToken,
        config,
        metadata,
        'test-nonce'
      )

      expect(claims.sub).to.equal('user-123')
      expect(fetchCount).to.equal(2) // Confirms retry happened
    })

    it('should not retry for non-signature errors like expired token', async () => {
      let fetchCount = 0
      const mockFetch = async (): Promise<Response> => {
        fetchCount++
        return new Response(JSON.stringify(jwks), { status: 200 })
      }
      setJwksFetch(mockFetch)

      // Create an expired token (signed with correct key)
      const now = Math.floor(Date.now() / 1000)
      const idToken = await createIdToken({
        exp: now - 3600, // expired 1 hour ago (outside clock skew tolerance)
        iat: now - 7200
      })

      try {
        await validateIdToken(idToken, config, metadata, 'test-nonce')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('INVALID_TOKEN')
        expect((err as OIDCError).message).to.include('expired')
      }

      // Should only fetch once - no retry for expiration errors
      expect(fetchCount).to.equal(1)
    })

    it('should not retry for issuer mismatch errors', async () => {
      let fetchCount = 0
      const mockFetch = async (): Promise<Response> => {
        fetchCount++
        return new Response(JSON.stringify(jwks), { status: 200 })
      }
      setJwksFetch(mockFetch)

      const idToken = await createIdToken({ iss: 'https://wrong-issuer.com' })

      try {
        await validateIdToken(idToken, config, metadata, 'test-nonce')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('INVALID_TOKEN')
        expect((err as OIDCError).message).to.include('issuer')
      }

      // Should only fetch once - no retry for issuer errors
      expect(fetchCount).to.equal(1)
    })

    it('should fail after retry if new JWKS also does not contain valid key', async () => {
      // Generate a completely different key (not in any JWKS)
      const unknownKeyPair = await jose.generateKeyPair('RS256')

      // Create token signed with the unknown key
      const now = Math.floor(Date.now() / 1000)
      const idToken = await new jose.SignJWT({
        iss: 'https://auth.example.com',
        sub: 'user-123',
        aud: 'signalk-server',
        exp: now + 3600,
        iat: now,
        nonce: 'test-nonce'
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'unknown-key' })
        .sign(unknownKeyPair.privateKey)

      // Always return the same JWKS (which doesn't have the signing key)
      let fetchCount = 0
      const mockFetch = async (): Promise<Response> => {
        fetchCount++
        return new Response(JSON.stringify(jwks), { status: 200 })
      }
      setJwksFetch(mockFetch)

      try {
        await validateIdToken(idToken, config, metadata, 'test-nonce')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).to.be.instanceOf(OIDCError)
        expect((err as OIDCError).code).to.equal('INVALID_TOKEN')
      }

      // Should have retried once
      expect(fetchCount).to.equal(2)
    })
  })
})
