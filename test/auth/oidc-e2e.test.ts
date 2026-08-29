/*
 * End-to-end tests for the OpenID Connect login method: a real server, the
 * real openid-client strategy and an in-process identity provider. The
 * "browser" is a fetch wrapper that keeps cookies per host and follows
 * redirects by hand so every hop can be inspected.
 */
import { expect } from 'chai'
import { freeport } from '../ts-servertestutilities'
import { MockOIDCProvider } from './mock-oidc-provider'

/* eslint-disable @typescript-eslint/no-require-imports */
const { startServerP, getAdminToken } = require('../servertestutilities')
/* eslint-enable @typescript-eslint/no-require-imports */

const LOGIN_ERROR_PREFIX = '/admin/#/login?authError=true&message='

class Browser {
  private readonly jars = new Map<string, Map<string, string>>()

  cookie(url: string, name: string): string | undefined {
    return this.jars.get(new URL(url).host)?.get(name)
  }

  cookieHeader(url: string): string {
    const jar = this.jars.get(new URL(url).host)
    return jar ? [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') : ''
  }

  private store(url: string, response: Response) {
    const host = new URL(url).host
    const jar = this.jars.get(host) ?? new Map<string, string>()
    this.jars.set(host, jar)
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';')
      const [name, ...valueParts] = pair.split('=')
      const value = valueParts.join('=')
      const expired = attributes.some((a) => {
        const [k, v] = a.trim().split('=')
        return (
          (k.toLowerCase() === 'max-age' && Number(v) <= 0) ||
          (k.toLowerCase() === 'expires' && new Date(v).getTime() < Date.now())
        )
      })
      if (expired || value === '') {
        jar.delete(name.trim())
      } else {
        jar.set(name.trim(), value)
      }
    }
  }

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      headers: { ...(init.headers as object), Cookie: this.cookieHeader(url) }
    })
    this.store(url, response)
    return response
  }

  /** Follows redirects, returning every hop. Stops at the first non-redirect. */
  async navigate(url: string, maxHops = 10): Promise<Response[]> {
    const hops: Response[] = []
    let current = url
    for (let i = 0; i < maxHops; i++) {
      const response = await this.fetch(current)
      hops.push(response)
      const location = response.headers.get('location')
      if (response.status < 300 || response.status >= 400 || !location) {
        return hops
      }
      current = new URL(location, current).href
    }
    throw new Error(`more than ${maxHops} redirects starting at ${url}`)
  }
}

function location(response: Response): string {
  return response.headers.get('location') ?? ''
}

function loginErrorMessage(response: Response): string {
  const target = location(response)
  expect(target.startsWith(LOGIN_ERROR_PREFIX), target).to.equal(true)
  return decodeURIComponent(target.slice(LOGIN_ERROR_PREFIX.length))
}

