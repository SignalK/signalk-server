import { isUndefined } from 'lodash'
import type { Dispatch } from 'redux'

// Extend Window interface for serverRoutesPrefix
declare global {
  interface Window {
    serverRoutesPrefix: string
  }
}

// Action types
interface Action<T = string, D = unknown> {
  type: T
  data?: D
}

// WebSocket with custom properties
interface SignalKWebSocket extends WebSocket {
  skSelf?: string
  messageHandler?: (event: unknown) => void
}

const authFetch = (url: string, options?: RequestInit): Promise<Response> => {
  return fetch(url, {
    ...options,
    credentials: 'include'
  })
}

export function logout() {
  return (dispatch: Dispatch<Action>) => {
    dispatch({
      type: 'LOGOUT_REQUESTED'
    })
    authFetch('/signalk/v1/auth/logout', {
      method: 'PUT'
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(response.statusText)
        }
        return response
      })
      .then(() => {
        dispatch({
          type: 'LOGOUT_SUCCESS'
        })
      })
      .catch((error) => {
        dispatch({
          type: 'LOGOUT_FAILED',
          data: error
        })
      })
      .then(() => {
        fetchLoginStatus(dispatch)
      })
  }
}

export async function login(
  dispatch: Dispatch<Action>,
  username: string,
  password: string,
  rememberMe: boolean,
  callback: (error: string | null) => void
): Promise<void> {
  const payload = {
    username: username,
    password: password,
    rememberMe: rememberMe
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
    dispatch({
      type: 'LOGIN_FAILURE',
      data: response.message
    })
    callback(response.message)
  } else if (response) {
    fetchAllData(dispatch)
    dispatch({
      type: 'LOGIN_SUCCESS'
    })
    callback(null)
  }
}

export function enableSecurity(
  userId: string,
  password: string,
  callback: (error: string | null) => void
): void {
  const payload = {
    userId: userId,
    password: password,
    type: 'admin'
  }
  fetch(`${window.serverRoutesPrefix}/enableSecurity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }).then((response) => {
    if (response.status !== 200) {
      response.text().then((text) => {
        callback(text)
      })
    } else {
      callback(null)
    }
  })
}

export function restart() {
  return (dispatch: Dispatch<Action>) => {
    if (confirm('Are you sure you want to restart?')) {
      fetch(`${window.serverRoutesPrefix}/restart`, {
        credentials: 'include',
        method: 'PUT'
      }).then(() => {
        dispatch({ type: 'SERVER_RESTART' })
      })
    }
  }
}

export const buildFetchAction =
  (endpoint: string, type: string, prefix?: string) =>
  async (dispatch: Dispatch<Action>): Promise<void> => {
    const response = await authFetch(
      `${isUndefined(prefix) ? window.serverRoutesPrefix : prefix}${endpoint}`
    )

    if (response.status === 200) {
      const data = await response.json()
      dispatch({
        type,
        data
      })
    }
  }

export const fetchLoginStatus = buildFetchAction(
  '/loginStatus',
  'RECEIVE_LOGIN_STATUS'
)
export const fetchPlugins = buildFetchAction('/plugins', 'RECEIVE_PLUGIN_LIST')
export const fetchWebapps = buildFetchAction('/webapps', 'RECEIVE_WEBAPPS_LIST')
export const fetchAddons = buildFetchAction('/addons', 'RECEIVE_ADDONS_LIST')
export const fetchApps = buildFetchAction(
  '/appstore/available',
  'RECEIVE_APPSTORE_LIST'
)
export const fetchAccessRequests = buildFetchAction(
  '/security/access/requests',
  'ACCESS_REQUEST'
)
export const fetchServerSpecification = buildFetchAction(
  '/signalk',
  'RECEIVE_SERVER_SPEC',
  ''
)

export function fetchAllData(dispatch: Dispatch<Action>): void {
  fetchPlugins(dispatch)
  fetchWebapps(dispatch)
  fetchAddons(dispatch)
  fetchApps(dispatch)
  fetchLoginStatus(dispatch)
  fetchServerSpecification(dispatch)
  fetchAccessRequests(dispatch)
}

export function openServerEventsConnection(
  dispatch: Dispatch<Action>,
  isReconnect?: boolean
): void {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const ws: SignalKWebSocket = new WebSocket(
    proto +
      '://' +
      window.location.host +
      `/signalk/v1/stream?serverevents=all&subscribe=none&sendMeta=all`
  )

  ws.onmessage = function (event: MessageEvent) {
    const serverEvent = JSON.parse(event.data)

    // Check for backpressure indicator on any delta
    if (serverEvent.$backpressure) {
      dispatch({
        type: 'BACKPRESSURE_WARNING',
        data: {
          accumulated: serverEvent.$backpressure.accumulated,
          duration: serverEvent.$backpressure.duration,
          timestamp: Date.now()
        }
      })
      // Auto-clear after 10 seconds
      setTimeout(() => {
        dispatch({ type: 'BACKPRESSURE_WARNING_CLEAR' })
      }, 10000)
    }

    if (serverEvent.type) {
      dispatch(serverEvent)
    } else if (serverEvent.name) {
      ws.skSelf = serverEvent.self
    } else if (ws.messageHandler) {
      ws.messageHandler(serverEvent)
    }
  }
  ws.onclose = () => {
    console.log('closed')
    dispatch({
      type: 'WEBSOCKET_CLOSE'
    })
  }
  ws.onerror = () => {
    dispatch({
      type: 'WEBSOCKET_ERROR'
    })
  }
  ws.onopen = () => {
    console.log('connected')
    dispatch({
      type: 'WEBSOCKET_OPEN',
      data: ws
    })
    if (isReconnect) {
      window.location.reload()
    }
  }
}
