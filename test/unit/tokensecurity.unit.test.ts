import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const bcrypt = require('bcryptjs')
const ms = require('ms')

type MockApp = {
  selfId: string
  selfContext: string
  config: { settings: Record<string, unknown> }
  use: (...args: unknown[]) => void
  post: (...args: unknown[]) => void
  put: (...args: unknown[]) => void
  emit: (_event: string, _payload: unknown) => void
  handleMessage: (...args: unknown[]) => void
  useHandlers: Array<{ path: string; handler: (...args: unknown[]) => void }>
  postHandlers: Array<{
    path: string | string[]
    handler: (...args: unknown[]) => void
  }>
  putHandlers: Array<{
    path: string | string[]
    handler: (...args: unknown[]) => void
  }>
}

type MockOIDC = {
  parseOIDCConfig: (_options: unknown) => {
    enabled: boolean
    autoLogin?: boolean
    providerName?: string
  }
  registerOIDCRoutes: () => void
  registerOIDCAdminRoutes: () => void
}

const createApp = (): MockApp => {
  const useHandlers: Array<{
    path: string
    handler: (...args: unknown[]) => void
  }> = []
  const postHandlers: Array<{
    path: string | string[]
    handler: (...args: unknown[]) => void
  }> = []
  const putHandlers: Array<{
    path: string | string[]
    handler: (...args: unknown[]) => void
  }> = []
  return {
    selfId: 'self',
    selfContext: 'vessels.self',
    config: { settings: {} },
    use: (path: unknown, handler: unknown) => {
      if (typeof path === 'string' && typeof handler === 'function') {
        useHandlers.push({ path, handler })
      }
    },
    post: (...args: unknown[]) => {
      const [path, ...handlers] = args
      const lastHandler = handlers[handlers.length - 1]
      if (typeof lastHandler === 'function') {
        postHandlers.push({
          path: path as string | string[],
          handler: lastHandler
        })
      }
    },
    put: (...args: unknown[]) => {
      const [path, ...handlers] = args
      const lastHandler = handlers[handlers.length - 1]
      if (typeof lastHandler === 'function') {
        putHandlers.push({
          path: path as string | string[],
          handler: lastHandler
        })
      }
    },
    emit: () => {},
    handleMessage: () => {},
    useHandlers,
    postHandlers,
    putHandlers
  }
}

const findHandler = (
  handlers: Array<{
    path: string | string[]
    handler: (...args: unknown[]) => void
  }>,
  path: string
) => {
  return handlers.find((entry) => {
    if (Array.isArray(entry.path)) {
      return entry.path.includes(path)
    }
    return entry.path === path
  })?.handler
}

const findUseHandler = (
  handlers: Array<{ path: string; handler: (...args: unknown[]) => void }>,
  path: string
) => handlers.find((entry) => entry.path === path)?.handler

