import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type MockEntry = { id: string; previous?: NodeModule }

type UnknownRecord = Record<string, unknown>
type UserRecord = {
  username: string
  type?: string
  providerData?: UnknownRecord
}
type UserService = {
  findUserByProvider: (args: {
    provider: string
    criteria: UnknownRecord
  }) => Promise<UserRecord | null>
  updateUser?: (username: string, data: UnknownRecord) => Promise<void>
  findUserByUsername: (username: string) => Promise<UserRecord | null>
  createUser?: (user: UserRecord) => Promise<void>
}

type RequestStub = {
  secure?: boolean
  headers?: Record<string, string | undefined>
  get?: (name: string) => string
  query?: UnknownRecord
  cookies?: Record<string, string>
}
type ResponseStub = {
  statusCode: number
  payload: unknown
  cookies: Record<string, string>
  cleared: string[]
  redirectUrl: string
  status: (code: number) => ResponseStub
  json: (data: unknown) => ResponseStub
  cookie: (name: string, value: string) => ResponseStub
  clearCookie: (name: string) => ResponseStub
  redirect: (url: string) => ResponseStub
}

type Handler = (req: RequestStub, res: ResponseStub) => void | Promise<void>
type AppStub = {
  handlers: Record<string, Handler>
  get: (path: string, handler: Handler) => void
}

const mockModule = (entries: MockEntry[], id: string, exports: unknown) => {
  const resolved = require.resolve(id)
  entries.push({ id: resolved, previous: require.cache[resolved] })
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports
  } as NodeModule
}

const loadOIDCAuth = (
  overrides: {
    config?: Record<string, unknown>
    state?: Record<string, unknown>
    discovery?: Record<string, unknown>
    authorization?: Record<string, unknown>
    tokenExchange?: Record<string, unknown>
    idToken?: Record<string, unknown>
    permission?: Record<string, unknown>
  } = {}
) => {
  const entries: MockEntry[] = []

  mockModule(entries, '../../src/oidc/config', {
    isOIDCEnabled: () => true,
    ...(overrides.config || {})
  })

  mockModule(entries, '../../src/oidc/state', {
    createAuthState: (redirectUri: string, originalUrl: string) => ({
      state: 'state-1',
      nonce: 'nonce-1',
      redirectUri,
      originalUrl
    }),
    validateState: () => undefined,
    encryptState: () => 'encrypted',
    decryptState: () => ({
      state: 'state-1',
      nonce: 'nonce-1',
      originalUrl: '/'
    }),
    ...(overrides.state || {})
  })

  mockModule(entries, '../../src/oidc/discovery', {
    getDiscoveryDocument: async () => ({
      issuer: 'https://issuer',
      authorization_endpoint: 'https://auth',
      token_endpoint: 'https://token',
      userinfo_endpoint: 'https://userinfo',
      jwks_uri: 'https://jwks',
      end_session_endpoint: 'https://logout'
    }),
    ...(overrides.discovery || {})
  })

  mockModule(entries, '../../src/oidc/authorization', {
    buildAuthorizationUrl: () => 'https://auth',
    ...(overrides.authorization || {})
  })

  mockModule(entries, '../../src/oidc/token-exchange', {
    exchangeAuthorizationCode: async () => ({
      idToken: 'id',
      accessToken: 'access'
    }),
    fetchUserinfo: async () => null,
    ...(overrides.tokenExchange || {})
  })

  mockModule(entries, '../../src/oidc/id-token-validation', {
    validateIdToken: async () => ({ sub: 'user-1' }),
    ...(overrides.idToken || {})
  })

  mockModule(entries, '../../src/oidc/permission-mapping', {
    mapGroupsToPermission: () => 'admin',
    ...(overrides.permission || {})
  })

  const modulePath = require.resolve('../../src/oidc/oidc-auth')
  delete require.cache[modulePath]
  const oidcAuth = require(modulePath) as {
    validateAndMergeUserinfoClaims: (
      idTokenClaims: UnknownRecord,
      userinfoClaims: UnknownRecord,
      groupsAttribute?: string
    ) => void
    findOrCreateOIDCUser: (
      userInfo: UnknownRecord,
      oidcConfig: UnknownRecord,
      deps: { userService: UserService }
    ) => Promise<UserRecord | null>
    registerOIDCRoutes: (
      app: AppStub,
      deps: {
        getOIDCConfig: () => UnknownRecord
        setSessionCookie: (
          res: ResponseStub,
          req: RequestStub,
          token: string,
          username: string,
          options?: { rememberMe?: boolean }
        ) => void
        clearSessionCookie: (res: ResponseStub) => void
        generateJWT: (userId: string, expiration?: string) => string
        cryptoService: { getStateEncryptionSecret: () => string }
        userService: UserService
      }
    ) => void
  }

  return {
    oidcAuth,
    restore: () => {
      delete require.cache[modulePath]
      entries.forEach(({ id, previous }) => {
        if (previous) {
          require.cache[id] = previous
        } else {
          delete require.cache[id]
        }
      })
    }
  }
}

