export interface LogEntry {
  i: number
  d: string
}

export interface LogState {
  entries: LogEntry[]
  debugEnabled: string
  rememberDebug: boolean
}

export interface AppStoreState {
  updates: AppInfo[]
  installed: AppInfo[]
  available: AppInfo[]
  installing: InstallingApp[]
  storeAvailable?: boolean
  canUpdateServer?: boolean
  serverUpdate?: string
  isInDocker?: boolean
}

export interface AppInfo {
  name: string
  version?: string
  description?: string
  author?: string
  [key: string]: unknown
}

export interface InstallingApp {
  name: string
  isWaiting?: boolean
  isInstalling?: boolean
  isRemoving?: boolean
  isRemove?: boolean
  installFailed?: boolean
}

export interface LoginStatus {
  status?: 'notLoggedIn' | 'loggedIn'
  authenticationRequired?: boolean
  readOnlyAccess?: boolean
  username?: string
  securityWasEnabled?: boolean
  noUsers?: boolean
  allowNewUserRegistration?: boolean
  oidcEnabled?: boolean
  oidcLoginUrl?: string
  oidcProviderName?: string
  [key: string]: unknown
}

export interface ServerSpecification {
  endpoints?: Record<string, unknown>
  server?: {
    id?: string
    version?: string
  }
  [key: string]: unknown
}

export interface ProviderStatus {
  id: string
  enabled?: boolean
  [key: string]: unknown
}

export interface AccessRequest {
  clientId: string
  description?: string
  [key: string]: unknown
}

export interface DiscoveredProvider {
  id: string
  [key: string]: unknown
}

export interface RestoreStatus {
  state?: 'started' | 'complete' | 'failed'
  progress?: number
  [key: string]: unknown
}

export interface VesselInfo {
  name?: string
  mmsi?: string
  uuid?: string
  [key: string]: unknown
}

export interface SourcePriority {
  sourceRef: string
  timeout: string | number
}

export interface PathPriority {
  path: string
  priorities: SourcePriority[]
}

export interface SaveState {
  dirty: boolean
  timeoutsOk: boolean
  isSaving?: boolean
  saveFailed?: boolean
}

export interface SourcePrioritiesData {
  sourcePriorities: PathPriority[]
  saveState: SaveState
}

export interface BackpressureWarning {
  accumulated: number
  duration: number
  timestamp: number
}

export interface ProviderStatistics {
  deltaRate?: number
  writeRate?: number
  deltaCount?: number
  writeCount?: number
}

export interface ServerStatistics {
  deltaRate?: number
  numberOfAvailablePaths?: number
  wsClients?: number
  providerStatistics?: Record<string, ProviderStatistics>
  uptime?: number
  [key: string]: unknown
}

export interface Plugin {
  id: string
  name: string
  packageName?: string
  enabled?: boolean
  [key: string]: unknown
}

export interface Webapp {
  name: string
  description?: string
  [key: string]: unknown
}

export interface Addon {
  name: string
  [key: string]: unknown
}
