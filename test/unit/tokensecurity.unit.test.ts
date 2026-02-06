import { expect } from 'chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

type MockApp = {
  selfId: string
  selfContext: string
  config: { settings: Record<string, unknown> }
  use: (...args: unknown[]) => void
  post: (...args: unknown[]) => void
  put: (...args: unknown[]) => void
  emit: (_event: string, _payload: unknown) => void
  handleMessage: (...args: unknown[]) => void
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
  return {
    selfId: 'self',
    selfContext: 'vessels.self',
    config: { settings: {} },
    use: () => {},
    post: () => {},
    put: () => {},
    emit: () => {},
    handleMessage: () => {}
  }
}

const loadTokenSecurity = (oidc: MockOIDC) => {
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
})
