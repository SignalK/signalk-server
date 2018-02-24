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
    authFetch('/logout', {
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
  authFetch('/login', {
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

export function fetchLoginStatus (dispatch) {
  authFetch(`/loginStatus`)
    .then(response => response.json())
    .then(data =>
      dispatch({
        type: 'RECEIVE_LOGIN_STATUS',
        data
      })
    )
}

export function fetchPlugins (dispatch) {
  authFetch(`/plugins`)
    .then(response => response.json())
    .then(plugins =>
      dispatch({
        type: 'RECEIVE_PLUGIN_LIST',
        plugins
      })
    )
}

export function fetchWebapps (dispatch) {
  authFetch(`/webapps`)
    .then(response => response.json())
    .then(webapps =>
      dispatch({
        type: 'RECEIVE_WEBAPPS_LIST',
        webapps
      })
    )
}

export function fetchApps (dispatch) {
  authFetch(`/appstore/available`)
    .then(response => response.json())
    .then(data =>
      dispatch({
        type: 'RECEIVE_APPSTORE_LIST',
        data
      })
    )
}

export function fetchServerSpecification(dispatch) {
  authFetch(`/signalk`)
    .then(response => response.json())
    .then(data =>
      dispatch({
        type: 'RECEIVE_SERVER_SPEC',
        data
      })
    )
}

export function fetchAllData (dispatch) {
  fetchPlugins(dispatch)
  fetchWebapps(dispatch)
  fetchApps(dispatch)
  fetchLoginStatus(dispatch)
  fetchServerSpecification(dispatch)
}

export function openServerEventsConnection (dispatch) {
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
  }
}
