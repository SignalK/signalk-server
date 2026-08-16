import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStore } from './store'
import { authFetch, fetchAllData, fetchAppStore } from './dataFetching'
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
  authProviders: [
    {
      id: 'oidc',
      name: 'SSO Login',
      loginUrl: '/signalk/v1/auth/oidc/login',
      autoLogin: false
    }
  ]
}

const sessionGone: LoginStatus = {
  status: 'notLoggedIn',
  authenticationRequired: true,
  authProviders: [
    {
      id: 'oidc',
      name: 'SSO Login',
      loginUrl: '/signalk/v1/auth/oidc/login',
      autoLogin: false
    }
  ]
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
    expect(ls.authProviders).toEqual(loggedIn.authProviders)
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

  it('keeps a login that happens while the session check is in flight', async () => {
    let answerLoginStatus: (r: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === LOGIN_STATUS_URL
          ? new Promise<Response>((resolve) => {
              answerLoginStatus = resolve
            })
          : Promise.resolve(response(401))
      )
    )
    const pending = authFetch('/skServer/plugins')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    useStore.setState({ loginStatus: { status: 'notLoggedIn' } })
    useStore.setState({ loginStatus: { ...loggedIn, username: 'demo' } })
    answerLoginStatus(response(200, sessionGone))
    await pending
    const ls = useStore.getState().loginStatus
    expect(ls.status).toBe('loggedIn')
    expect(ls.username).toBe('demo')
  })
})

describe('fetchAppStore', () => {
  beforeEach(() => {
    window.serverRoutesPrefix = '/skServer'
    useStore.setState({ loginStatus: { ...loggedIn } })
    useStore.getState().setAppStore({
      available: [],
      installed: [],
      updates: [],
      installing: []
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('drops an answer requested before a logout', async () => {
    let answer: (r: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve
          })
      )
    )
    const pending = fetchAppStore()
    useStore.setState({ loginStatus: { ...sessionGone } })
    answer(
      response(200, {
        available: [],
        installed: [{ name: 'installed-plugin', installedVersion: '1.0.0' }],
        updates: [],
        installing: []
      })
    )
    await pending
    expect(useStore.getState().appStore.installed).toEqual([])
  })
})

describe('fetchAllData', () => {
  beforeEach(() => {
    window.serverRoutesPrefix = '/skServer'
    useStore.setState({ loginStatus: { ...sessionGone } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps an admin store list that arrives before the login status', async () => {
    let answerLoginStatus: (r: Response) => void = () => {}
    const adminStore = {
      available: [],
      installed: [{ name: 'installed-plugin', installedVersion: '1.0.0' }],
      updates: [],
      installing: []
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === LOGIN_STATUS_URL) {
          return new Promise<Response>((resolve) => {
            answerLoginStatus = resolve
          })
        }
        if (url === '/skServer/appstore/available') {
          return Promise.resolve(response(200, adminStore))
        }
        return Promise.resolve(response(404))
      })
    )
    const pending = fetchAllData()
    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(LOGIN_STATUS_URL, expect.anything())
    )
    answerLoginStatus(response(200, loggedIn))
    await pending
    expect(useStore.getState().appStore.installed).toHaveLength(1)
  })
})