describe('OpenID Connect login (e2e)', () => {
  const op = new MockOIDCProvider()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let port: number
  let sk: string
  let redirectUri: string
  let adminToken: string

  before(async () => {
    await op.start()
    port = await freeport()
    sk = `http://localhost:${port}`
    redirectUri = `${sk}/signalk/v1/auth/oidc/callback`
    server = await startServerP(
      port,
      true,
      { disableSchemaMetaDeltas: true },
      {
        users: [
          {
            username: 'legacy',
            type: 'admin',
            oidc: { sub: 'legacy-sub', issuer: op.issuer, name: 'Legacy' }
          }
        ],
        oidc: {
          enabled: true,
          issuer: op.issuer,
          clientId: op.clientId,
          clientSecret: op.clientSecret,
          redirectUri,
          scope: 'openid email profile groups',
          adminGroups: ['admins'],
          readwriteGroups: ['crew'],
          providerName: 'Test SSO'
        }
      }
    )
    adminToken = await getAdminToken(server)
  })

  after(async () => {
    await server?.stop()
    await op.stop()
  })

  beforeEach(() => op.reset())

  async function loginStatus(browser: Browser) {
    const response = await browser.fetch(`${sk}/skServer/loginStatus`)
    return (await response.json()) as Record<string, unknown>
  }

  async function users(): Promise<Array<Record<string, unknown>>> {
    const response = await fetch(`${sk}/skServer/security/users`, {
      headers: { Cookie: `JAUTHENTICATION=${adminToken}` }
    })
    return response.json()
  }

  async function login(browser: Browser, redirect = '/') {
    return browser.navigate(
      `${sk}/signalk/v1/auth/oidc/login?redirect=${encodeURIComponent(redirect)}`
    )
  }

  it('advertises the provider on loginStatus', async () => {
    const status = await loginStatus(new Browser())
    expect(status.authProviders).to.deep.equal([
      {
        id: 'oidc',
        name: 'Test SSO',
        loginUrl: '/signalk/v1/auth/oidc/login',
        autoLogin: false
      }
    ])
  })

  it('logs in a new user, maps groups to permissions and returns to the requested page', async () => {
    op.user = {
      sub: 'alice-sub',
      idTokenClaims: {
        preferred_username: 'alice',
        email: 'alice@example.com',
        name: 'Alice'
      },
      userinfoClaims: { groups: ['crew'] }
    }
    const browser = new Browser()
    const hops = await login(browser, '/admin/#/dashboard')

    const toProvider = new URL(location(hops[0]))
    expect(toProvider.origin).to.equal(op.issuer)
    expect(toProvider.pathname).to.equal('/authorize')
    expect(toProvider.searchParams.get('client_id')).to.equal(op.clientId)
    expect(toProvider.searchParams.get('redirect_uri')).to.equal(redirectUri)
    expect(toProvider.searchParams.get('code_challenge_method')).to.equal(
      'S256'
    )
    expect(toProvider.searchParams.get('code_challenge')).to.be.a('string')
    expect(toProvider.searchParams.get('nonce')).to.be.a('string')
    expect(toProvider.searchParams.get('scope')).to.include('openid')
    expect(hops[0].headers.getSetCookie().join()).to.include(
      'SK_AUTH_HANDSHAKE='
    )

    const fromProvider = new URL(location(hops[1]))
    expect(fromProvider.href.startsWith(redirectUri)).to.equal(true)
    expect(fromProvider.searchParams.get('code')).to.be.a('string')

    expect(location(hops[2])).to.equal('/admin/#/dashboard')
    expect(browser.cookie(sk, 'JAUTHENTICATION')).to.be.a('string')
    expect(browser.cookie(sk, 'SK_AUTH_HANDSHAKE')).to.equal(undefined)

    const [tokenRequest] = op.requestsTo('/token')
    expect(tokenRequest.body!.get('client_secret')).to.equal(op.clientSecret)
    expect(tokenRequest.body!.get('code_verifier')).to.be.a('string')
    expect(op.requestsTo('/userinfo')).to.have.length(1)

    const status = await loginStatus(browser)
    expect(status.status).to.equal('loggedIn')
    expect(status.username).to.equal('alice')
    expect(status.userLevel).to.equal('readwrite')

    const alice = (await users()).find((u) => u.userId === 'alice')
    expect(alice).to.deep.equal({
      userId: 'alice',
      type: 'readwrite',
      identity: {
        provider: 'oidc',
        subject: 'alice-sub',
        issuer: op.issuer,
        email: 'alice@example.com',
        name: 'Alice'
      }
    })
  })

  it('updates the permission of a known user from current groups without creating a duplicate', async () => {
    op.user = {
      sub: 'alice-sub',
      idTokenClaims: { preferred_username: 'alice' },
      userinfoClaims: { groups: ['crew'] }
    }
    await login(new Browser())
    op.user = {
      sub: 'alice-sub',
      idTokenClaims: { preferred_username: 'alice' },
      userinfoClaims: { groups: ['admins'] }
    }
    const browser = new Browser()
    await login(browser)
    const status = await loginStatus(browser)
    expect(status.username).to.equal('alice')
    expect(status.userLevel).to.equal('admin')
    expect((await users()).filter((u) => u.userId === 'alice')).to.have.length(
      1
    )
  })

  it('gives a second account with the same preferred username a distinct local name', async () => {
    op.user = {
      sub: 'alice-sub',
      idTokenClaims: { preferred_username: 'alice' }
    }
    await login(new Browser())
    op.user = {
      sub: 'bobsub123',
      idTokenClaims: { preferred_username: 'alice' }
    }
    const browser = new Browser()
    await login(browser)
    const status = await loginStatus(browser)
    expect(status.username).to.equal('alice-bobsub12')
    expect(status.userLevel).to.equal('readonly')
  })

  it('maps a record written by an earlier server version to the same identity', async () => {
    op.user = {
      sub: 'legacy-sub',
      idTokenClaims: { name: 'Legacy User' },
      userinfoClaims: { groups: ['admins'] }
    }
    const browser = new Browser()
    await login(browser)
    const status = await loginStatus(browser)
    expect(status.username).to.equal('legacy')
    expect(status.userLevel).to.equal('admin')
    const legacy = (await users()).find((u) => u.userId === 'legacy')
    expect(legacy).to.deep.equal({
      userId: 'legacy',
      type: 'admin',
      identity: {
        provider: 'oidc',
        subject: 'legacy-sub',
        issuer: op.issuer,
        name: 'Legacy User'
      }
    })
    expect(legacy).to.not.have.property('oidc')
  })

  it('ignores an unsafe redirect target', async () => {
    op.user = { sub: 'alice-sub' }
    const browser = new Browser()
    const hops = await login(browser, 'https://evil.example.com/')
    expect(location(hops[2])).to.equal('/')
  })

  it('rejects unknown identities when auto-creation is disabled', async () => {
    const setAutoCreate = (autoCreateUsers: boolean) =>
      fetch(`${sk}/skServer/security/oidc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify({
          enabled: true,
          issuer: op.issuer,
          clientId: op.clientId,
          clientSecret: op.clientSecret,
          redirectUri,
          scope: 'openid email profile groups',
          adminGroups: ['admins'],
          readwriteGroups: ['crew'],
          providerName: 'Test SSO',
          autoCreateUsers
        })
      })
    expect((await setAutoCreate(false)).status).to.equal(200)
    try {
      op.user = {
        sub: 'carol-sub',
        idTokenClaims: { preferred_username: 'carol' }
      }
      const browser = new Browser()
      const hops = await login(browser)
      expect(loginErrorMessage(hops[2])).to.equal(
        'User auto-creation is disabled'
      )
      expect(browser.cookie(sk, 'JAUTHENTICATION')).to.equal(undefined)
      expect((await users()).find((u) => u.userId === 'carol')).to.equal(
        undefined
      )
    } finally {
      expect((await setAutoCreate(true)).status).to.equal(200)
    }
  })

  it('reports a provider-side denial on the login page', async () => {
    op.denyNextAuthorization = true
    const browser = new Browser()
    const hops = await login(browser)
    expect(loginErrorMessage(hops[2])).to.equal('User denied access')
    expect(browser.cookie(sk, 'JAUTHENTICATION')).to.equal(undefined)
  })

  it('rejects a token response without an ID token', async () => {
    op.omitIdTokenOnce = true
    const browser = new Browser()
    const hops = await login(browser)
    expect(loginErrorMessage(hops[2])).to.be.a('string').that.is.not.empty
    expect(browser.cookie(sk, 'JAUTHENTICATION')).to.equal(undefined)
  })

  it('rejects a callback whose handshake cookie is missing or tampered with', async () => {
    op.user = { sub: 'alice-sub' }
    const browser = new Browser()
    const toProvider = await browser.fetch(`${sk}/signalk/v1/auth/oidc/login`)
    const fromProvider = await browser.fetch(location(toProvider))
    const callbackUrl = location(fromProvider)

    const missing = await new Browser().fetch(callbackUrl)
    expect(loginErrorMessage(missing)).to.equal(
      'Unable to verify authorization request state'
    )

    const tampered = await fetch(callbackUrl, {
      redirect: 'manual',
      headers: {
        Cookie: `SK_AUTH_HANDSHAKE=${browser.cookie(sk, 'SK_AUTH_HANDSHAKE')!.slice(0, -4)}AAAA`
      }
    })
    expect(loginErrorMessage(tampered)).to.equal(
      'Unable to verify authorization request state'
    )
  })

  it('logs out locally and at the provider', async () => {
    op.user = { sub: 'alice-sub' }
    const browser = new Browser()
    await login(browser)
    const response = await browser.fetch(
      `${sk}/signalk/v1/auth/oidc/logout?redirect=/after-logout`
    )
    expect(response.status).to.equal(302)
    const target = new URL(location(response))
    expect(target.origin + target.pathname).to.equal(`${op.issuer}/logout`)
    expect(target.searchParams.get('post_logout_redirect_uri')).to.equal(
      `${sk}/after-logout`
    )
    expect(browser.cookie(sk, 'JAUTHENTICATION')).to.equal(undefined)
    expect((await loginStatus(browser)).status).to.equal('notLoggedIn')
  })

  it('tests the provider connection through the admin API', async () => {
    const response = await fetch(`${sk}/skServer/security/oidc/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `JAUTHENTICATION=${adminToken}`
      },
      body: JSON.stringify({ issuer: op.issuer })
    })
    expect(response.status).to.equal(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.success).to.equal(true)
    expect(body.authorization_endpoint).to.equal(`${op.issuer}/authorize`)
  })

  it('returns 404 for an unknown provider', async () => {
    const response = await fetch(`${sk}/signalk/v1/auth/nope/login`, {
      redirect: 'manual'
    })
    expect(response.status).to.equal(404)
  })

  describe('a provider registered by a plugin', () => {
    let unregister: () => void

    before(() => {
      unregister = server.app.securityStrategy.registerAuthenticationProvider({
        id: 'instant',
        name: 'Instant',
        strategy: {
          name: 'instant',
          authenticate(this: { success: (user: unknown) => void }) {
            this.success({
              subject: 'instant-1',
              username: 'instant-user',
              permission: 'admin'
            })
          }
        }
      })
    })

    it('shows up on loginStatus next to the built-in one', async () => {
      const status = await loginStatus(new Browser())
      expect(
        (status.authProviders as Array<{ id: string }>).map((p) => p.id)
      ).to.deep.equal(['oidc', 'instant'])
    })

    it('logs in through the generic routes', async () => {
      const browser = new Browser()
      const hops = await browser.navigate(
        `${sk}/signalk/v1/auth/instant/login?redirect=/somewhere`
      )
      expect(location(hops[0])).to.equal('/somewhere')
      const status = await loginStatus(browser)
      expect(status.username).to.equal('instant-user')
      expect(status.userLevel).to.equal('admin')
    })

    it('is gone after the plugin unregisters it, but its users can still log out', async () => {
      const browser = new Browser()
      await browser.navigate(`${sk}/signalk/v1/auth/instant/login`)
      unregister()
      const response = await fetch(`${sk}/signalk/v1/auth/instant/login`, {
        redirect: 'manual'
      })
      expect(response.status).to.equal(404)
      const logout = await browser.fetch(
        `${sk}/signalk/v1/auth/instant/logout?redirect=/bye`
      )
      expect(location(logout)).to.equal('/bye')
      expect(browser.cookie(sk, 'JAUTHENTICATION')).to.equal(undefined)
      const status = await loginStatus(new Browser())
      expect(
        (status.authProviders as Array<{ id: string }>).map((p) => p.id)
      ).to.deep.equal(['oidc'])
    })
  })
})
