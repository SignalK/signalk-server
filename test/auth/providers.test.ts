import { expect } from 'chai'
import {
  AuthenticationProviderRegistry,
  isExternalIdentity
} from '../../src/auth/providers'
import { isSafeRelativeUrl, loginErrorUrl } from '../../src/auth/redirect'
import { migrateLegacyIdentities, User } from '../../src/security'

const strategy = { name: 'x', authenticate: () => undefined }

describe('AuthenticationProviderRegistry', () => {
  it('lists registered providers for the login page in registration order', () => {
    const registry = new AuthenticationProviderRegistry()
    registry.register({ id: 'oidc', name: 'SSO', strategy, autoLogin: true })
    registry.register({ id: 'github', name: 'GitHub', strategy })
    expect(registry.status()).to.deep.equal([
      {
        id: 'oidc',
        name: 'SSO',
        loginUrl: '/signalk/v1/auth/oidc/login',
        autoLogin: true
      },
      {
        id: 'github',
        name: 'GitHub',
        loginUrl: '/signalk/v1/auth/github/login',
        autoLogin: false
      }
    ])
    expect(registry.get('github')?.name).to.equal('GitHub')
  })

  it('validates id, name and strategy at the boundary', () => {
    const registry = new AuthenticationProviderRegistry()
    expect(() =>
      registry.register({ id: 'Bad Id', name: 'x', strategy })
    ).to.throw(/lowercase letters/)
    expect(() => registry.register({ id: 'ok', name: ' ', strategy })).to.throw(
      /name is required/
    )
    expect(() =>
      registry.register({
        id: 'ok',
        name: 'x',
        strategy: {} as unknown as typeof strategy
      })
    ).to.throw(/passport Strategy/)
  })

  it('rejects a duplicate id and lets the unregister function remove only its own registration', () => {
    const registry = new AuthenticationProviderRegistry()
    const first = { id: 'oidc', name: 'first', strategy }
    const unregisterFirst = registry.register(first)
    expect(() =>
      registry.register({ id: 'oidc', name: 'second', strategy })
    ).to.throw(/already registered/)
    unregisterFirst()
    expect(registry.get('oidc')).to.equal(undefined)

    const unregisterSecond = registry.register({
      id: 'oidc',
      name: 'second',
      strategy
    })
    unregisterFirst() // stale: must not remove the replacement
    expect(registry.get('oidc')?.name).to.equal('second')
    unregisterSecond()
    expect(registry.status()).to.deep.equal([])
  })
})

describe('isExternalIdentity', () => {
  it('accepts the shape providers must return', () => {
    expect(isExternalIdentity({ subject: 's' })).to.equal(true)
    expect(
      isExternalIdentity({
        subject: 's',
        issuer: 'i',
        username: 'u',
        permission: 'admin',
        email: 'e',
        name: 'n'
      })
    ).to.equal(true)
  })

  it('rejects anything without a subject or with a bad permission', () => {
    expect(isExternalIdentity(null)).to.equal(false)
    expect(isExternalIdentity('sub')).to.equal(false)
    expect(isExternalIdentity({})).to.equal(false)
    expect(isExternalIdentity({ subject: '' })).to.equal(false)
    expect(isExternalIdentity({ subject: 1 })).to.equal(false)
    expect(isExternalIdentity({ subject: 's', permission: 'root' })).to.equal(
      false
    )
    expect(isExternalIdentity({ subject: 's', email: 5 })).to.equal(false)
  })
})

describe('redirect helpers', () => {
  it('accepts only same-origin relative paths', () => {
    expect(isSafeRelativeUrl('/admin/#/dashboard')).to.equal(true)
    expect(isSafeRelativeUrl('/')).to.equal(true)
    expect(isSafeRelativeUrl('//evil.example.com')).to.equal(false)
    expect(isSafeRelativeUrl('https://evil.example.com')).to.equal(false)
    expect(isSafeRelativeUrl('/a\\b')).to.equal(false)
    expect(isSafeRelativeUrl('/a\nb')).to.equal(false)
    expect(isSafeRelativeUrl('')).to.equal(false)
    expect(isSafeRelativeUrl(undefined)).to.equal(false)
  })

  it('builds the login page error URL', () => {
    expect(loginErrorUrl('User denied access')).to.equal(
      '/admin/#/login?authError=true&message=User%20denied%20access'
    )
  })
})

describe('migrateLegacyIdentities', () => {
  it('rewrites the oidc field into identity and leaves other users alone', () => {
    const users = [
      { username: 'local', type: 'admin', password: 'hash' },
      {
        username: 'sso',
        type: 'readwrite',
        oidc: {
          sub: 'sub-1',
          issuer: 'https://idp.example.com',
          email: 'sso@example.com',
          name: 'S',
          groups: ['crew']
        }
      }
    ] as User[]
    migrateLegacyIdentities(users)
    expect(users).to.deep.equal([
      { username: 'local', type: 'admin', password: 'hash' },
      {
        username: 'sso',
        type: 'readwrite',
        identity: {
          provider: 'oidc',
          subject: 'sub-1',
          issuer: 'https://idp.example.com',
          email: 'sso@example.com',
          name: 'S'
        }
      }
    ])
  })
})
