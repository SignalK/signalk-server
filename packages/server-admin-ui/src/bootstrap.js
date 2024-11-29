import React from 'react'
import ReactDOM from 'react-dom'
import { HashRouter, Route, Routes } from 'react-router'
import { Provider } from 'react-redux'
import { createStore, applyMiddleware } from 'redux'
import {thunk} from 'redux-thunk'

// Styles
// Import Font Awesome Icons Set
import 'font-awesome/css/font-awesome.min.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
// Import Simple Line Icons Set
import 'simple-line-icons/css/simple-line-icons.css'
// Import Main styles for this application
import '../scss/style.scss'
// Temp fix for reactstrap
import '../scss/core/_dropdown-menu-right.scss'

// Containers
import Full from './containers/Full/Full'

import { openServerEventsConnection } from './actions'

import { reduceSourcePriorities } from './views/ServerConfig/SourcePriorities'

import escape from 'escape-html'
import Convert from 'ansi-to-html'

const convert = new Convert()
const entries = []

let logEntryCount = 0

for (let i = 0; i < 100; i++) {
  entries[i] = {
    i: logEntryCount++,
    d: '',
  }
}

const state = {
  plugins: [],
  webapps: [],
  addons: [],
  appStore: {
    updates: [],
    installed: [],
    available: [],
    installing: [],
  },
  loginStatus: {},
  serverSpecification: {},
  websocketStatus: 'initial',
  webSocket: null,
  restarting: false,
  accessRequests: [],
  discoveredProviders: [],
  log: {
    entries,
    debugEnabled: '',
    rememberDebug: false,
  },
  restoreStatus: {},
  vesselInfo: {},
  sourcePrioritiesData: {
    sourcePriorities: [],
    saveState: {
      dirty: false,
      timeoutsOk: true,
    },
  },
}

let store = createStore(
  (state, action) => {
    if (action.type === 'RECEIVE_PLUGIN_LIST') {
      return {
        ...state,
        plugins: action.data,
      }
    }
    if (action.type === 'RECEIVE_WEBAPPS_LIST') {
      return {
        ...state,
        webapps: action.data,
      }
    }
    if (action.type === 'RECEIVE_ADDONS_LIST') {
      return {
        ...state,
        addons: action.data,
      }
    }
    if (
      action.type === 'RECEIVE_APPSTORE_LIST' ||
      action.type === 'APP_STORE_CHANGED'
    ) {
      var apps = action.data

      apps.installing.sort(nameCollator)
      apps.available.sort(nameCollator)
      apps.installed.sort(nameCollator)
      apps.updates.sort(nameCollator)

      return {
        ...state,
        appStore: apps,
      }
    }
    if (action.type === 'SERVERSTATISTICS') {
      return {
        ...state,
        serverStatistics: action.data,
      }
    }
    if (action.type === 'PROVIDERSTATUS') {
      action.data.sort((l, r) => {
        return l.id > r.id
      })
      return {
        ...state,
        providerStatus: action.data,
      }
    }
    if (action.type === 'RECEIVE_LOGIN_STATUS') {
      return {
        ...state,
        loginStatus: action.data,
      }
    }
    if (action.type === 'RECEIVE_SERVER_SPEC') {
      return {
        ...state,
        serverSpecification: action.data,
      }
    }
    if (action.type === 'WEBSOCKET_CONNECTED') {
      return {
        ...state,
        websocketStatus: 'connected',
      }
    }
    if (action.type === 'WEBSOCKET_OPEN') {
      if (state.webSocketTimer) {
        clearInterval(state.webSocketTimer)
        delete state.webSocketTimer
      }
      if (state.restarting) {
        state.restarting = false
      }
      return {
        ...state,
        websocketStatus: 'open',
        webSocket: action.data,
      }
    }
    if (action.type === 'VESSEL_INFO') {
      if (action.data.name) {
        document.title = action.data.name
      }
      return {
        ...state,
        vesselInfo: action.data,
      }
    }
    if (action.type === 'WEBSOCKET_ERROR') {
      return {
        ...state,
        websocketStatus: 'error',
      }
    }
    if (action.type === 'WEBSOCKET_CLOSE') {
      if (!state.webSocketTimer) {
        state.webSocketTimer = setInterval(() => {
          console.log(`retry...`)
          openServerEventsConnection(store.dispatch, true)
        }, 5 * 1000)
      }
      return {
        ...state,
        websocketStatus: 'closed',
        webSocket: null,
      }
    }
    if (action.type === 'LOGIN_SUCCESS') {
      if (state.webSocket) {
        // since we're closing manually, don't let the reconnect timer start
        state.webSocket.onclose = undefined
        state.webSocket.close()
      }
      openServerEventsConnection(store.dispatch)
      return state
    }
    if (action.type === 'SERVER_RESTART') {
      return {
        ...state,
        restarting: true,
      }
    }
    if (action.data === 'SERVER_UP') {
      return {
        ...state,
        restarting: false,
      }
    }
    if (action.type === 'LOGOUT_REQUESTED') {
      if (state.webSocket) {
        state.webSocket.close()
      }
    }
    if (action.type === 'ACCESS_REQUEST') {
      return {
        ...state,
        accessRequests: action.data,
      }
    }
    if (action.type === 'DISCOVERY_CHANGED') {
      return {
        ...state,
        discoveredProviders: action.data,
      }
    }
    if (action.type === 'DEBUG_SETTINGS') {
      return {
        ...state,
        log: { ...state.log, ...action.data },
      }
    }
    if (action.type === 'LOG') {
      const style = action.data.isError ? 'color:red' : 'font-weight:lighter'
      const html =
        `<span style="${style}">` +
        action.data.ts +
        '</span> ' +
        convert.toHtml(escape(action.data.row))
      state.log.entries.push({
        i: logEntryCount++,
        d: html,
      })
      if (state.log.entries.length > 100) {
        state.log.entries.shift()
      }
      return {
        ...state,
        log: {
          ...state.log,
          entries: state.log.entries,
        },
      }
    }
    if (action.type === 'RESTORESTATUS') {
      return {
        ...state,
        restoreStatus: action.data,
      }
    }
    if (action.type === 'SOURCEPRIORITIES') {
      const sourcePrioritiesMap = action.data
      const sourcePriorities = Object.keys(sourcePrioritiesMap).map((key) => ({
        path: key,
        priorities: sourcePrioritiesMap[key],
      }))
      sourcePriorities.state = {}

      return {
        ...state,
        sourcePrioritiesData: {
          sourcePriorities,
          saveState: {
            dirty: false,
            timeoutsOk: true,
          },
        },
      }
    }
    return {
      ...state,
      sourcePrioritiesData: reduceSourcePriorities(
        state.sourcePrioritiesData,
        action
      ),
    }
  },
  state,
  applyMiddleware(thunk)
)

function nameCollator(left, right) {
  if (left.name < right.name) {
    return -1
  } else if (left.name > right.name) {
    return 1
  } else {
    return 0
  }
}

window.serverRoutesPrefix = '/skServer'

// eslint-disable-next-line no-undef
__webpack_init_sharing__('default')

// eslint-disable-next-line react/no-deprecated
ReactDOM.render(
  <Provider store={store}>
  <HashRouter>
    <Routes>
        <Route path="/" name="Home" element={<Full/>} />
    </Routes>
  </HashRouter>
  </Provider>,
  document.getElementById('root')
)
