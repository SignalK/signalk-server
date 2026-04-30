import { isUndefined } from 'lodash'
import { useStore } from './store'

declare global {
  interface Window {
    serverRoutesPrefix: string
  }
}

export const authFetch = (
  url: string,
  options?: RequestInit
): Promise<Response> => {
  return fetch(url, {
    ...options,
    credentials: 'include'
  })
}

export async function fetchLoginStatus(): Promise<void> {
  const response = await authFetch(`${window.serverRoutesPrefix}/loginStatus`)
  if (response.status === 200) {
    const data = await response.json()
    useStore.getState().setLoginStatus(data)
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
        `${isUndefined(prefix) ? window.serverRoutesPrefix : prefix}${endpoint}`
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
      priorities: Parameters<typeof state.setSourcePrioritiesFromServer>[0]
      defaults: Parameters<typeof state.setPriorityDefaultsFromServer>[0]
      overrides: Parameters<typeof state.setPriorityOverridesFromServer>[0]
    }>('/priorities', (data) => {
      state.setPriorityGroupsFromServer(data.groups || [])
      state.setSourcePrioritiesFromServer(data.priorities || {})
      state.setPriorityDefaultsFromServer(data.defaults || {})
      state.setPriorityOverridesFromServer(data.overrides || [])
    }),
    fetchAndSet('/sourceAliases', state.setSourceAliases),
    fetchAndSet('/ignoredInstanceConflicts', state.setIgnoredInstanceConflicts),
    fetchAndSet('/n2kDeviceStatus', state.setN2kDeviceStatus),
    fetchAndSet('/livePreferredSources', state.setLivePreferredSources)
  ])
}
