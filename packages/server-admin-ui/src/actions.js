const authFetch = (url, options) => {
  return fetch(url, {
    ...options,
    credentials: 'include'
  })
}

export function logout () {
  return dispatch => {
    dispatch({
      type: 'LOGOUT_REQUESTED'
    })
    authFetch('/signalk/v1/auth/logout', {
      method: 'PUT'
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(response.statusText)
        }
        return response
      })
      .then(response => {
        dispatch({
          type: 'LOGOUT_SUCCESS'
        })
      })
      .catch(error => {
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

export function login (dispatch, username, password, callback) {
  var payload = {
    username: username,
    password: password
  }
  authFetch('/signalk/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
    .then(response => {
      if (response.status != 200) {
        response.text().then(text => {
          dispatch({
            type: 'LOGIN_FAILURE',
            data: text
          })
          callback(text)
        })
      } else {
        return response.json()
      }
    })
    .then(response => {
      if (response) {
        fetchAllData(dispatch)
        dispatch({
          type: 'LOGIN_SUCCESS'
        })
        callback(null)
      }
    })
    .catch(function (error) {
      console.log(error)
    })
}

export function enableSecurity (dispatch, userId, password, callback) {
  var payload = {
    userId: userId,
    password: password,
    type: 'admin'
  }
  fetch('/enableSecurity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }).then(response => {
    if (response.status != 200) {
      response.text().then(text => {
        callback(text)
      })
    } else {
      callback(null)
    }
  })
}

export function restart () {
  return dispatch => {
    if (confirm('Are you sure you want to restart?')) {
      fetch('/restart', {
        credentials: 'include',
        method: 'PUT'
      }).then(() => {
        dispatch({ type: 'SERVER_RESTART' })
      })
    }
  }
}

// Build actions that perform a basic authFetch to the backend. Pull #514.
export const buildFetchAction = (endpoint, type) => dispatch =>
  authFetch(endpoint)
    .then(response => response.json())
    .then(data =>
      dispatch({
        type,
        data
      })
    )

export const fetchLoginStatus = buildFetchAction('/loginStatus', 'RECEIVE_LOGIN_STATUS')
export const fetchPlugins = buildFetchAction('/plugins', 'RECEIVE_PLUGIN_LIST')
export const fetchWebapps = buildFetchAction('/webapps', 'RECEIVE_WEBAPPS_LIST')
export const fetchApps = buildFetchAction('/appstore/available', 'RECEIVE_APPSTORE_LIST')
export const fetchAccessRequests = buildFetchAction('/security/access/requests', 'ACCESS_REQUEST')
export const fetchServerSpecification = buildFetchAction('/signalk', 'RECEIVE_SERVER_SPEC')

export function fetchAllData (dispatch) {
  fetchPlugins(dispatch)
  fetchWebapps(dispatch)
  fetchApps(dispatch)
  fetchLoginStatus(dispatch)
  fetchServerSpecification(dispatch),
  fetchAccessRequests(dispatch)
}

export function openServerEventsConnection (dispatch, isReconnect) {
  const proto = window.location.protocol == 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(
    proto +
      '://' +
      window.location.host +
      `/signalk/v1/stream?serverevents=all&subscribe=none`
  )

  ws.onmessage = function (event) {
    const serverEvent = JSON.parse(event.data)
    if (serverEvent.type) {
      dispatch(serverEvent)
    }
  }
  ws.onclose = () => {
    console.log('closed')
    dispatch({
      type: 'WEBSOCKET_CLOSE'
    })
  }
  ws.onerror = error => {
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
    if ( isReconnect ) {
      window.location.reload()
    }
  }
}
