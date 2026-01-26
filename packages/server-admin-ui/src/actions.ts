import { isUndefined } from 'lodash'
import { webSocketService } from './services/WebSocketService'
import { useStore } from './store'

// Extend Window interface for serverRoutesPrefix
declare global {
  interface Window {
    serverRoutesPrefix: string
  }
}

const authFetch = (url: string, options?: RequestInit): Promise<Response> => {
  return fetch(url, {
    ...options,
    credentials: 'include'
  })
}

/**
 * Logout action - directly updates store
 */
export async function logoutAction(): Promise<void> {
  try {
    const response = await authFetch('/signalk/v1/auth/logout', {
      method: 'PUT'
    })
    if (!response.ok) {
      throw new Error(response.statusText)
    }
    // Refetch login status after logout
    await fetchLoginStatusZustand()
  } catch (error) {
    console.error('Logout failed:', error)
    // Still try to fetch login status
    await fetchLoginStatusZustand()
  }
}

/**
 * Restart action - directly updates store
 */
export function restartAction(): void {
  if (confirm('Are you sure you want to restart?')) {
    fetch(`${window.serverRoutesPrefix}/restart`, {
      credentials: 'include',
      method: 'PUT'
    }).then(() => {
      useStore.getState().setRestarting(true)
    })
  }
}

/**
 * Login action
 */
export async function loginActionZustand(
  username: string,
  password: string,
  rememberMe: boolean
): Promise<string | null> {
  const payload = {
    username,
    password,
    rememberMe
  }
  const request = await authFetch('/signalk/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const response = await request.json()
  if (request.status !== 200) {
    return response.message
  }
  // Refetch all data after successful login
  await fetchAllDataZustand()
  return null
}

/**
 * Enable security action
 */
export async function enableSecurityZustand(
  userId: string,
  password: string
): Promise<string | null> {
  const payload = {
    userId,
    password,
    type: 'admin'
  }
  const response = await fetch(`${window.serverRoutesPrefix}/enableSecurity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  if (response.status !== 200) {
    const text = await response.text()
    return text
  }
  // Refetch login status after enabling security
  await fetchLoginStatusZustand()
  return null
}

/**
 * Fetch login status directly to Zustand store
 */
export async function fetchLoginStatusZustand(): Promise<void> {
  const response = await authFetch(`${window.serverRoutesPrefix}/loginStatus`)
  if (response.status === 200) {
    const data = await response.json()
    useStore.getState().setLoginStatus(data)
  }
}

/**
 * Fetch all data directly to Zustand store
 */
export async function fetchAllDataZustand(): Promise<void> {
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
    fetchAndSet('/security/access/requests', state.setAccessRequests)
  ])
}

/**
 * Open WebSocket connection to SignalK server
 */
export function openServerEventsConnection(isReconnect?: boolean): void {
  webSocketService.connect(isReconnect)
}

/**
 * Close the WebSocket connection
 */
export function closeServerEventsConnection(skipReconnect = false): void {
  webSocketService.close(skipReconnect)
}

/**
 * Get the WebSocket service for direct access
 */
export function getWebSocketService() {
  return webSocketService
}
