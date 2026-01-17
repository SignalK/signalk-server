import {
  configureStore,
  Middleware,
  AnyAction,
  createListenerMiddleware
} from '@reduxjs/toolkit'
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux'
import appReducer, {
  websocketClose,
  websocketOpen,
  loginSuccess,
  logoutRequested
} from './appSlice'
import sourcePrioritiesReducer from './sourcePrioritiesSlice'
import type { RootState, SourcePrioritiesData } from './types'
import { openServerEventsConnection } from '../actions'

// Re-export types
export type { RootState } from './types'

// Combined state type that includes sourcePrioritiesData at the top level
// for backward compatibility with existing components
export interface AppState extends Omit<RootState, 'sourcePrioritiesData'> {
  sourcePrioritiesData: SourcePrioritiesData
}

// Create a root reducer that maintains backward compatibility
// by keeping sourcePrioritiesData at the root level
const rootReducer = (
  state: AppState | undefined,
  action: AnyAction
): AppState => {
  // First apply the app reducer
  const appState = appReducer(state as RootState, action)

  // Then apply the source priorities reducer
  const sourcePrioritiesData = sourcePrioritiesReducer(
    state?.sourcePrioritiesData,
    action
  )

  // Combine both states, with sourcePrioritiesData coming from its dedicated reducer
  // unless it was updated by the app reducer (for the SOURCEPRIORITIES action)
  return {
    ...appState,
    sourcePrioritiesData
  }
}

// WebSocket reconnection timer reference (kept outside Redux state)
let wsReconnectTimer: ReturnType<typeof setInterval> | null = null

// Listener middleware for side effects (WebSocket management)
const listenerMiddleware = createListenerMiddleware()

// Handle WebSocket close - start reconnection timer
listenerMiddleware.startListening({
  actionCreator: websocketClose,
  effect: (_action, listenerApi) => {
    if (!wsReconnectTimer) {
      wsReconnectTimer = setInterval(() => {
        console.log(`retry...`)
        openServerEventsConnection(listenerApi.dispatch, true)
      }, 5 * 1000)
    }
  }
})

// Handle WebSocket open - clear reconnection timer
listenerMiddleware.startListening({
  actionCreator: websocketOpen,
  effect: (_action, _listenerApi) => {
    if (wsReconnectTimer) {
      clearInterval(wsReconnectTimer)
      wsReconnectTimer = null
    }
  }
})

// Handle login success - reconnect WebSocket
listenerMiddleware.startListening({
  actionCreator: loginSuccess,
  effect: (_action, listenerApi) => {
    const state = listenerApi.getState() as AppState
    if (state.webSocket) {
      // Since we're closing manually, don't let the reconnect timer start
      state.webSocket.onclose =
        null as unknown as typeof state.webSocket.onclose
      state.webSocket.close()
    }
    openServerEventsConnection(listenerApi.dispatch)
  }
})

// Handle logout requested - close WebSocket
listenerMiddleware.startListening({
  actionCreator: logoutRequested,
  effect: (_action, listenerApi) => {
    const state = listenerApi.getState() as AppState
    if (state.webSocket) {
      state.webSocket.close()
    }
  }
})

// Middleware to handle legacy action types and map them to new actions
const legacyActionMiddleware: Middleware =
  (_store) => (next) => (action: AnyAction) => {
    // Map legacy action types to new action creators
    const actionTypeMap: Record<string, string> = {
      RECEIVE_PLUGIN_LIST: 'app/receivePluginList',
      RECEIVE_WEBAPPS_LIST: 'app/receiveWebappsList',
      RECEIVE_ADDONS_LIST: 'app/receiveAddonsList',
      RECEIVE_APPSTORE_LIST: 'app/receiveAppStoreList',
      APP_STORE_CHANGED: 'app/appStoreChanged',
      SERVERSTATISTICS: 'app/serverStatistics',
      PROVIDERSTATUS: 'app/providerStatus',
      RECEIVE_LOGIN_STATUS: 'app/receiveLoginStatus',
      RECEIVE_SERVER_SPEC: 'app/receiveServerSpec',
      WEBSOCKET_CONNECTED: 'app/websocketConnected',
      WEBSOCKET_OPEN: 'app/websocketOpen',
      VESSEL_INFO: 'app/vesselInfo',
      WEBSOCKET_ERROR: 'app/websocketError',
      WEBSOCKET_CLOSE: 'app/websocketClose',
      LOGIN_SUCCESS: 'app/loginSuccess',
      SERVER_RESTART: 'app/serverRestart',
      LOGOUT_REQUESTED: 'app/logoutRequested',
      ACCESS_REQUEST: 'app/accessRequest',
      DISCOVERY_CHANGED: 'app/discoveryChanged',
      DEBUG_SETTINGS: 'app/debugSettings',
      LOG: 'app/log',
      RESTORESTATUS: 'app/restoreStatus',
      SOURCEPRIORITIES: 'app/sourcePriorities',
      BACKPRESSURE_WARNING: 'app/backpressureWarning',
      BACKPRESSURE_WARNING_CLEAR: 'app/backpressureWarningClear',
      // Source priorities legacy actions
      SOURCEPRIOS_PPRIO_CHANGED: 'sourcePriorities/prioChanged',
      SOURCEPRIOS_PRIO_DELETED: 'sourcePriorities/prioDeleted',
      SOURCEPRIOS_PRIO_MOVED: 'sourcePriorities/prioMoved',
      SOURCEPRIOS_PATH_CHANGED: 'sourcePriorities/pathChanged',
      SOURCEPRIOS_PATH_DELETED: 'sourcePriorities/pathDeleted',
      SOURCEPRIOS_SAVING: 'sourcePriorities/saving',
      SOURCEPRIOS_SAVED: 'sourcePriorities/saved',
      SOURCEPRIOS_SAVE_FAILED: 'sourcePriorities/saveFailed',
      SOURCEPRIOS_SAVE_FAILED_OVER: 'sourcePriorities/saveFailedOver'
    }

    // If we have a mapping for this action type, transform it
    const newType = actionTypeMap[action.type]
    if (newType) {
      return next({ ...action, type: newType, payload: action.data })
    }

    // Handle SERVER_UP which checks action.data instead of action.type
    if (action.data === 'SERVER_UP') {
      return next({ type: 'app/serverUp' })
    }

    return next(action)
  }

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore WebSocket in state since it's not serializable
        ignoredPaths: ['webSocket', 'webSocketTimer'],
        ignoredActions: ['app/websocketOpen', 'WEBSOCKET_OPEN']
      }
    })
      .prepend(listenerMiddleware.middleware)
      .concat(legacyActionMiddleware)
})

// Export typed hooks
export type AppDispatch = typeof store.dispatch
export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector: TypedUseSelectorHook<AppState> = useSelector

// Export action creators for backward compatibility
export * from './appSlice'
export * from './sourcePrioritiesSlice'

export default store
