import { webSocketService } from './services/WebSocketService'
import { useStore } from './store'
import { authFetch, fetchAllData, fetchLoginStatus } from './dataFetching'

export { fetchAllData, fetchLoginStatus }

export async function logoutAction(): Promise<void> {
  try {
    const response = await authFetch('/signalk/v1/auth/logout', {
      method: 'PUT'
    })
    if (!response.ok) {
      throw new Error(response.statusText)
    }
  } catch (error) {
    console.error('Logout failed:', error)
  }
  // Reconnect WebSocket so admin event subscriptions are dropped
  webSocketService.reconnect()
  await fetchLoginStatus()
}

// Repeated clicks while the settings load share one lookup, so a late
// answer cannot reopen a dialog that was already cancelled.
let pendingRestartDialog: Promise<void> | undefined

/**
 * Ask before restarting. When the server keeps its latest values over a
 * restart, the dialog also offers to start with no data.
 */
export function restartAction(): Promise<void> {
  pendingRestartDialog ??= fetch(`${window.serverRoutesPrefix}/settings`, {
    credentials: 'include'
  })
    .then((res) => (res.ok ? res.json() : undefined))
    .then((settings) => settings?.options?.restoreOwnData)
    .then((restore) => (typeof restore === 'boolean' ? restore : undefined))
    .catch(() => undefined)
    .then((keepsData) => {
      useStore.getState().setRestartDialog({ keepsData })
    })
    .finally(() => {
      pendingRestartDialog = undefined
    })
  return pendingRestartDialog
}

export function requestRestart(keepData: boolean): void {
  fetch(`${window.serverRoutesPrefix}/restart`, {
    credentials: 'include',
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keepData })
  }).then(() => {
    useStore.getState().setRestarting(true)
  })
}

export async function loginAction(
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
  // Reconnect WebSocket so the server subscribes the new authenticated
  // connection to admin events (ACCESS_REQUEST, etc.)
  webSocketService.reconnect()
  await fetchAllData()
  return null
}

export async function enableSecurity(
  userId: string,
  password: string,
  allowReadonly?: boolean
): Promise<string | null> {
  const payload: Record<string, unknown> = {
    userId,
    password,
    type: 'admin'
  }
  if (allowReadonly) {
    payload.allow_readonly = true
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
  await fetchLoginStatus()
  return null
}

export async function disableSecurity(
  username: string,
  password: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `${window.serverRoutesPrefix}/disableSecurity`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      }
    )
    const text = await response.text()
    return response.ok ? null : text || 'Unable to disable security'
  } catch (error) {
    console.error('Disable security failed:', error)
    return 'Unable to disable security'
  }
}

export async function restoreSecurity(
  username: string,
  password: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `${window.serverRoutesPrefix}/enableSecurity`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true, username, password })
      }
    )
    const text = await response.text()
    if (!response.ok) {
      return text || 'Unable to restore security'
    }
    fetchLoginStatus().catch((err) =>
      console.error('Failed to refresh login status:', err)
    )
    return null
  } catch (error) {
    console.error('Restore security failed:', error)
    return 'Unable to restore security'
  }
}

export async function checkSecurityBackup(): Promise<boolean> {
  const response = await authFetch(
    `${window.serverRoutesPrefix}/security/hasBackup`
  )
  if (response.ok) {
    const data = await response.json()
    return data.hasBackup === true
  }
  return false
}

export async function fetchWebapps(): Promise<void> {
  try {
    const response = await authFetch(`${window.serverRoutesPrefix}/webapps`)
    if (response.status === 200) {
      const data = await response.json()
      useStore.getState().setWebapps(data)
    }
  } catch (error) {
    console.error('Failed to fetch /webapps:', error)
  }
}

export function openServerEventsConnection(isReconnect?: boolean): void {
  webSocketService.connect(isReconnect)
}

export function closeServerEventsConnection(skipReconnect = false): void {
  webSocketService.close(skipReconnect)
}

export function getWebSocketService() {
  return webSocketService
}
