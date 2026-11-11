import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStore } from './store'
import { authFetch } from './dataFetching'
import type { LoginStatus } from './store/types'

const LOGIN_STATUS_URL = '/skServer/loginStatus'

function response(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as Response
}

// Every request answers `status`, except /loginStatus, which answers
// `serverLoginStatus` as the server would for the current cookie.
function mockServer(status: number, serverLoginStatus?: LoginStatus) {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url === LOGIN_STATUS_URL && serverLoginStatus
        ? response(200, serverLoginStatus)
        : response(status)
    )
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function loginStatusRequests(fetchMock: ReturnType<typeof mockServer>) {
  return fetchMock.mock.calls.filter(([url]) => url === LOGIN_STATUS_URL).length
}

const loggedIn: LoginStatus = {
  status: 'loggedIn',
  authenticationRequired: true,
  username: 'admin',
  userLevel: 'admin',
  oidcEnabled: true,
  oidcLoginUrl: '/signalk/v1/auth/oidc/login'
}

const sessionGone: LoginStatus = {
  status: 'notLoggedIn',
  authenticationRequired: true,
  oidcEnabled: true,
  oidcLoginUrl: '/signalk/v1/auth/oidc/login'
}

describe('authFetch 401 handling', () => {
  beforeEach(() => {
    window.serverRoutesPrefix = '/skServer'
    useStore.setState({ loginStatus: { ...loggedIn } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('logs out when /loginStatus confirms the session is gone', async () => {
    mockServer(401, sessionGone)
    await authFetch('/skServer/plugins')
    const ls = useStore.getState().loginStatus
    expect(ls.status).toBe('notLoggedIn')
    expect(ls.username).toBeUndefined()
    expect(ls.authenticationRequired).toBe(true)
    expect(ls.oidcEnabled).toBe(true)
    expect(ls.oidcLoginUrl).toBe('/signalk/v1/auth/oidc/login')
  })

  it('stays logged in when a readonly user is denied an admin endpoint', async () => {
    const readonlyUser: LoginStatus = {
      ...loggedIn,
      username: 'demo',
      userLevel: 'readonly'
    }
    useStore.setState({ loginStatus: { ...readonlyUser } })
    mockServer(401, readonlyUser)
    await authFetch('/skServer/security/devices')
    const ls = useStore.getState().loginStatus
    expect(ls.status).toBe('loggedIn')
    expect(ls.username).toBe('demo')
  })

  it('stays logged in when the session check itself fails', async () => {
    const fetchMock = mockServer(401)
    await authFetch('/skServer/plugins')
    expect(loginStatusRequests(fetchMock)).toBe(1)
    expect(useStore.getState().loginStatus.status).toBe('loggedIn')
  })

  it('does not check the session on 401 from /signalk/v1/auth/login', async () => {
    const fetchMock = mockServer(401, sessionGone)
    await authFetch('/signalk/v1/auth/login', { method: 'POST' })
    expect(loginStatusRequests(fetchMock)).toBe(0)
    const ls = useStore.getState().loginStatus
    expect(ls.status).toBe('loggedIn')
    expect(ls.username).toBe('admin')
  })

  it('does not check the session on 200', async () => {
    const fetchMock = mockServer(200, sessionGone)
    await authFetch('/skServer/plugins')
    expect(loginStatusRequests(fetchMock)).toBe(0)
    expect(useStore.getState().loginStatus.status).toBe('loggedIn')
  })

  it('does not check the session when already notLoggedIn', async () => {
    useStore.setState({
      loginStatus: { status: 'notLoggedIn', authenticationRequired: true }
    })
    const fetchMock = mockServer(401, sessionGone)
    await authFetch('/skServer/plugins')
    expect(loginStatusRequests(fetchMock)).toBe(0)
  })

  it('checks the session once for concurrent 401s', async () => {
    const fetchMock = mockServer(401, sessionGone)
    await Promise.all([
      authFetch('/skServer/plugins'),
      authFetch('/skServer/webapps'),
      authFetch('/skServer/addons')
    ])
    expect(loginStatusRequests(fetchMock)).toBe(1)
    expect(useStore.getState().loginStatus.status).toBe('notLoggedIn')
  })
})
