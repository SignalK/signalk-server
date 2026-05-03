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
  DeviceInfo,
  DiscoveredProvider,
  RestoreStatus,
  VesselInfo,
  BackpressureWarning,
  ServerStatistics,
  PathPriority,
  LogState,
  NodeInfo
} from '../types'
import type { SourcesData } from '../../utils/sourceLabels'

const convert = new Convert()
let logEntryCount = 0

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
  devices: DeviceInfo[]
  discoveredProviders: DiscoveredProvider[]
  log: LogState
  restoreStatus: RestoreStatus
  vesselInfo: VesselInfo
  backpressureWarning: BackpressureWarning | null
  serverStatistics: ServerStatistics | null
  providerStatus: ProviderStatus[]
  nodeInfo: NodeInfo
  sourcesData: SourcesData | null
  sourceAliases: Record<string, string>
  sourceAliasesLoaded: boolean
  multiSourcePaths: Record<string, string[]>
  /**
   * Reconciled priority groups: server-computed view of saved groups
   * (composition fixed by priorityGroups) plus discovery groups for
   * unsaved sources. Pushed via the RECONCILEDGROUPS server event;
   * the priority groups page renders from this directly instead of
   * recomputing from raw multiSourcePaths + saved.
   */
  reconciledGroups: Array<{
    id: string
    matchedSavedId: string | null
    inactive?: boolean
    sources: string[]
    paths: string[]
    newcomerSources: string[]
  }>
  /**
   * Live "currently winning" source per path according to the server's
   * priority engine. Keys are `${context}\0${path}`. Distinct from the
   * saved priority configuration: this reflects what the engine is
   * actually routing right now, including fallback to a lower-ranked
   * source when the configured rank-1 has been silent past its
   * timeout. Loaded once via REST and merged on each LIVEPREFERRED
   * server event.
   */
  livePreferredSources: Record<string, string>
  livePreferredSourcesLoaded: boolean
  /**
   * True once the saved priority overrides have been received from the
   * server. The Data Browser uses this to gate cache pruning so the
   * fan-out skip can rely on the saved overrides map being authoritative.
   */
  sourcePrioritiesLoaded: boolean
  ignoredInstanceConflicts: Record<string, string>
  activeConflictCount: number
  pgnDataInstances: Record<string, Record<string, number[]>>
  pgnSourceKeys: Record<string, Record<string, string[]>>
  discoveredAddresses: number[]
  n2kDeviceStatusLoaded: boolean
  sourceStatus: Record<string, { online: boolean; lastSeen?: number }>
  sourceStatusLoaded: boolean
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
  setDevices: (devices: DeviceInfo[]) => void
  setDiscoveredProviders: (providers: DiscoveredProvider[]) => void
  setRestoreStatus: (status: RestoreStatus) => void
  setVesselInfo: (info: VesselInfo) => void
  setNodeInfo: (info: NodeInfo) => void
  setBackpressureWarning: (warning: BackpressureWarning | null) => void
  setSourcesData: (data: SourcesData) => void
  setSourceAliases: (aliases: Record<string, string>) => void
  setIgnoredInstanceConflicts: (conflicts: Record<string, string>) => void
  setActiveConflictCount: (count: number) => void
  setN2kDeviceStatus: (status: {
    pgnDataInstances?: Record<string, Record<string, number[]>>
    pgnSourceKeys?: Record<string, Record<string, string[]>>
    discoveredAddresses?: number[]
    sourceStatuses?: {
      sourceRef?: string
      providerId: string
      src: string
      online: boolean
      lastSeen?: number
    }[]
  }) => void
  setMultiSourcePaths: (paths: Record<string, string[]>) => void
  setReconciledGroups: (
    groups: Array<{
      id: string
      matchedSavedId: string | null
      inactive?: boolean
      sources: string[]
      paths: string[]
      newcomerSources: string[]
    }>
  ) => void
  setLivePreferredSources: (paths: Record<string, string>) => void
  mergeLivePreferredSources: (paths: Record<string, string>) => void
  setSourceStatus: (
    statuses: {
      sourceRef?: string
      providerId: string
      src: string
      online: boolean
      lastSeen?: number
    }[]
  ) => void
  setDebugSettings: (settings: {
    debugEnabled?: string
    rememberDebug?: boolean
  }) => void
  addLogEntry: (entry: { isError?: boolean; ts: string; row: string }) => void
  clearLogEntries: () => void
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
  devices: [],
  discoveredProviders: [],
  log: {
    entries: [],
    debugEnabled: '',
    rememberDebug: false
  },
  restoreStatus: {},
  vesselInfo: {},
  backpressureWarning: null,
  serverStatistics: null,
  providerStatus: [],
  nodeInfo: {},
  sourcesData: null,
  sourceAliases: {},
  sourceAliasesLoaded: false,
  multiSourcePaths: {},
  reconciledGroups: [],
  livePreferredSources: {},
  livePreferredSourcesLoaded: false,
  sourcePrioritiesLoaded: false,
  ignoredInstanceConflicts: {},
  activeConflictCount: 0,
  pgnDataInstances: {},
  pgnSourceKeys: {},
  discoveredAddresses: [],
  n2kDeviceStatusLoaded: false,
  sourceStatus: {},
  sourceStatusLoaded: false
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

  setDevices: (devices) => {
    set({ devices })
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

  setNodeInfo: (nodeInfo) => {
    set({ nodeInfo })
  },

  setBackpressureWarning: (backpressureWarning) => {
    set({ backpressureWarning })
  },

  setSourcesData: (sourcesData) => {
    set({ sourcesData })
  },

  setSourceAliases: (sourceAliases) => {
    set({ sourceAliases, sourceAliasesLoaded: true })
  },

  setIgnoredInstanceConflicts: (ignoredInstanceConflicts) => {
    set({ ignoredInstanceConflicts })
  },

  setActiveConflictCount: (activeConflictCount) => {
    set({ activeConflictCount })
  },

  setN2kDeviceStatus: (status) => {
    // The bootstrap GET /n2kDeviceStatus carries sourceStatuses; the
    // WS-pushed N2KDEVICESTATUS event omits it (SOURCESTATUS is its
    // own channel). Only refresh sourceStatus when the field is
    // actually present — otherwise we'd flash every source to
    // "unknown" on every WS push.
    const patch: Partial<{
      pgnDataInstances: Record<string, Record<string, number[]>>
      pgnSourceKeys: Record<string, Record<string, string[]>>
      discoveredAddresses: number[]
      n2kDeviceStatusLoaded: boolean
      sourceStatus: Record<string, { online: boolean; lastSeen?: number }>
      sourceStatusLoaded: boolean
    }> = {
      pgnDataInstances: status.pgnDataInstances ?? {},
      pgnSourceKeys: status.pgnSourceKeys ?? {},
      discoveredAddresses: status.discoveredAddresses ?? [],
      n2kDeviceStatusLoaded: true
    }
    if (status.sourceStatuses) {
      const sourceStatus: Record<
        string,
        { online: boolean; lastSeen?: number }
      > = {}
      for (const s of status.sourceStatuses) {
        const key = s.sourceRef ?? `${s.providerId}.${s.src}`
        sourceStatus[key] = { online: s.online, lastSeen: s.lastSeen }
      }
      patch.sourceStatus = sourceStatus
      patch.sourceStatusLoaded = true
    }
    set(patch)
  },

  setMultiSourcePaths: (multiSourcePaths) => {
    set({ multiSourcePaths })
  },

  setReconciledGroups: (reconciledGroups) => {
    set({ reconciledGroups })
  },

  setLivePreferredSources: (livePreferredSources) => {
    set({ livePreferredSources, livePreferredSourcesLoaded: true })
  },

  // Server emits only the paths whose winner CHANGED since the last
  // tick, so we merge over the existing snapshot instead of replacing.
  // The full snapshot is loaded once via REST at startup.
  // Empty-string values are tombstones: the server signalled that the
  // entry was deleted (e.g. its parent group was deactivated and the
  // path is now pass-through). Without this the stale winner would
  // persist in the merged map and the Data Browser's "Priority
  // filtered" view would keep suppressing every other source on that
  // path.
  mergeLivePreferredSources: (changes) => {
    set((state) => {
      const next = { ...state.livePreferredSources }
      for (const [key, ref] of Object.entries(changes)) {
        if (ref === '') {
          delete next[key]
        } else {
          next[key] = ref
        }
      }
      return {
        livePreferredSources: next,
        livePreferredSourcesLoaded: true
      }
    })
  },

  setSourceStatus: (statuses) => {
    // Replace rather than merge. The server emits a full snapshot on
    // every transition; merging would preserve refs the server has
    // intentionally removed (e.g. via /n2kRemoveSource or a device
    // reset), leaving deleted devices permanently online/offline in
    // the client store. With buildSourceStatuses now also surfacing
    // frame-only devices (via frameLastSeenBySrc), the snapshot is
    // authoritative — a sourceRef that disappears really is gone.
    const sourceStatus: Record<string, { online: boolean; lastSeen?: number }> =
      {}
    for (const s of statuses) {
      // Prefer the canonical sourceRef field; fall back to providerId+src
      // for older server payloads that didn't include it.
      const key = s.sourceRef ?? `${s.providerId}.${s.src}`
      sourceStatus[key] = {
        online: s.online,
        lastSeen: s.lastSeen
      }
    }
    set({ sourceStatus, sourceStatusLoaded: true })
  },

  setDebugSettings: (settings) => {
    set((state) => ({
      log: { ...state.log, ...settings }
    }))
  },

  clearLogEntries: () => {
    set((state) => ({ log: { ...state.log, entries: [] } }))
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
      },
      sourcePrioritiesLoaded: true
    }))
  }
})
