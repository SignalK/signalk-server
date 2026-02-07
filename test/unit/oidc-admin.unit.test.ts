import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type MockEntry = { id: string; previous?: NodeModule }

type RequestStub = { body?: Record<string, unknown> }
type ResponseStub = {
  statusCode: number
  payload: unknown
  status: (code: number) => ResponseStub
  json: (data: unknown) => ResponseStub
}
type Handler = (req: RequestStub, res: ResponseStub) => void | Promise<void>
type SecurityConfig = { oidc?: Record<string, unknown> }
type AppStub = {
  handlers: Record<string, Handler>
  get: (path: string, handler: Handler) => void
  put: (path: string, handler: Handler) => void
  post: (path: string, handler: Handler) => void
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

const loadOIDCAdmin = (
  overrides: {
    config?: Record<string, unknown>
    discovery?: Record<string, unknown>
  } = {}
) => {
  const entries: MockEntry[] = []

  mockModule(entries, '../../src/oidc/config', {
    parseEnvConfig: () => ({
      enabled: true,
      issuer: 'https://env-issuer',
      clientSecret: 'env-secret'
    }),
    mergeConfigs: (_oidcConfig: unknown, _envConfig: unknown) => ({
      enabled: true,
      issuer: 'https://merged-issuer',
      clientId: 'client-id',
      clientSecret: 'secret',
      redirectUri: 'https://redirect',
      scope: 'openid',
      defaultPermission: 'readwrite',
      autoCreateUsers: true,
      adminGroups: ['admins'],
      readwriteGroups: ['rw'],
      groupsAttribute: 'groups',
      providerName: 'OIDC',
      autoLogin: false
    }),
    validateOIDCConfig: () => undefined,
    ...(overrides.config || {})
  })

  mockModule(entries, '../../src/oidc/discovery', {
    getDiscoveryDocument: async (_issuer: string) => ({
      issuer: 'https://issuer',
      authorization_endpoint: 'https://auth',
      token_endpoint: 'https://token',
      userinfo_endpoint: 'https://userinfo',
      jwks_uri: 'https://jwks'
    }),
    ...(overrides.discovery || {})
  })

  const modulePath = require.resolve('../../src/oidc/oidc-admin')
  delete require.cache[modulePath]
  const oidcAdmin = require(modulePath) as {
    registerOIDCAdminRoutes: (
      app: AppStub,
      deps: {
        allowConfigure: (req: RequestStub) => boolean
        getSecurityConfig: () => SecurityConfig
        saveSecurityConfig: (
          config: SecurityConfig,
          cb: (err?: Error | null) => void
        ) => void
        updateOIDCConfig?: (config: Record<string, unknown>) => void
      }
    ) => void
  }

  return {
    oidcAdmin,
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
    },
    put: (path: string, handler: Handler) => {
      handlers[`PUT ${path}`] = handler
    },
    post: (path: string, handler: Handler) => {
      handlers[`POST ${path}`] = handler
    }
  }
}

const createResponse = (): ResponseStub => {
  const res: ResponseStub = {
    statusCode: 200,
    payload: null,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(data: unknown) {
      res.payload = data
      return res
    }
  }
  return res
}