const createApp = (): AppStub => {
  const handlers: Record<string, Handler> = {}
  return {
    handlers,
    get: (path: string, handler: Handler) => {
      handlers[`GET ${path}`] = handler
    }
  }
}

const createResponse = (): ResponseStub => {
  const res: ResponseStub = {
    statusCode: 200,
    payload: null,
    cookies: {},
    cleared: [] as string[],
    redirectUrl: '',
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(data: unknown) {
      res.payload = data
      return res
    },
    cookie(name: string, value: string) {
      res.cookies[name] = value
      return res
    },
    clearCookie(name: string) {
      res.cleared.push(name)
      return res
    },
    redirect(url: string) {
      res.redirectUrl = url
      return res
    }
  }
  return res
}

describe('oidc auth helpers', () => {
  it('validates and merges userinfo claims', () => {
    const { oidcAuth, restore } = loadOIDCAuth()

    const idTokenClaims: UnknownRecord = { sub: 'user-1', iss: 'issuer' }
    const userinfoClaims: UnknownRecord = { email: 'a@b.com', groups: ['g1'] }

    oidcAuth.validateAndMergeUserinfoClaims(idTokenClaims, userinfoClaims)
    expect(idTokenClaims.email).to.equal('a@b.com')
    expect(idTokenClaims.sub).to.equal('user-1')

    const { OIDCError } = require('../../src/oidc/types') as {
      OIDCError: new (message: string, code: string) => Error
    }

    expect(() =>
      oidcAuth.validateAndMergeUserinfoClaims(
        { sub: 'user-1' },
        { sub: 'user-2' }
      )
    ).to.throw(OIDCError)

    restore()
  })

  it('finds or creates OIDC users', async () => {
    const { oidcAuth, restore } = loadOIDCAuth()

    const userService: UserService = {
      findUserByProvider: async () => ({
        username: 'existing',
        type: 'readonly',
        providerData: { email: 'old', groups: ['a'] }
      }),
      updateUser: async (_username: string, _data: UnknownRecord) => undefined,
      findUserByUsername: async () => null,
      createUser: async (_user: UserRecord) => undefined
    }

    const user = await oidcAuth.findOrCreateOIDCUser(
      {
        sub: 'user-1',
        email: 'new@example.com',
        name: 'Name',
        groups: ['b']
      },
      {
        issuer: 'https://issuer',
        autoCreateUsers: true,
        defaultPermission: 'readwrite',
        adminGroups: ['admin'],
        readwriteGroups: ['rw'],
        groupsAttribute: 'groups'
      },
      { userService }
    )

    expect(user?.username).to.equal('existing')

    const userServiceNoCreate: UserService = {
      findUserByProvider: async () => null,
      findUserByUsername: async () => null,
      createUser: async (_user: UserRecord) => undefined
    }

    const nullUser = await oidcAuth.findOrCreateOIDCUser(
      { sub: 'user-1', email: 'new@example.com' },
      { issuer: 'https://issuer', autoCreateUsers: false },
      { userService: userServiceNoCreate }
    )

    expect(nullUser).to.equal(null)

    const created: UserRecord[] = []
    const userServiceCollision: UserService = {
      findUserByProvider: async () => null,
      findUserByUsername: async () => ({ username: 'existing' }),
      createUser: async (user: UserRecord) => {
        created.push(user)
      }
    }

    await oidcAuth.findOrCreateOIDCUser(
      { sub: 'abcdef123456', email: 'new@example.com' },
      { issuer: 'https://issuer', autoCreateUsers: true },
      { userService: userServiceCollision }
    )

    expect(created[0].username).to.contain('abcdef12')

    restore()
  })
})

