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
  categories?: string[]
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
  displayName?: string
  appIcon?: string
  installedIconUrl?: string
  screenshots?: string[]
  installedScreenshotUrls?: string[]
  official?: boolean
  deprecated?: boolean
  githubUrl?: string
  issuesUrl?: string
  requires?: string[]
  recommends?: string[]
  categories?: string[]
  recent?: boolean
  installedVersion?: string
  // Synthetic fields layered on by Apps.tsx when projecting the
  // AppStore state into a single per-row record. Optional because they
  // exist only after that projection runs.
  newVersion?: string
  installed?: boolean
  updateDisabled?: boolean
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
  type?: 'status' | 'warning' | 'error'
  statusType?: string
  message?: string
  lastError?: string
  lastErrorTimeStamp?: string
  timeStamp?: string
  enabled?: boolean
}

export interface AccessRequest {
  clientId: string
  description?: string
  [key: string]: unknown
}

export interface DeviceInfo {
  clientId: string
  permissions?: string
  description?: string
  requestedPermissions?: string
  tokenExpiry?: number
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

export interface NodeInfo {
  nodeVersion?: string
  npmVersion?: string
  recommendedNodeVersion?: string
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

export interface PriorityGroup {
  id: string
  sources: string[]
  // When true, the saved ranking is preserved but not enforced — paths
  // covered by this group fall back to first-come, first-served. Lets a
  // user temporarily disable a ranking without losing the order they
  // configured.
  inactive?: boolean
}

export interface PriorityGroupsData {
  groups: PriorityGroup[]
  saveState: SaveState
}

export interface PriorityDefaults {
  fallbackMs?: number
}

export interface PriorityDefaultsData {
  defaults: PriorityDefaults
  saveState: SaveState
}

export interface PriorityOverridesData {
  paths: string[]
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

export interface PresetInfo {
  name: string
  label: string
  isCustom?: boolean
  isBuiltIn?: boolean
}

export interface PresetCategoryConfig {
  targetUnit?: string
  symbol?: string
}

export interface PresetDetails {
  name?: string
  label?: string
  categories?: Record<string, PresetCategoryConfig>
}

export interface UnitConversion {
  formula?: string
  symbol?: string
}

export interface UnitDefinition {
  conversions?: Record<string, UnitConversion>
}

export type UnitDefinitions = Record<string, UnitDefinition>

export interface DefaultCategory {
  pattern: string
  category: string
}

export interface CategoryInfo {
  baseUnit?: string
  [key: string]: unknown
}

export interface GnssSensorConfig {
  sensorId: string
  $source: string
  fromBow: number | null
  fromCenter: number | null
}

export type GnssCorrectionMode = 'off' | 'replace' | 'both'

// Whether lever-arm correction can currently run, mirroring the server's
// sensors API GET `status`. `active` is true only when a mode is selected
// and both vessel length and true heading are available; `blocked` names
// the missing input otherwise.
export interface GnssCorrectionStatus {
  mode: GnssCorrectionMode
  active: boolean
  blocked?: 'no-length' | 'no-heading'
}

export interface GnssSensorsData {
  correction: GnssCorrectionMode
  sensors: GnssSensorConfig[]
  status?: GnssCorrectionStatus
  saveState: SaveState
  saveError?: string
}
