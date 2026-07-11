import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStore } from './store'
import { authFetch } from './dataFetching'
import type { LoginStatus } from './store/types'

function mockFetchStatus(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve({})
    } as Response)
  )
}

const loggedIn: LoginStatus = {
  status: 'loggedIn',
  authenticationRequired: true,
  username: 'admin',
  oidcEnabled: true,
  oidcLoginUrl: '/signalk/v1/auth/oidc/login'
}

describe('authFetch 401 handling', () => {
  beforeEach(() => {
    useStore.setState({ loginStatus: { ...loggedIn } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('flips loggedIn -> notLoggedIn on 401 from a non-login URL', async () => {
    mockFetchStatus(401)
    await authFetch('/signalk/v1/plugins')
    const ls = useStore.getState().loginStatus
    expect(ls.status).toBe('notLoggedIn')
    expect(ls.username).toBeUndefined()
    // Server settings preserved across the credential expiry.
    expect(ls.authenticationRequired).toBe(true)
    expect(ls.oidcEnabled).toBe(true)
    expect(ls.oidcLoginUrl).toBe('/signalk/v1/auth/oidc/login')
  })

  it('does not touch loginStatus on 401 from /signalk/v1/auth/login', async () => {
    mockFetchStatus(401)
    await authFetch('/signalk/v1/auth/login', { method: 'POST' })
    const ls = useStore.getState().loginStatus
    expect(ls.status).toBe('loggedIn')
    expect(ls.username).toBe('admin')
  })

  it('does not touch loginStatus on 200', async () => {
    mockFetchStatus(200)
    await authFetch('/signalk/v1/plugins')
    const ls = useStore.getState().loginStatus
    expect(ls.status).toBe('loggedIn')
    expect(ls.username).toBe('admin')
  })

  it('is a no-op when already notLoggedIn (dedup under parallel 401 storm)', async () => {
    const seed: LoginStatus = {
      status: 'notLoggedIn',
      authenticationRequired: true
    }
    useStore.setState({ loginStatus: seed })
    mockFetchStatus(401)

    await Promise.all([
      authFetch('/signalk/v1/plugins'),
      authFetch('/signalk/v1/webapps'),
      authFetch('/signalk/v1/addons')
    ])

    const ls = useStore.getState().loginStatus
    expect(ls.status).toBe('notLoggedIn')
    expect(ls.username).toBeUndefined()
    // No stale fields leaked in from the spread path (which only runs
    // when status was 'loggedIn').
    expect(Object.keys(ls).sort()).toEqual(
      ['authenticationRequired', 'status'].sort()
    )
  })
})
