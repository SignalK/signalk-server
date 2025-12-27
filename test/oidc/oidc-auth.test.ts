import { expect } from 'chai'
import { Request, Response as ExpressResponse, Application } from 'express'
import {
  registerOIDCRoutes,
  OIDCAuthDependencies
} from '../../src/oidc/oidc-auth'
import {
  setFetchFunction as setDiscoveryFetch,
  resetFetchFunction as resetDiscoveryFetch,
  clearDiscoveryCache
} from '../../src/oidc/discovery'
import { OIDCConfig } from '../../src/oidc/types'
import { SecurityConfig } from '../../src/security'

describe('OIDC Auth Routes', () => {
  // Mock Express app that captures registered routes
  interface RegisteredRoute {
    method: string
    path: string
    handler: (req: Request, res: ExpressResponse) => Promise<void> | void
  }
  const registeredRoutes: RegisteredRoute[] = []

  const mockApp = {
    get: (
      path: string,
      handler: (req: Request, res: ExpressResponse) => void
    ) => {
      registeredRoutes.push({ method: 'get', path, handler })
    },
    post: (
      path: string,
      handler: (req: Request, res: ExpressResponse) => void
    ) => {
      registeredRoutes.push({ method: 'post', path, handler })
    }
  } as unknown as Application

  // Mock security config
  const mockSecurityConfig: SecurityConfig = {
    users: [],
    devices: [],
    secretKey: '0'.repeat(64),
    expiration: '1h',
    immutableConfig: false,
    allow_readonly: true,
    allowNewUserRegistration: false,
    allowDeviceAccessRequests: false
  }

  // Mock OIDC config
  const mockOIDCConfig: OIDCConfig = {
    enabled: true,
    issuer: 'https://auth.example.com',
    clientId: 'signalk-server',
    clientSecret: 'test-secret',
    scope: 'openid email profile',
    defaultPermission: 'readonly',
    autoCreateUsers: true,
    providerName: 'Test SSO',
    autoLogin: false
  }

  // Track calls to dependency functions
  let clearCookieCalled = false

  const mockDeps: OIDCAuthDependencies = {
    getConfiguration: () => mockSecurityConfig,
    getOIDCConfig: () => mockOIDCConfig,
    setSessionCookie: () => {},
    clearSessionCookie: () => {
      clearCookieCalled = true
    },
    generateJWT: (userId: string) => `mock-jwt-for-${userId}`,
    saveConfig: (_config, callback) => callback(null)
  }

  // Helper to create mock request
  function createMockRequest(overrides: Partial<Request> = {}): Request {
    return {
      query: {},
      cookies: {},
      secure: false,
      get: (header: string) => {
        if (header === 'host') return 'signalk.local:3000'
        return undefined
      },
      headers: {},
      ...overrides
    } as unknown as Request
  }

  // Helper to create mock response
  interface MockResponse {
    redirectUrl: string | null
    jsonData: unknown
    statusCode: number
    redirect: (url: string) => void
    json: (data: unknown) => MockResponse
    status: (code: number) => MockResponse
    clearCookie: () => void
  }

  function createMockResponse(): MockResponse {
    const res: MockResponse = {
      redirectUrl: null,
      jsonData: null,
      statusCode: 200,
      redirect: function (url: string) {
        this.redirectUrl = url
      },
      json: function (data: unknown) {
        this.jsonData = data
        return this
      },
      status: function (code: number) {
        this.statusCode = code
        return this
      },
      clearCookie: () => {}
    }
    return res
  }

  // Helper to find a registered route handler
  function findRoute(
    method: string,
    path: string
  ):
    | ((req: Request, res: ExpressResponse) => Promise<void> | void)
    | undefined {
    const route = registeredRoutes.find(
      (r) => r.method === method && r.path === path
    )
    return route?.handler
  }

  beforeEach(() => {
    registeredRoutes.length = 0
    clearCookieCalled = false
    clearDiscoveryCache()
    resetDiscoveryFetch()
  })

  afterEach(() => {
    resetDiscoveryFetch()
  })

  describe('registerOIDCRoutes', () => {
    it('should register all OIDC routes', () => {
      registerOIDCRoutes(mockApp, mockDeps)

      const paths = registeredRoutes.map((r) => r.path)
      expect(paths).to.include('/signalk/v1/auth/oidc/login')
      expect(paths).to.include('/signalk/v1/auth/oidc/callback')
      expect(paths).to.include('/signalk/v1/auth/oidc/status')
      expect(paths).to.include('/signalk/v1/auth/oidc/logout')
    })
  })

  describe('OIDC logout endpoint', () => {
    beforeEach(() => {
      registerOIDCRoutes(mockApp, mockDeps)
    })

    it('should clear session cookies on logout', async () => {
      // Mock discovery to return metadata without end_session_endpoint
      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            issuer: 'https://auth.example.com',
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
            jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
            response_types_supported: ['code']
            // no end_session_endpoint
          }),
          { status: 200 }
        )
      }
      setDiscoveryFetch(mockFetch)

      const handler = findRoute('get', '/signalk/v1/auth/oidc/logout')
      expect(handler).to.not.equal(undefined)

      const req = createMockRequest()
      const res = createMockResponse()

      await handler!(req, res as unknown as ExpressResponse)

      expect(clearCookieCalled).to.equal(true)
    })

    it('should redirect to / by default when no redirect param', async () => {
      // Mock discovery without end_session_endpoint
      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            issuer: 'https://auth.example.com',
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
            jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
            response_types_supported: ['code']
          }),
          { status: 200 }
        )
      }
      setDiscoveryFetch(mockFetch)

      const handler = findRoute('get', '/signalk/v1/auth/oidc/logout')
      const req = createMockRequest()
      const res = createMockResponse()

      await handler!(req, res as unknown as ExpressResponse)

      expect(res.redirectUrl).to.equal('/')
    })

    it('should redirect to specified relative path', async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            issuer: 'https://auth.example.com',
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
            jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
            response_types_supported: ['code']
          }),
          { status: 200 }
        )
      }
      setDiscoveryFetch(mockFetch)

      const handler = findRoute('get', '/signalk/v1/auth/oidc/logout')
      const req = createMockRequest({ query: { redirect: '/admin' } })
      const res = createMockResponse()

      await handler!(req, res as unknown as ExpressResponse)

      expect(res.redirectUrl).to.equal('/admin')
    })

    it('should reject absolute URLs in redirect param (open redirect prevention)', async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            issuer: 'https://auth.example.com',
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
            jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
            response_types_supported: ['code']
          }),
          { status: 200 }
        )
      }
      setDiscoveryFetch(mockFetch)

      const handler = findRoute('get', '/signalk/v1/auth/oidc/logout')
      const req = createMockRequest({
        query: { redirect: 'https://evil.com/phish' }
      })
      const res = createMockResponse()

      await handler!(req, res as unknown as ExpressResponse)

      // Should redirect to / instead of the malicious URL
      expect(res.redirectUrl).to.equal('/')
    })

    it('should reject protocol-relative URLs in redirect param', async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            issuer: 'https://auth.example.com',
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
            jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
            response_types_supported: ['code']
          }),
          { status: 200 }
        )
      }
      setDiscoveryFetch(mockFetch)

      const handler = findRoute('get', '/signalk/v1/auth/oidc/logout')
      const req = createMockRequest({ query: { redirect: '//evil.com/phish' } })
      const res = createMockResponse()

      await handler!(req, res as unknown as ExpressResponse)

      expect(res.redirectUrl).to.equal('/')
    })

    it('should redirect to OIDC provider logout when end_session_endpoint is available', async () => {
      // Mock discovery WITH end_session_endpoint
      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            issuer: 'https://auth.example.com',
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
            jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
            response_types_supported: ['code'],
            end_session_endpoint: 'https://auth.example.com/logout'
          }),
          { status: 200 }
        )
      }
      setDiscoveryFetch(mockFetch)

      const handler = findRoute('get', '/signalk/v1/auth/oidc/logout')
      const req = createMockRequest()
      const res = createMockResponse()

      await handler!(req, res as unknown as ExpressResponse)

      expect(clearCookieCalled).to.equal(true)
      expect(res.redirectUrl).to.include('https://auth.example.com/logout')
      expect(res.redirectUrl).to.include('post_logout_redirect_uri=')
    })

    it('should include correct post_logout_redirect_uri in provider logout URL', async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            issuer: 'https://auth.example.com',
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
            jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
            response_types_supported: ['code'],
            end_session_endpoint: 'https://auth.example.com/logout'
          }),
          { status: 200 }
        )
      }
      setDiscoveryFetch(mockFetch)

      const handler = findRoute('get', '/signalk/v1/auth/oidc/logout')
      const req = createMockRequest({ query: { redirect: '/dashboard' } })
      const res = createMockResponse()

      await handler!(req, res as unknown as ExpressResponse)

      const logoutUrl = new URL(res.redirectUrl!)
      const postLogoutUri = logoutUrl.searchParams.get(
        'post_logout_redirect_uri'
      )
      expect(postLogoutUri).to.equal('http://signalk.local:3000/dashboard')
    })

    it('should fall back to local redirect when discovery fails', async () => {
      const mockFetch = async (): Promise<Response> => {
        throw new Error('Network error')
      }
      setDiscoveryFetch(mockFetch)

      const handler = findRoute('get', '/signalk/v1/auth/oidc/logout')
      const req = createMockRequest({ query: { redirect: '/settings' } })
      const res = createMockResponse()

      await handler!(req, res as unknown as ExpressResponse)

      expect(clearCookieCalled).to.equal(true)
      expect(res.redirectUrl).to.equal('/settings')
    })

    it('should redirect locally when OIDC is disabled', async () => {
      // Create deps with OIDC disabled
      const disabledDeps: OIDCAuthDependencies = {
        ...mockDeps,
        getOIDCConfig: () => ({ ...mockOIDCConfig, enabled: false })
      }

      // Re-register routes with disabled OIDC
      registeredRoutes.length = 0
      registerOIDCRoutes(mockApp, disabledDeps)

      const handler = findRoute('get', '/signalk/v1/auth/oidc/logout')
      const req = createMockRequest()
      const res = createMockResponse()

      await handler!(req, res as unknown as ExpressResponse)

      expect(clearCookieCalled).to.equal(true)
      expect(res.redirectUrl).to.equal('/')
    })
  })
})
