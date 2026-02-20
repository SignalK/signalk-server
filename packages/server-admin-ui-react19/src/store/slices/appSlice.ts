import type { StateCreator } from 'zustand'
import escape from 'escape-html'
import Convert from 'ansi-to-html'
import type {
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
  LogState,
  LogEntry
} from '../types'

const convert = new Convert()
let logEntryCount = 0

function createInitialLogEntries(): LogEntry[] {
  const entries: LogEntry[] = []
  for (let i = 0; i < 100; i++) {
    entries[i] = {
      i: logEntryCount++,
      d: ''
    }
  }
  return entries
}

function nameCollator<T extends { name: string }>(left: T, right: T): number {
  if (left.name < right.name) {
    return -1
  }
  if (left.name > right.name) {
    return 1
  }
  return 0
}

export interface AppSliceState {
  plugins: Plugin[]
  webapps: Webapp[]
  addons: Addon[]
  appStore: AppStoreState
  loginStatus: LoginStatus
  serverSpecification: ServerSpecification
  restarting: boolean
  accessRequests: AccessRequest[]
  discoveredProviders: DiscoveredProvider[]
  log: LogState
  restoreStatus: RestoreStatus
  vesselInfo: VesselInfo
  backpressureWarning: BackpressureWarning | null
  serverStatistics: ServerStatistics | null
  providerStatus: ProviderStatus[]
}

export interface AppSliceActions {
  setPlugins: (plugins: Plugin[]) => void
  setWebapps: (webapps: Webapp[]) => void
  setAddons: (addons: Addon[]) => void
  setAppStore: (appStore: AppStoreState) => void
  setLoginStatus: (status: LoginStatus) => void
  setServerSpecification: (spec: ServerSpecification) => void
  setServerStatistics: (stats: ServerStatistics) => void
  setProviderStatus: (status: ProviderStatus[]) => void
  setRestarting: (restarting: boolean) => void
  setAccessRequests: (requests: AccessRequest[]) => void
  setDiscoveredProviders: (providers: DiscoveredProvider[]) => void
  setRestoreStatus: (status: RestoreStatus) => void
  setVesselInfo: (info: VesselInfo) => void
  setBackpressureWarning: (warning: BackpressureWarning | null) => void
  setDebugSettings: (settings: {
    debugEnabled?: string
    rememberDebug?: boolean
  }) => void
  addLogEntry: (entry: { isError?: boolean; ts: string; row: string }) => void
  setSourcePrioritiesFromServer: (
    priorities: Record<
      string,
      { sourceRef: string; timeout: string | number }[]
    >
  ) => void
}

export type AppSlice = AppSliceState & AppSliceActions

const initialAppState: AppSliceState = {
  plugins: [],
  webapps: [],
  addons: [],
  appStore: {
    updates: [],
    installed: [],
    available: [],
    installing: []
  },
  loginStatus: {},
  serverSpecification: {},
  restarting: false,
  accessRequests: [],
  discoveredProviders: [],
  log: {
    entries: createInitialLogEntries(),
    debugEnabled: '',
    rememberDebug: false
  },
  restoreStatus: {},
  vesselInfo: {},
  backpressureWarning: null,
  serverStatistics: null,
  providerStatus: []
}

export const createAppSlice: StateCreator<AppSlice, [], [], AppSlice> = (
  set
) => ({
  ...initialAppState,

  setPlugins: (plugins) => {
    set({ plugins })
  },

  setWebapps: (webapps) => {
    set({ webapps })
  },

  setAddons: (addons) => {
    set({ addons })
  },

  setAppStore: (appStore) => {
    const sorted = {
      ...appStore,
      installing: [...appStore.installing].sort(nameCollator),
      available: [...appStore.available].sort(nameCollator),
      installed: [...appStore.installed].sort(nameCollator),
      updates: [...appStore.updates].sort(nameCollator)
    }
    set({ appStore: sorted })
  },

  setLoginStatus: (loginStatus) => {
    set({ loginStatus })
  },

  setServerSpecification: (serverSpecification) => {
    set({ serverSpecification })
  },

  setServerStatistics: (serverStatistics) => {
    set({ serverStatistics })
  },

  setProviderStatus: (status) => {
    const sorted = [...status].sort((l, r) => (l.id > r.id ? 1 : -1))
    set({ providerStatus: sorted })
  },

  setRestarting: (restarting) => {
    set({ restarting })
  },

  setAccessRequests: (accessRequests) => {
    set({ accessRequests })
  },

  setDiscoveredProviders: (discoveredProviders) => {
    set({ discoveredProviders })
  },

  setRestoreStatus: (restoreStatus) => {
    set({ restoreStatus })
  },

  setVesselInfo: (vesselInfo) => {
    if (vesselInfo.name && typeof document !== 'undefined') {
      document.title = vesselInfo.name
    }
    set({ vesselInfo })
  },

  setBackpressureWarning: (backpressureWarning) => {
    set({ backpressureWarning })
  },

  setDebugSettings: (settings) => {
    set((state) => ({
      log: { ...state.log, ...settings }
    }))
  },

  addLogEntry: (entry) => {
    set((state) => {
      const style = entry.isError ? 'color:red' : 'font-weight:lighter'
      const html =
        `<span style="${style}">` +
        entry.ts +
        '</span> ' +
        convert.toHtml(escape(entry.row))

      const newEntries = [...state.log.entries, { i: logEntryCount++, d: html }]
      if (newEntries.length > 100) {
        newEntries.shift()
      }
      return { log: { ...state.log, entries: newEntries } }
    })
  },

  setSourcePrioritiesFromServer: (sourcePrioritiesMap) => {
    const sourcePriorities: PathPriority[] = Object.keys(
      sourcePrioritiesMap
    ).map((key) => ({
      path: key,
      priorities: sourcePrioritiesMap[key]
    }))
    set((state) => ({
      ...state,
      sourcePrioritiesData: {
        sourcePriorities,
        saveState: {
          dirty: false,
          timeoutsOk: true
        }
      }
    }))
  }
})
