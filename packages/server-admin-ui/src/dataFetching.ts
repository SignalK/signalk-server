import { useStore } from './store'

declare global {
  interface Window {
    serverRoutesPrefix: string
  }
}

const LOGIN_URL = '/signalk/v1/auth/login'

// A 401 from any authenticated REST call means the server no longer
// recognises our cookie — typically after a reinstall regenerates
// `secretKey`. Flip the store into `notLoggedIn` so ProtectedRoute
// auto-renders <Login />. Skipped for the login endpoint itself so
// a bad-password attempt propagates as a normal 401 to loginAction.
// Other LoginStatus fields (authenticationRequired, oidc*, etc.) are
// server settings, not credential state — preserve them.
export const authFetch = async (
  url: string,
  options?: RequestInit
): Promise<Response> => {
  const response = await fetch(url, {
    ...options,
    credentials: 'include'
  })

  if (response.status === 401 && !isLoginUrl(url)) {
    const { loginStatus, setLoginStatus } = useStore.getState()
    if (loginStatus.status === 'loggedIn') {
      setLoginStatus({
        ...loginStatus,
        status: 'notLoggedIn',
        username: undefined
      })
    }
  }

  return response
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
  try {
    const response = await authFetch(
      `${window.serverRoutesPrefix}/appstore/available`
    )
    if (response.status === 200) {
      const data = await response.json()
      useStore.getState().setAppStore(data)
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
    fetchAndSet('/gnssSensors', state.setGnssSensors),
    fetchAndSet('/positionSources', state.setPositionSources)
  ])
}