describe('oidc admin routes', () => {
  it('returns redacted config with env overrides', () => {
    const { oidcAdmin, restore } = loadOIDCAdmin()
    const app = createApp()

    const deps = {
      allowConfigure: () => true,
      getSecurityConfig: () => ({ oidc: { clientSecret: 'local-secret' } }),
      saveSecurityConfig: (
        _config: SecurityConfig,
        cb: (err?: Error | null) => void
      ) => cb()
    }

    oidcAdmin.registerOIDCAdminRoutes(app, deps)

    const res = createResponse()
    app.handlers['GET /skServer/security/oidc']({}, res)

    expect(res.payload.clientSecret).to.equal('')
    expect(res.payload.clientSecretSet).to.equal(true)
    expect(res.payload.envOverrides.issuer).to.equal(true)

    restore()
  })

  it('rejects unauthorized admin access', () => {
    const { oidcAdmin, restore } = loadOIDCAdmin()
    const app = createApp()

    oidcAdmin.registerOIDCAdminRoutes(app, {
      allowConfigure: () => false,
      getSecurityConfig: () => ({}),
      saveSecurityConfig: (
        _config: SecurityConfig,
        cb: (err?: Error | null) => void
      ) => cb()
    })

    const res = createResponse()
    app.handlers['GET /skServer/security/oidc']({}, res)

    expect(res.statusCode).to.equal(401)
    restore()
  })

  it('updates config and preserves secret', () => {
    const { oidcAdmin, restore } = loadOIDCAdmin()
    const app = createApp()

    const saved: SecurityConfig[] = []
    let updated: Record<string, unknown> | null = null

    oidcAdmin.registerOIDCAdminRoutes(app, {
      allowConfigure: () => true,
      getSecurityConfig: () => ({ oidc: { clientSecret: 'keep-secret' } }),
      saveSecurityConfig: (
        config: SecurityConfig,
        cb: (err?: Error | null) => void
      ) => {
        saved.push(config)
        cb()
      },
      updateOIDCConfig: (config: Record<string, unknown>) => {
        updated = config
      }
    })

    const req = {
      body: {
        issuer: 'https://issuer',
        adminGroups: 'a,b',
        clientSecret: ''
      }
    }
    const res = createResponse()

    app.handlers['PUT /skServer/security/oidc'](req, res)

    expect(saved[0].oidc.clientSecret).to.equal('keep-secret')
    expect(saved[0].oidc.adminGroups).to.deep.equal(['a', 'b'])
    expect(updated.clientSecret).to.equal('keep-secret')

    restore()
  })

  it('returns validation errors', () => {
    const { OIDCError } = require('../../src/oidc/types') as {
      OIDCError: new (message: string, code: string) => Error
    }

    const { oidcAdmin, restore } = loadOIDCAdmin({
      config: {
        validateOIDCConfig: () => {
          throw new OIDCError('bad', 'INVALID')
        }
      }
    })

    const app = createApp()
    oidcAdmin.registerOIDCAdminRoutes(app, {
      allowConfigure: () => true,
      getSecurityConfig: () => ({ oidc: {} }),
      saveSecurityConfig: (
        _config: SecurityConfig,
        cb: (err?: Error | null) => void
      ) => cb()
    })

    const res = createResponse()
    app.handlers['PUT /skServer/security/oidc']({ body: {} }, res)

    expect(res.statusCode).to.equal(400)
    expect(res.payload.error).to.equal('bad')

    restore()
  })

  it('tests discovery document with validation', async () => {
    const { oidcAdmin, restore } = loadOIDCAdmin()
    const app = createApp()

    oidcAdmin.registerOIDCAdminRoutes(app, {
      allowConfigure: () => true,
      getSecurityConfig: () => ({}),
      saveSecurityConfig: (
        _config: SecurityConfig,
        cb: (err?: Error | null) => void
      ) => cb()
    })

    const res = createResponse()
    await app.handlers['POST /skServer/security/oidc/test'](
      { body: { issuer: 'https://issuer' } },
      res
    )

    expect(res.payload.success).to.equal(true)

    const resMissing = createResponse()
    await app.handlers['POST /skServer/security/oidc/test'](
      { body: {} },
      resMissing
    )
    expect(resMissing.statusCode).to.equal(400)

    const resInvalid = createResponse()
    await app.handlers['POST /skServer/security/oidc/test'](
      { body: { issuer: 'not-a-url' } },
      resInvalid
    )
    expect(resInvalid.statusCode).to.equal(400)

    restore()
  })

  it('handles discovery errors', async () => {
    const { oidcAdmin, restore } = loadOIDCAdmin({
      discovery: {
        getDiscoveryDocument: async () => {
          throw new Error('fail')
        }
      }
    })

    const app = createApp()
    oidcAdmin.registerOIDCAdminRoutes(app, {
      allowConfigure: () => true,
      getSecurityConfig: () => ({}),
      saveSecurityConfig: (
        _config: SecurityConfig,
        cb: (err?: Error | null) => void
      ) => cb()
    })

    const res = createResponse()
    await app.handlers['POST /skServer/security/oidc/test'](
      { body: { issuer: 'https://issuer' } },
      res
    )

    expect(res.statusCode).to.equal(502)
    restore()
  })
})