const loadTokenSecurity = (
  oidc: MockOIDC,
  overrides?: { requestResponse?: Record<string, unknown> }
) => {
  const securityPath = require.resolve('../../src/tokensecurity')
  const entries: Array<{ id: string; previous?: NodeModule }> = []

  const mockModule = (id: string, exports: unknown) => {
    const resolved = require.resolve(id)
    entries.push({ id: resolved, previous: require.cache[resolved] })
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports
    } as NodeModule
  }

  mockModule('../../src/oidc', oidc)
  if (overrides?.requestResponse) {
    mockModule('../../src/requestResponse', overrides.requestResponse)
  }
  mockModule('express-rate-limit', (_options: unknown) => {
    return (_req: unknown, _res: unknown, next: () => void) => next()
  })

  delete require.cache[securityPath]
  const tokensecurity = require(securityPath)

  return {
    tokensecurity,
    restore: () => {
      delete require.cache[securityPath]
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

describe('tokensecurity', () => {
  it('reports login status with OIDC metadata', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({
        enabled: true,
        autoLogin: true,
        providerName: 'ExampleOIDC'
      }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        acls: [],
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: false
      }

      const strategy = tokensecurity(app, config)
      const status = strategy.getLoginStatus({
        skIsAuthenticated: false
      })

      expect(status.status).to.equal('notLoggedIn')
      expect(status.readOnlyAccess).to.equal(true)
      expect(status.allowDeviceAccessRequests).to.equal(true)
      expect(status.allowNewUserRegistration).to.equal(false)
      expect(status.noUsers).to.equal(true)
      expect(status.oidcEnabled).to.equal(true)
      expect(status.oidcAutoLogin).to.equal(true)
      expect(status.oidcLoginUrl).to.equal('/signalk/v1/auth/oidc/login')
      expect(status.oidcProviderName).to.equal('ExampleOIDC')

      const loggedIn = strategy.getLoginStatus({
        skIsAuthenticated: true,
        skPrincipal: {
          permissions: 'admin',
          identifier: 'admin'
        }
      })
      expect(loggedIn.status).to.equal('loggedIn')
      expect(loggedIn.userLevel).to.equal('admin')
      expect(loggedIn.username).to.equal('admin')
    } finally {
      restore()
    }
  })

  it('returns users with OIDC metadata', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        secretKey: 'secret',
        users: [
          {
            username: 'alice',
            type: 'admin',
            oidc: {
              sub: 'sub-1',
              issuer: 'https://issuer.example',
              email: 'alice@example.com',
              name: 'Alice Example'
            }
          },
          { username: 'bob', type: 'readwrite' }
        ],
        devices: [],
        acls: []
      }

      const strategy = tokensecurity(app, config)
      const users = strategy.getUsers(config)

      expect(users).to.have.length(2)
      expect(users[0]).to.deep.equal({
        userId: 'alice',
        type: 'admin',
        isOIDC: true,
        oidc: {
          issuer: 'https://issuer.example',
          email: 'alice@example.com',
          name: 'Alice Example'
        }
      })
      expect(users[1]).to.deep.equal({
        userId: 'bob',
        type: 'readwrite',
        isOIDC: false
      })
    } finally {
      restore()
    }
  })

  it('evaluates ACLs for matching paths', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [{ username: 'user1', type: 'readwrite' }],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: [
          {
            context: 'vessels.*',
            resources: [
              {
                paths: ['navigation.speedOverGround'],
                permissions: [{ subject: 'user1', permission: 'read' }]
              }
            ]
          }
        ]
      }

      const strategy = tokensecurity(app, config)
      expect(
        strategy.checkACL(
          'user1',
          'vessels.self',
          'navigation.speedOverGround',
          'src',
          'read'
        )
      ).to.equal(true)
      expect(
        strategy.checkACL(
          'user1',
          'vessels.self',
          'navigation.speedOverGround',
          'src',
          'write'
        )
      ).to.equal(false)
      expect(
        strategy.checkACL(
          'user1',
          'vessels.self',
          'navigation.courseOverGroundTrue',
          'src',
          'read'
        )
      ).to.equal(false)
    } finally {
      restore()
    }
  })

  it('allows any access when ACLs are absent', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      expect(
        strategy.checkACL(
          'any',
          'vessels.self',
          'navigation.speedOverGround',
          'src',
          'read'
        )
      ).to.equal(true)
    } finally {
      restore()
    }
  })

  it('authorizes readonly access when token is missing', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      const req = { headers: {}, cookies: {} } as Record<string, unknown>

      strategy.authorizeWS(req)

      expect(req.skPrincipal).to.deep.equal({
        identifier: 'AUTO',
        permissions: 'readonly'
      })
    } finally {
      restore()
    }
  })

  it('throws when token is missing and readonly is disabled', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: false,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      const req = { headers: {}, cookies: {} } as Record<string, unknown>

      try {
        strategy.authorizeWS(req)
        throw new Error('Expected authorizeWS to throw')
      } catch (error) {
        expect((error as Error).message).to.equal('Missing access token')
      }
    } finally {
      restore()
    }
  })

  it('returns null when filtering deltas without a principal', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: [
          {
            context: 'vessels.*',
            resources: [
              {
                paths: ['navigation.speedOverGround'],
                permissions: [{ subject: 'any', permission: 'read' }]
              }
            ]
          }
        ]
      }

      const strategy = tokensecurity(app, config)
      const delta = {
        context: 'vessels.self',
        updates: [
          { values: [{ path: 'navigation.speedOverGround', value: 1 }] }
        ]
      }

      expect(strategy.filterReadDelta(undefined, delta)).to.equal(null)
    } finally {
      restore()
    }
  })

  it('rejects access requests when too many are pending', async () => {
    const { tokensecurity, restore } = loadTokenSecurity(
      {
        parseOIDCConfig: () => ({ enabled: false }),
        registerOIDCRoutes: () => {},
        registerOIDCAdminRoutes: () => {}
      },
      {
        requestResponse: {
          filterRequests: () => new Array(100).fill({}),
          createRequest: () => Promise.resolve({}),
          updateRequest: () => Promise.resolve({}),
          findRequest: () => undefined
        }
      }
    )

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)

      try {
        await strategy.requestAccess(
          config,
          { accessRequest: { userId: 'user', password: 'pw' } },
          '127.0.0.1',
          () => undefined
        )
        throw new Error('Expected requestAccess to reject')
      } catch (error) {
        expect((error as { statusCode?: number }).statusCode).to.equal(503)
      }
    } finally {
      restore()
    }
  })

  it('rejects invalid access request payloads', async () => {
    const updates: Array<{ statusCode: number }> = []
    const { tokensecurity, restore } = loadTokenSecurity(
      {
        parseOIDCConfig: () => ({ enabled: false }),
        registerOIDCRoutes: () => {},
        registerOIDCAdminRoutes: () => {}
      },
      {
        requestResponse: {
          filterRequests: () => [],
          createRequest: () =>
            Promise.resolve({ requestId: 'req-1', clientRequest: {} }),
          updateRequest: (
            _id: string,
            _state: string,
            payload: { statusCode: number }
          ) => {
            updates.push(payload)
            return Promise.resolve(payload)
          },
          findRequest: () => undefined
        }
      }
    )

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      await strategy.requestAccess(
        config,
        { accessRequest: { userId: 'user' } },
        '127.0.0.1',
        () => undefined
      )

      expect(updates[0].statusCode).to.equal(400)
    } finally {
      restore()
    }
  })

  it('rejects device access requests when disabled', async () => {
    const updates: Array<{ statusCode: number }> = []
    const { tokensecurity, restore } = loadTokenSecurity(
      {
        parseOIDCConfig: () => ({ enabled: false }),
        registerOIDCRoutes: () => {},
        registerOIDCAdminRoutes: () => {}
      },
      {
        requestResponse: {
          filterRequests: () => [],
          createRequest: () =>
            Promise.resolve({ requestId: 'req-1', clientRequest: {} }),
          updateRequest: (
            _id: string,
            _state: string,
            payload: { statusCode: number }
          ) => {
            updates.push(payload)
            return Promise.resolve(payload)
          },
          findRequest: () => undefined
        }
      }
    )

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: false,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      await strategy.requestAccess(
        config,
        {
          accessRequest: {
            clientId: 'device-1',
            description: 'Device'
          }
        },
        '127.0.0.1',
        () => undefined
      )

      expect(updates[0].statusCode).to.equal(403)
    } finally {
      restore()
    }
  })

  it('rejects user access requests when registration is disabled', async () => {
    const updates: Array<{ statusCode: number }> = []
    const { tokensecurity, restore } = loadTokenSecurity(
      {
        parseOIDCConfig: () => ({ enabled: false }),
        registerOIDCRoutes: () => {},
        registerOIDCAdminRoutes: () => {}
      },
      {
        requestResponse: {
          filterRequests: () => [],
          createRequest: () =>
            Promise.resolve({ requestId: 'req-1', clientRequest: {} }),
          updateRequest: (
            _id: string,
            _state: string,
            payload: { statusCode: number }
          ) => {
            updates.push(payload)
            return Promise.resolve(payload)
          },
          findRequest: () => undefined
        }
      }
    )

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: false,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      await strategy.requestAccess(
        config,
        { accessRequest: { userId: 'new-user', password: 'pw' } },
        '127.0.0.1',
        () => undefined
      )

      expect(updates[0].statusCode).to.equal(403)
    } finally {
      restore()
    }
  })

  it('rejects duplicate device access requests', async () => {
    const updates: Array<{ statusCode: number }> = []
    const { tokensecurity, restore } = loadTokenSecurity(
      {
        parseOIDCConfig: () => ({ enabled: false }),
        registerOIDCRoutes: () => {},
        registerOIDCAdminRoutes: () => {}
      },
      {
        requestResponse: {
          filterRequests: () => [],
          createRequest: () =>
            Promise.resolve({ requestId: 'req-1', clientRequest: {} }),
          updateRequest: (
            _id: string,
            _state: string,
            payload: { statusCode: number }
          ) => {
            updates.push(payload)
            return Promise.resolve(payload)
          },
          findRequest: () => ({
            state: 'PENDING',
            accessIdentifier: 'device-1'
          })
        }
      }
    )

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      await strategy.requestAccess(
        config,
        {
          accessRequest: {
            clientId: 'device-1',
            description: 'Device'
          }
        },
        '127.0.0.1',
        () => undefined
      )

      expect(updates[0].statusCode).to.equal(400)
    } finally {
      restore()
    }
  })

  it('rejects user access when username already exists', async () => {
    const updates: Array<{ statusCode: number }> = []
    const { tokensecurity, restore } = loadTokenSecurity(
      {
        parseOIDCConfig: () => ({ enabled: false }),
        registerOIDCRoutes: () => {},
        registerOIDCAdminRoutes: () => {}
      },
      {
        requestResponse: {
          filterRequests: () => [],
          createRequest: () =>
            Promise.resolve({ requestId: 'req-1', clientRequest: {} }),
          updateRequest: (
            _id: string,
            _state: string,
            payload: { statusCode: number }
          ) => {
            updates.push(payload)
            return Promise.resolve(payload)
          },
          findRequest: () => undefined
        }
      }
    )

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [{ username: 'exists', type: 'admin' }],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      await strategy.requestAccess(
        config,
        { accessRequest: { userId: 'exists', password: 'pw' } },
        '127.0.0.1',
        () => undefined
      )

      expect(updates[0].statusCode).to.equal(400)
    } finally {
      restore()
    }
  })

  it('authorizes websocket requests with valid user tokens', () => {
    const jwt = require('jsonwebtoken')
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        secretKey: 'secret',
        users: [{ username: 'alice', type: 'admin' }],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      const token = jwt.sign(
        { id: 'alice', exp: Date.now() / 1000 + 60 },
        'secret'
      )
      const req = { token } as Record<string, unknown>

      strategy.authorizeWS(req)

      expect(req.skPrincipal).to.deep.equal({
        identifier: 'alice',
        permissions: 'admin'
      })
      expect(req.skIsAuthenticated).to.equal(true)
    } finally {
      restore()
    }
  })

  it('authorizes websocket requests for devices', () => {
    const jwt = require('jsonwebtoken')
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        secretKey: 'secret',
        users: [],
        devices: [{ clientId: 'device-1', permissions: 'readwrite' }],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      const token = jwt.sign(
        { device: 'device-1', exp: Date.now() / 1000 + 60 },
        'secret'
      )
      const req = { token } as Record<string, unknown>

      strategy.authorizeWS(req)

      expect(req.skPrincipal).to.deep.equal({
        identifier: 'device-1',
        permissions: 'readwrite'
      })
    } finally {
      restore()
    }
  })

  it('rejects access request status updates for missing requests', () => {
    const { tokensecurity, restore } = loadTokenSecurity(
      {
        parseOIDCConfig: () => ({ enabled: false }),
        registerOIDCRoutes: () => {},
        registerOIDCAdminRoutes: () => {}
      },
      {
        requestResponse: {
          filterRequests: () => [],
          createRequest: () => Promise.resolve({}),
          updateRequest: () => Promise.resolve({}),
          findRequest: () => undefined
        }
      }
    )

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      let callbackError: Error | null | undefined

      strategy.setAccessRequestStatus(
        config,
        'missing',
        'approved',
        { permissions: 'readwrite', config: {} },
        (err) => {
          callbackError = err as Error
        }
      )

      expect(callbackError?.message).to.equal('not found')
    } finally {
      restore()
    }
  })

  it('rejects access request status updates with unknown status', () => {
    const request = {
      requestId: 'req-1',
      state: 'PENDING',
      accessIdentifier: 'device-1',
      accessDescription: 'Device',
      clientRequest: { accessRequest: { clientId: 'device-1' } },
      permissions: 'readwrite'
    }

    const { tokensecurity, restore } = loadTokenSecurity(
      {
        parseOIDCConfig: () => ({ enabled: false }),
        registerOIDCRoutes: () => {},
        registerOIDCAdminRoutes: () => {}
      },
      {
        requestResponse: {
          filterRequests: () => [],
          createRequest: () => Promise.resolve(request),
          updateRequest: () => Promise.resolve({}),
          findRequest: () => request
        }
      }
    )

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        secretKey: 'secret',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      let callbackError: Error | undefined

      strategy.setAccessRequestStatus(
        config,
        'device-1',
        'maybe',
        { permissions: 'readwrite', config: {} },
        (err) => {
          callbackError = err as Error
        }
      )

      expect(callbackError?.message).to.equal('Unkown status value')
    } finally {
      restore()
    }
  })

  it('approves device access requests and stores device info', async () => {
    const request = {
      requestId: 'req-1',
      state: 'PENDING',
      accessIdentifier: 'device-1',
      accessDescription: 'Device',
      clientRequest: { accessRequest: { clientId: 'device-1' } },
      permissions: 'readwrite'
    }
    const updates: Array<{ statusCode: number; data?: { token?: string } }> = []

    const { tokensecurity, restore } = loadTokenSecurity(
      {
        parseOIDCConfig: () => ({ enabled: false }),
        registerOIDCRoutes: () => {},
        registerOIDCAdminRoutes: () => {}
      },
      {
        requestResponse: {
          filterRequests: () => [],
          createRequest: () => Promise.resolve(request),
          updateRequest: (
            _id: string,
            _state: string,
            payload: { statusCode: number; data?: { token?: string } }
          ) => {
            updates.push(payload)
            return Promise.resolve(payload)
          },
          findRequest: () => request
        }
      }
    )

    try {
      const app = createApp()
      const events: Array<{ type: string }> = []
      app.emit = (_event: string, payload: { type: string }) => {
        events.push(payload)
      }

      const config = {
        allow_readonly: true,
        expiration: '1h',
        secretKey: 'secret',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      let callbackError: Error | undefined

      await new Promise<void>((resolve) => {
        strategy.setAccessRequestStatus(
          config,
          'device-1',
          'approved',
          { permissions: 'readwrite', config: {} },
          (err, newConfig) => {
            callbackError = err as Error
            expect(newConfig?.devices?.[0]?.clientId).to.equal('device-1')
            resolve()
          }
        )
      })

      expect(callbackError).to.equal(null)
      expect(updates[0].statusCode).to.equal(200)
      expect(updates[0].data?.token).to.be.a('string')
      expect(events.some((event) => event.type === 'ACCESS_REQUEST')).to.equal(
        true
      )
    } finally {
      restore()
    }
  })

  it('allows readonly access when no token and readonly is enabled', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      strategy.addAdminMiddleware('/admin')

      const authMiddleware = app.useHandlers.find(
        (entry) => entry.path === '/admin'
      )?.handler
      const req = { cookies: {}, accepts: () => false, path: '/admin' }
      const res = { status: () => res, send: () => res, redirect: () => res }
      let nextCalled = false

      authMiddleware?.(req, res, () => {
        nextCalled = true
      })

      expect(nextCalled).to.equal(true)
      expect(req.skPrincipal).to.deep.equal({
        identifier: 'AUTO',
        permissions: 'readonly'
      })
      expect(req.skIsAuthenticated).to.equal(true)
    } finally {
      restore()
    }
  })

  it('rejects requests without tokens when readonly is disabled', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: false,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      strategy.addAdminMiddleware('/admin')

      const authMiddleware = app.useHandlers.find(
        (entry) => entry.path === '/admin'
      )?.handler
      const req = { cookies: {}, accepts: () => false, path: '/admin' }
      let statusCode = 0
      let body: unknown
      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        send: (payload: unknown) => {
          body = payload
          return res
        },
        redirect: () => res
      }

      authMiddleware?.(req, res, () => undefined)

      expect(statusCode).to.equal(401)
      expect(body).to.equal('Unauthorized')
    } finally {
      restore()
    }
  })

  it('denies device access requests and reports denial', async () => {
    const request = {
      requestId: 'req-1',
      state: 'PENDING',
      accessIdentifier: 'device-1',
      accessDescription: 'Device',
      clientRequest: { accessRequest: { clientId: 'device-1' } },
      permissions: 'readwrite'
    }
    const updates: Array<{
      statusCode: number
      data?: { permission?: string }
    }> = []

    const { tokensecurity, restore } = loadTokenSecurity(
      {
        parseOIDCConfig: () => ({ enabled: false }),
        registerOIDCRoutes: () => {},
        registerOIDCAdminRoutes: () => {}
      },
      {
        requestResponse: {
          filterRequests: () => [],
          createRequest: () => Promise.resolve(request),
          updateRequest: (
            _id: string,
            _state: string,
            payload: { statusCode: number; data?: { permission?: string } }
          ) => {
            updates.push(payload)
            return Promise.resolve(payload)
          },
          findRequest: () => request
        }
      }
    )

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        secretKey: 'secret',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      await new Promise<void>((resolve) => {
        strategy.setAccessRequestStatus(
          config,
          'device-1',
          'denied',
          { permissions: 'readwrite', config: {} },
          () => resolve()
        )
      })

      expect(updates[0].data?.permission).to.equal('DENIED')
      expect(config.devices).to.have.length(0)
    } finally {
      restore()
    }
  })

  it('approves user access requests and stores user info', async () => {
    const request = {
      requestId: 'req-1',
      state: 'PENDING',
      accessIdentifier: 'new-user',
      accessDescription: 'New User Request',
      accessPassword: 'hashed-password',
      clientRequest: { accessRequest: { userId: 'new-user' } },
      permissions: 'readwrite'
    }
    const updates: Array<{ statusCode: number }> = []

    const { tokensecurity, restore } = loadTokenSecurity(
      {
        parseOIDCConfig: () => ({ enabled: false }),
        registerOIDCRoutes: () => {},
        registerOIDCAdminRoutes: () => {}
      },
      {
        requestResponse: {
          filterRequests: () => [],
          createRequest: () => Promise.resolve(request),
          updateRequest: (
            _id: string,
            _state: string,
            payload: { statusCode: number }
          ) => {
            updates.push(payload)
            return Promise.resolve(payload)
          },
          findRequest: () => request
        }
      }
    )

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        secretKey: 'secret',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      await new Promise<void>((resolve) => {
        strategy.setAccessRequestStatus(
          config,
          'new-user',
          'approved',
          { permissions: 'readwrite', config: {} },
          () => resolve()
        )
      })

      expect(updates[0].statusCode).to.equal(200)
      expect(config.users[0]).to.deep.equal({
        username: 'new-user',
        password: 'hashed-password',
        type: 'readwrite'
      })
    } finally {
      restore()
    }
  })

  it('sets session cookies and redirects to safe destination on login', async () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '2h',
        secretKey: 'secret',
        users: [
          {
            username: 'user',
            type: 'admin',
            password: bcrypt.hashSync('pw', 10)
          }
        ],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      tokensecurity(app, config)

      const handler =
        findHandler(app.postHandlers, '/login') ||
        findHandler(app.postHandlers, '/signalk/v1/auth/login')

      const cookies: Array<{
        name: string
        value: string
        options: Record<string, unknown>
      }> = []
      let redirectTo = ''

      await new Promise<void>((resolve) => {
        const req = {
          body: {
            username: 'user',
            password: 'pw',
            destination: 'https://evil.invalid',
            rememberMe: true
          },
          get: () => 'text/html',
          secure: true,
          headers: {}
        }
        const res = {
          cookie: (
            name: string,
            value: string,
            options: Record<string, unknown>
          ) => {
            cookies.push({ name, value, options })
            return res
          },
          redirect: (destination: string) => {
            redirectTo = destination
            resolve()
            return res
          },
          status: () => res,
          send: () => res,
          json: () => res
        }

        handler?.(req, res)
      })

      expect(redirectTo).to.equal('/')
      const authCookie = cookies.find(
        (cookie) => cookie.name === 'JAUTHENTICATION'
      )
      const loginCookie = cookies.find(
        (cookie) => cookie.name === 'skLoginInfo'
      )
      expect(authCookie?.options.httpOnly).to.equal(true)
      expect(authCookie?.options.secure).to.equal(true)
      expect(authCookie?.options.maxAge).to.equal(ms('2h'))
      expect(loginCookie?.options.httpOnly).to.equal(undefined)
    } finally {
      restore()
    }
  })

  it('returns json token for login requests with application/json', async () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        secretKey: 'secret',
        users: [
          {
            username: 'user',
            type: 'admin',
            password: bcrypt.hashSync('pw', 10)
          }
        ],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      tokensecurity(app, config)

      const handler =
        findHandler(app.postHandlers, '/login') ||
        findHandler(app.postHandlers, '/signalk/v1/auth/login')

      let jsonPayload: { token?: string } | undefined
      await new Promise<void>((resolve) => {
        const req = {
          body: { username: 'user', password: 'pw' },
          get: () => 'application/json',
          secure: false,
          headers: {}
        }
        const res = {
          cookie: () => res,
          redirect: () => res,
          status: () => res,
          send: () => res,
          json: (payload: { token?: string }) => {
            jsonPayload = payload
            resolve()
            return res
          }
        }

        handler?.(req, res)
      })

      expect(jsonPayload?.token).to.be.a('string')
    } finally {
      restore()
    }
  })

  it('clears cookies on logout', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      tokensecurity(app, config)

      const handler =
        findHandler(app.putHandlers, '/logout') ||
        findHandler(app.putHandlers, '/signalk/v1/auth/logout')

      const cleared: string[] = []
      let message = ''
      const res = {
        clearCookie: (name: string) => {
          cleared.push(name)
          return res
        },
        json: (payload: string) => {
          message = payload
          return res
        }
      }

      handler?.({}, res)

      expect(cleared).to.include('JAUTHENTICATION')
      expect(cleared).to.include('skLoginInfo')
      expect(message).to.equal('Logout OK')
    } finally {
      restore()
    }
  })

  it('authorizes http requests from bearer tokens', async () => {
    const jwt = require('jsonwebtoken')
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        secretKey: 'secret',
        users: [{ username: 'alice', type: 'readwrite' }],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      tokensecurity(app, config)

      const handler = findUseHandler(app.useHandlers, '/skServer/apps')
      const token = jwt.sign({ id: 'alice' }, 'secret')

      const req = {
        headers: { authorization: `Bearer ${token}` },
        cookies: {}
      } as Record<string, unknown>
      const res = { clearCookie: () => res }

      await new Promise<void>((resolve) => {
        handler?.(req, res, () => resolve())
      })

      expect(req.skPrincipal).to.deep.equal({
        identifier: 'alice',
        permissions: 'readwrite'
      })
      expect(req.skIsAuthenticated).to.equal(true)
    } finally {
      restore()
    }
  })

  it('clears cookies on invalid bearer tokens and falls back to readonly', async () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        secretKey: 'secret',
        users: [{ username: 'alice', type: 'readwrite' }],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      tokensecurity(app, config)

      const handler = findUseHandler(app.useHandlers, '/skServer/apps')
      const cleared: string[] = []
      const req = {
        headers: { authorization: 'Bearer invalid.token' },
        cookies: {}
      } as Record<string, unknown>
      const res = {
        clearCookie: (name: string) => {
          cleared.push(name)
          return res
        }
      }

      await new Promise<void>((resolve) => {
        handler?.(req, res, () => resolve())
      })

      expect(cleared).to.include('JAUTHENTICATION')
      expect(req.skIsAuthenticated).to.equal(false)
    } finally {
      restore()
    }
  })

  it('allows readonly access when no token for non-login routes', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      tokensecurity(app, config)

      const handler = findUseHandler(app.useHandlers, '/skServer/apps')
      const req = { headers: {}, cookies: {} } as Record<string, unknown>
      const res = { status: () => res, send: () => res }
      let nextCalled = false

      handler?.(req, res, () => {
        nextCalled = true
      })

      expect(nextCalled).to.equal(true)
      expect(req.skPrincipal).to.deep.equal({
        identifier: 'AUTO',
        permissions: 'readonly'
      })
    } finally {
      restore()
    }
  })

  it('passes through login status without token', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      tokensecurity(app, config)

      const handler = findUseHandler(app.useHandlers, '/')
      const req = { headers: {}, cookies: {} } as Record<string, unknown>
      const res = { status: () => res, send: () => res, redirect: () => res }
      let nextCalled = false

      handler?.(req, res, () => {
        nextCalled = true
      })

      expect(nextCalled).to.equal(true)
      expect(req.skIsAuthenticated).to.equal(false)
    } finally {
      restore()
    }
  })

  it('returns json permission denied for readonly write attempts', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      tokensecurity(app, config)

      const handler = findHandler(app.putHandlers, '/signalk/v1/*')
      let statusCode = 0
      let jsonPayload: { error?: string } | undefined
      const req = {
        skIsAuthenticated: true,
        skPrincipal: { permissions: 'readonly' },
        accepts: (type: string) => type === 'application/json'
      }
      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        set: () => res,
        json: (payload: { error?: string }) => {
          jsonPayload = payload
          return res
        },
        type: () => res,
        send: () => res
      }

      handler?.(req, res, () => undefined)

      expect(statusCode).to.equal(401)
      expect(jsonPayload).to.deep.equal({ error: 'Permission Denied' })
    } finally {
      restore()
    }
  })

  it('verifies websocket tokens on interval', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      const req = {} as Record<string, unknown>

      strategy.verifyWS(req)
      expect(typeof req.lastTokenVerify).to.equal('number')

      let authorizeCalled = false
      strategy.authorizeWS = () => {
        authorizeCalled = true
      }
      req.lastTokenVerify = Date.now() - 61 * 1000
      strategy.verifyWS(req)

      expect(authorizeCalled).to.equal(true)
    } finally {
      restore()
    }
  })

  it('returns config without users or secret key', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        secretKey: 'secret',
        users: [{ username: 'user', type: 'admin' }],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      const result = strategy.getConfig({ ...config })

      expect(result.users).to.equal(undefined)
      expect(result.secretKey).to.equal(undefined)
    } finally {
      restore()
    }
  })

  it('updates config while preserving users, devices, and secret key', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const baseConfig = {
        allow_readonly: true,
        expiration: '1h',
        secretKey: 'secret',
        users: [{ username: 'user', type: 'admin' }],
        devices: [{ clientId: 'device-1', permissions: 'readwrite' }],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, baseConfig)
      const result = strategy.setConfig(baseConfig, {
        allow_readonly: false,
        expiration: '2h',
        secretKey: 'new',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      })

      expect(result.users).to.equal(baseConfig.users)
      expect(result.devices).to.equal(baseConfig.devices)
      expect(result.secretKey).to.equal(baseConfig.secretKey)
      expect(result.allow_readonly).to.equal(false)
    } finally {
      restore()
    }
  })

  it('rejects config updates when immutable', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const baseConfig = {
        allow_readonly: true,
        expiration: '1h',
        secretKey: 'secret',
        users: [],
        devices: [],
        immutableConfig: true,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, baseConfig)
      expect(() => {
        strategy.setConfig(baseConfig, { ...baseConfig, allow_readonly: false })
      }).to.throw('Configuration is immutable')
    } finally {
      restore()
    }
  })

  it('manages users and devices', async () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [
          {
            clientId: 'device-1',
            permissions: 'readonly',
            description: 'd',
            config: {}
          }
        ],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)

      await new Promise<void>((resolve) => {
        strategy.addUser(
          config,
          { userId: 'user', type: 'readwrite', password: 'pw' },
          () => resolve()
        )
      })
      expect(config.users).to.have.length(1)
      expect(config.users[0].password).to.not.equal('pw')

      await new Promise<void>((resolve) => {
        strategy.addUser(config, { userId: 'user2', type: 'admin' }, () =>
          resolve()
        )
      })
      expect(config.users).to.have.length(2)

      await new Promise<void>((resolve) => {
        strategy.updateUser(
          config,
          'user2',
          { type: 'readwrite', password: 'newpw' },
          () => resolve()
        )
      })
      expect(config.users[1].type).to.equal('readwrite')

      const updateError = await new Promise<Error | undefined>((resolve) => {
        strategy.updateUser(config, 'missing', { type: 'admin' }, (err) =>
          resolve(err as Error)
        )
      })
      expect(updateError?.message).to.equal('user not found')

      await new Promise<void>((resolve) => {
        strategy.setPassword(config, '0', 'pw2', () => resolve())
      })
      expect(config.users[0].password).to.not.equal('pw')

      await new Promise<void>((resolve) => {
        strategy.deleteUser(config, 'user2', () => resolve())
      })
      expect(config.users.find((u) => u.username === 'user2')).to.equal(
        undefined
      )

      await new Promise<void>((resolve) => {
        strategy.updateDevice(
          config,
          'device-1',
          { permissions: 'readwrite' },
          () => resolve()
        )
      })
      expect(config.devices[0].permissions).to.equal('readwrite')

      const deviceError = await new Promise<Error | undefined>((resolve) => {
        strategy.updateDevice(
          config,
          'missing',
          { permissions: 'readwrite' },
          (err) => resolve(err as Error)
        )
      })
      expect(deviceError?.message).to.equal('device not found')

      await new Promise<void>((resolve) => {
        strategy.deleteDevice(config, 'device-1', () => resolve())
      })
      expect(config.devices).to.have.length(0)
    } finally {
      restore()
    }
  })

  it('evaluates write and put permissions against ACLs', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [{ username: 'user', type: 'readwrite' }],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: [
          {
            context: 'vessels.*',
            resources: [
              {
                paths: ['navigation.speed'],
                permissions: [
                  { subject: 'user', permission: 'write' },
                  { subject: 'user', permission: 'put' }
                ]
              }
            ]
          }
        ]
      }

      const strategy = tokensecurity(app, config)
      const req = {
        skPrincipal: { identifier: 'user', permissions: 'readwrite' }
      } as Record<string, unknown>

      const writeAllowed = strategy.shouldAllowWrite(req, {
        context: 'vessels.self',
        updates: [{ values: [{ path: 'navigation.speed', value: 1 }] }]
      })
      expect(writeAllowed).to.equal(true)

      const writeDenied = strategy.shouldAllowWrite(req, {
        context: 'vessels.self',
        updates: [{ values: [{ path: 'navigation.course', value: 1 }] }]
      })
      expect(writeDenied).to.equal(false)

      const putAllowed = strategy.shouldAllowPut(
        req,
        'vessels.self',
        'src',
        'navigation.speed'
      )
      expect(putAllowed).to.equal(true)
    } finally {
      restore()
    }
  })

  it('reports restart and configure permissions for admin users', () => {
    const { tokensecurity, restore } = loadTokenSecurity({
      parseOIDCConfig: () => ({ enabled: false }),
      registerOIDCRoutes: () => {},
      registerOIDCAdminRoutes: () => {}
    })

    try {
      const app = createApp()
      const config = {
        allow_readonly: true,
        expiration: '1h',
        users: [],
        devices: [],
        immutableConfig: false,
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: true,
        acls: []
      }

      const strategy = tokensecurity(app, config)
      const adminReq = {
        skIsAuthenticated: true,
        skPrincipal: { permissions: 'admin' }
      }
      const readReq = {
        skIsAuthenticated: true,
        skPrincipal: { permissions: 'readonly' }
      }

      expect(strategy.allowRestart(adminReq)).to.equal(true)
      expect(strategy.allowConfigure(adminReq)).to.equal(true)
      expect(strategy.allowRestart(readReq)).to.equal(false)
      expect(strategy.allowConfigure(readReq)).to.equal(false)
    } finally {
      restore()
    }
  })
})