describe('oidc auth routes', () => {
  it('handles login flow and status', async () => {
    const { oidcAuth, restore } = loadOIDCAuth()
    const app = createApp()

    const deps = {
      getOIDCConfig: () => ({ enabled: true, issuer: 'https://issuer' }),
      setSessionCookie: () => undefined,
      clearSessionCookie: () => undefined,
      generateJWT: () => 'jwt',
      cryptoService: { getStateEncryptionSecret: () => 'secret' },
      userService: {
        findUserByProvider: async () => null,
        findUserByUsername: async () => null,
        createUser: async () => undefined
      } as UserService
    }

    oidcAuth.registerOIDCRoutes(app, deps)

    const res = createResponse()
    await app.handlers['GET /signalk/v1/auth/oidc/login'](
      {
        secure: false,
        headers: {},
        get: () => 'localhost',
        query: { redirect: '/ui' }
      },
      res
    )

    const { STATE_COOKIE_NAME } = require('../../src/oidc/types') as {
      STATE_COOKIE_NAME: string
    }

    expect(res.cookies[STATE_COOKIE_NAME]).to.equal('encrypted')
    expect(res.redirectUrl).to.equal('https://auth')

    const statusRes = createResponse()
    app.handlers['GET /signalk/v1/auth/oidc/status']({}, statusRes)
    expect(statusRes.payload.enabled).to.equal(true)

    restore()
  })

  it('handles login disabled and callback errors', async () => {
    const { oidcAuth, restore } = loadOIDCAuth({
      config: { isOIDCEnabled: () => false }
    })
    const app = createApp()

    oidcAuth.registerOIDCRoutes(app, {
      getOIDCConfig: () => ({ enabled: false }),
      setSessionCookie: () => undefined,
      clearSessionCookie: () => undefined,
      generateJWT: () => 'jwt',
      cryptoService: { getStateEncryptionSecret: () => 'secret' },
      userService: {
        findUserByProvider: async () => null,
        findUserByUsername: async () => null,
        createUser: async () => undefined
      } as UserService
    })

    const res = createResponse()
    await app.handlers['GET /signalk/v1/auth/oidc/login'](
      {
        secure: false,
        headers: {},
        get: () => 'localhost',
        query: {}
      },
      res
    )

    expect(res.statusCode).to.equal(500)

    const callbackRes = createResponse()
    await app.handlers['GET /signalk/v1/auth/oidc/callback'](
      {
        query: { error: 'access_denied' },
        cookies: {}
      },
      callbackRes
    )

    expect(callbackRes.redirectUrl).to.contain('oidcError=true')

    restore()
  })

  it('handles logout variations', async () => {
    const { oidcAuth, restore } = loadOIDCAuth()
    const app = createApp()

    let cleared = 0
    oidcAuth.registerOIDCRoutes(app, {
      getOIDCConfig: () => ({ enabled: true, issuer: 'https://issuer' }),
      setSessionCookie: () => undefined,
      clearSessionCookie: () => {
        cleared += 1
      },
      generateJWT: () => 'jwt',
      cryptoService: { getStateEncryptionSecret: () => 'secret' },
      userService: {
        findUserByProvider: async () => null,
        findUserByUsername: async () => null,
        createUser: async () => undefined
      } as UserService
    })

    const res = createResponse()
    await app.handlers['GET /signalk/v1/auth/oidc/logout'](
      {
        secure: false,
        headers: {},
        get: () => 'localhost',
        query: { redirect: '/bye' }
      },
      res
    )

    expect(cleared).to.equal(1)
    expect(res.redirectUrl).to.contain('https://logout')
    expect(res.redirectUrl).to.contain('post_logout_redirect_uri=')

    const { oidcAuth: oidcAuthNoLogout, restore: restoreNoLogout } =
      loadOIDCAuth({
        discovery: {
          getDiscoveryDocument: async () => ({ issuer: 'https://issuer' })
        }
      })

    const appNoLogout = createApp()
    oidcAuthNoLogout.registerOIDCRoutes(appNoLogout, {
      getOIDCConfig: () => ({ enabled: true, issuer: 'https://issuer' }),
      setSessionCookie: () => undefined,
      clearSessionCookie: () => undefined,
      generateJWT: () => 'jwt',
      cryptoService: { getStateEncryptionSecret: () => 'secret' },
      userService: {
        findUserByProvider: async () => null,
        findUserByUsername: async () => null,
        createUser: async () => undefined
      } as UserService
    })

    const resNoLogout = createResponse()
    await appNoLogout.handlers['GET /signalk/v1/auth/oidc/logout'](
      {
        secure: false,
        headers: {},
        get: () => 'localhost',
        query: { redirect: '/bye' }
      },
      resNoLogout
    )

    expect(resNoLogout.redirectUrl).to.equal('/bye')

    restoreNoLogout()
    restore()
  })
})
