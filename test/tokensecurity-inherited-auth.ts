import { expect } from 'chai'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokenSecurityFactory = require('../dist/tokensecurity.js')

interface AuthStrategy {
  hasAdminAccess(req: object): boolean
  shouldAllowWrite(req: object, delta: object): boolean
}

function makeStrategy(): AuthStrategy {
  // setupApp() registers express routes during construction.
  const noop = () => undefined
  const app = {
    config: {},
    use: noop,
    get: noop,
    post: noop,
    put: noop,
    delete: noop
  }
  return tokenSecurityFactory(app, { secretKey: 'test-key' })
}

const ADMIN_AUTH = {
  skIsAuthenticated: true,
  skPrincipal: { identifier: 'admin', permissions: 'admin' }
}

const DELTA = {
  context: 'vessels.self',
  updates: [{ $source: 'test', values: [{ path: 'navigation.log', value: 1 }] }]
}

// A connection admitted without a token carries neither property, so a
// polluted prototype is the only place it could find them.
describe('tokensecurity with inherited authentication properties', () => {
  it('denies admin access when the properties are inherited', () => {
    const req = Object.create(ADMIN_AUTH)
    expect(makeStrategy().hasAdminAccess(req)).to.equal(false)
  })

  it('denies writes when the principal is inherited', () => {
    const req = Object.create(ADMIN_AUTH)
    expect(makeStrategy().shouldAllowWrite(req, DELTA)).to.equal(false)
  })

  it('grants admin access and writes when the properties are own', () => {
    const strategy = makeStrategy()
    const req = { ...ADMIN_AUTH }
    expect(strategy.hasAdminAccess(req)).to.equal(true)
    expect(strategy.shouldAllowWrite(req, DELTA)).to.equal(true)
  })
})
