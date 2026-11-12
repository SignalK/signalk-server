import { useStore } from './store'
import {
  GNSS_API_PATH,
  sanitizeGnssConfig
} from './store/slices/gnssPositionSlice'
import type { LoginStatus } from './store/types'

declare global {
  interface Window {
    serverRoutesPrefix: string
  }
}

const LOGIN_URL = '/signalk/v1/auth/login'

// The server answers 401 both when our cookie is no longer valid
// (typically after a reinstall regenerates `secretKey`) and when a
// logged-in user lacks the permission an endpoint needs, such as a
// readonly user on an admin-only route. Only the first is a logout, so
// a 401 makes us ask /loginStatus, which never rejects a session, and
// adopt its answer if it says we are no longer logged in; ProtectedRoute
// then renders <Login />. Concurrent 401s share one check. Skipped for
// the login endpoint itself so a bad-password attempt propagates as a
// normal 401 to loginAction.
export const authFetch = async (
  url: string,
  options?: RequestInit
): Promise<Response> => {
  const response = await fetch(url, {
    ...options,
    credentials: 'include'
  })

  if (
    response.status === 401 &&
    !isLoginUrl(url) &&
    useStore.getState().loginStatus.status === 'loggedIn'
  ) {
    await verifySession()
  }

  return response
}

let sessionCheck: Promise<void> | undefined

function verifySession(): Promise<void> {
  sessionCheck ??= checkSession().finally(() => {
    sessionCheck = undefined
  })
  return sessionCheck
}

async function checkSession(): Promise<void> {
  const checkedStatus = useStore.getState().loginStatus
  try {
    const response = await fetch(`${window.serverRoutesPrefix}/loginStatus`, {
      credentials: 'include'
    })
    if (response.status !== 200) {
      return
    }
    const data: LoginStatus = await response.json()
    // A login or logout during the check is newer than its answer.
    const { loginStatus, setLoginStatus } = useStore.getState()
    if (data.status !== 'loggedIn' && loginStatus === checkedStatus) {
      setLoginStatus(data)
    }
  } catch (error) {
    console.error('Failed to verify session after 401:', error)
  }
}

function isLoginUrl(url: string): boolean {
  const path = url.split('?')[0].split('#')[0]
  return path === LOGIN_URL || path.endsWith(LOGIN_URL)
}

export async function fetchLoginStatus(): Promise<void> {
  const response = await authFetch(`${window.serverRoutesPrefix}/loginStatus`)
  if (response.status === 200) {
    const data = await response.json()
    useStore.getState().setLoginStatus(data)
  }
}

// Re-fetch the App Store list. The server's background metadata
// hydrator populates signalk.appIcon / displayName for plugins whose
// npm search response lacks them, so the first /appstore/available
// after app load can be missing icons that become available a few
// seconds later. Re-fetching when the user lands on /apps/store
// surfaces those hydrated icons without needing a full page reload.
export async function fetchAppStore(): Promise<void> {
  // An answer for a session that logged in or out meanwhile carries the
  // wrong install state.
  const askedAs = useStore.getState().loginStatus
  try {
    const response = await authFetch(
      `${window.serverRoutesPrefix}/appstore/available`
    )
    if (response.status === 200) {
      const data = await response.json()
      const { loginStatus, setAppStore } = useStore.getState()
      if (loginStatus === askedAs) setAppStore(data)
    }
  } catch (error) {
    console.error('Failed to fetch /appstore/available:', error)
  }
}

export async function fetchAllData(): Promise<void> {
  const fetchAndSet = async <T>(
    endpoint: string,
    setter: (data: T) => void,
    prefix?: string
  ) => {
    try {
      const response = await authFetch(
        `${prefix === undefined ? window.serverRoutesPrefix : prefix}${endpoint}`
      )
      if (response.status === 200) {
        const data = await response.json()
        setter(data)
      }
    } catch (error) {
      console.error(`Failed to fetch ${endpoint}:`, error)
    }
  }

  const state = useStore.getState()

  await Promise.all([
    fetchAndSet('/plugins', state.setPlugins),
    fetchAndSet('/webapps', state.setWebapps),
    fetchAndSet('/addons', state.setAddons),
    fetchAndSet('/appstore/available', state.setAppStore),
    fetchAndSet('/loginStatus', state.setLoginStatus),
    fetchAndSet('/signalk', state.setServerSpecification, ''),
    fetchAndSet('/security/access/requests', state.setAccessRequests),
    fetchAndSet('/security/devices', state.setDevices),
    fetchAndSet('/nodeInfo', state.setNodeInfo),
    fetchAndSet('/signalk/v1/api/sources', state.setSourcesData, ''),
    fetchAndSet<{
      groups: Parameters<typeof state.setPriorityGroupsFromServer>[0]
      overrides: Parameters<typeof state.setSourcePrioritiesFromServer>[0]
      defaults: Parameters<typeof state.setPriorityDefaultsFromServer>[0]
    }>('/priorities', (data) => {
      state.setPriorityGroupsFromServer(data.groups || [])
      const overrides = data.overrides || {}
      state.setSourcePrioritiesFromServer(overrides)
      // Override-paths list is implicit in the per-path map under the
      // group-aware engine: every path with an entry is an override.
      state.setPriorityOverridesFromServer(Object.keys(overrides))
      state.setPriorityDefaultsFromServer(data.defaults || {})
    }),
    fetchAndSet('/sourceAliases', state.setSourceAliases),
    fetchAndSet('/ignoredInstanceConflicts', state.setIgnoredInstanceConflicts),
    fetchAndSet('/n2kDeviceStatus', state.setN2kDeviceStatus),
    fetchAndSet('/livePreferredSources', state.setLivePreferredSources),
    fetchAndSet('/multiSourcePaths', state.setMultiSourcePaths),
    fetchAndSet('/reconciledGroups', state.setReconciledGroups),
    fetchAndSet(
      GNSS_API_PATH,
      (data: unknown) => state.setGnssSensors(sanitizeGnssConfig(data)),
      ''
    ),
    fetchAndSet('/positionSources', state.setPositionSources)
  ])
}
