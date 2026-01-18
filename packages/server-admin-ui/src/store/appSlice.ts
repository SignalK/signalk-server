import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import escape from 'escape-html'
import Convert from 'ansi-to-html'
import type {
  RootState,
  Plugin,
  Webapp,
  Addon,
  AppStoreState,
  LoginStatus,
  ServerSpecification,
  ProviderStatus,
  AccessRequest,
  DiscoveredProvider,
  RestoreStatus,
  VesselInfo,
  BackpressureWarning,
  ServerStatistics,
  PathPriority,
  LogEntry
} from './types'

const convert = new Convert()
let logEntryCount = 0

const initialLogEntries: LogEntry[] = []
for (let i = 0; i < 100; i++) {
  initialLogEntries[i] = {
    i: logEntryCount++,
    d: ''
  }
}

const initialState: RootState = {
  plugins: [],
  webapps: [],
  addons: [],
  appStore: {
    updates: [],
    installed: [],
    available: [],
    installing: [],
    deprecated: []
  },
  loginStatus: {},
  serverSpecification: {},
  websocketStatus: 'initial',
  webSocket: null,
  restarting: false,
  accessRequests: [],
  discoveredProviders: [],
  log: {
    entries: initialLogEntries,
    debugEnabled: '',
    rememberDebug: false
  },
  restoreStatus: {},
  vesselInfo: {},
  sourcePrioritiesData: {
    sourcePriorities: [],
    saveState: {
      dirty: false,
      timeoutsOk: true
    }
  },
  backpressureWarning: null
}

function nameCollator<T extends { name: string }>(left: T, right: T): number {
  if (left.name < right.name) return -1
  if (left.name > right.name) return 1
  return 0
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    receivePluginList(state, action: PayloadAction<Plugin[]>) {
      state.plugins = action.payload
    },

    receiveWebappsList(state, action: PayloadAction<Webapp[]>) {
      state.webapps = action.payload
    },

    receiveAddonsList(state, action: PayloadAction<Addon[]>) {
      state.addons = action.payload
    },

    receiveAppStoreList(state, action: PayloadAction<AppStoreState>) {
      const apps = action.payload
      apps.installing.sort(nameCollator)
      apps.available.sort(nameCollator)
      apps.installed.sort(nameCollator)
      apps.updates.sort(nameCollator)
      apps.deprecated = apps.deprecated || []
      apps.deprecated.sort(nameCollator)
      state.appStore = apps
    },

    appStoreChanged(state, action: PayloadAction<AppStoreState>) {
      const apps = action.payload
      apps.installing.sort(nameCollator)
      apps.available.sort(nameCollator)
      apps.installed.sort(nameCollator)
      apps.updates.sort(nameCollator)
      apps.deprecated = apps.deprecated || []
      apps.deprecated.sort(nameCollator)
      state.appStore = apps
    },

    serverStatistics(state, action: PayloadAction<ServerStatistics>) {
      state.serverStatistics = action.payload
    },

    providerStatus(state, action: PayloadAction<ProviderStatus[]>) {
      action.payload.sort((l, r) => (l.id > r.id ? 1 : -1))
      state.providerStatus = action.payload
    },

    receiveLoginStatus(state, action: PayloadAction<LoginStatus>) {
      state.loginStatus = action.payload
    },

    receiveServerSpec(state, action: PayloadAction<ServerSpecification>) {
      state.serverSpecification = action.payload
    },

    websocketConnected(state) {
      state.websocketStatus = 'connected'
    },

    websocketOpen(state, action: PayloadAction<WebSocket>) {
      if (state.webSocketTimer) {
        clearInterval(state.webSocketTimer)
        state.webSocketTimer = undefined
      }
      state.restarting = false
      state.websocketStatus = 'open'
      state.webSocket = action.payload
    },

    vesselInfo(state, action: PayloadAction<VesselInfo>) {
      if (action.payload.name) {
        document.title = action.payload.name
      }
      state.vesselInfo = action.payload
    },

    websocketError(state) {
      state.websocketStatus = 'error'
    },

    websocketClose(state) {
      state.websocketStatus = 'closed'
      state.webSocket = null
    },

    setWebSocketTimer(
      state,
      action: PayloadAction<ReturnType<typeof setInterval>>
    ) {
      state.webSocketTimer = action.payload
    },

    loginSuccess(_state) {},

    serverRestart(state) {
      state.restarting = true
    },

    serverUp(state) {
      state.restarting = false
    },

    logoutRequested(_state) {},

    accessRequest(state, action: PayloadAction<AccessRequest[]>) {
      state.accessRequests = action.payload
    },

    discoveryChanged(state, action: PayloadAction<DiscoveredProvider[]>) {
      state.discoveredProviders = action.payload
    },

    debugSettings(
      state,
      action: PayloadAction<{ debugEnabled?: string; rememberDebug?: boolean }>
    ) {
      state.log = { ...state.log, ...action.payload }
    },

    log(
      state,
      action: PayloadAction<{ isError?: boolean; ts: string; row: string }>
    ) {
      const style = action.payload.isError ? 'color:red' : 'font-weight:lighter'
      const html =
        `<span style="${style}">` +
        action.payload.ts +
        '</span> ' +
        convert.toHtml(escape(action.payload.row))

      const newEntries = [...state.log.entries, { i: logEntryCount++, d: html }]
      if (newEntries.length > 100) {
        newEntries.shift()
      }
      state.log.entries = newEntries
    },

    restoreStatus(state, action: PayloadAction<RestoreStatus>) {
      state.restoreStatus = action.payload
    },

    sourcePriorities(
      state,
      action: PayloadAction<
        Record<string, { sourceRef: string; timeout: string | number }[]>
      >
    ) {
      const sourcePrioritiesMap = action.payload
      const sourcePriorities: PathPriority[] = Object.keys(
        sourcePrioritiesMap
      ).map((key) => ({
        path: key,
        priorities: sourcePrioritiesMap[key]
      }))

      state.sourcePrioritiesData = {
        sourcePriorities,
        saveState: {
          dirty: false,
          timeoutsOk: true
        }
      }
    },

    backpressureWarning(state, action: PayloadAction<BackpressureWarning>) {
      state.backpressureWarning = action.payload
    },

    backpressureWarningClear(state) {
      state.backpressureWarning = null
    }
  }
})

export const {
  receivePluginList,
  receiveWebappsList,
  receiveAddonsList,
  receiveAppStoreList,
  appStoreChanged,
  serverStatistics,
  providerStatus,
  receiveLoginStatus,
  receiveServerSpec,
  websocketConnected,
  websocketOpen,
  vesselInfo,
  websocketError,
  websocketClose,
  setWebSocketTimer,
  loginSuccess,
  serverRestart,
  serverUp,
  logoutRequested,
  accessRequest,
  discoveryChanged,
  debugSettings,
  log,
  restoreStatus,
  sourcePriorities,
  backpressureWarning,
  backpressureWarningClear
} = appSlice.actions

export default appSlice.reducer
