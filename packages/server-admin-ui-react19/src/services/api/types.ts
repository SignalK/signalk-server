/**
 * API Types for Keeper and SignalK Server APIs
 */

export interface KeeperApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  timestamp: string
}

export interface ContainerInfo {
  id: string
  name: string
  state: 'running' | 'stopped' | 'created' | 'exited' | 'paused'
  status: string
  created: string
  startedAt?: string
  image: string
  imageId: string
  ports: Array<{
    hostPort: number
    containerPort: number
    protocol: string
  }>
  health?: {
    status: 'healthy' | 'unhealthy' | 'starting' | 'none'
    failingStreak: number
    log?: Array<{
      start: string
      end: string
      exitCode: number
      output: string
    }>
  }
}

export interface ContainerStats {
  cpu: {
    percentage: number
    system: number
    user: number
  }
  memory: {
    usage: number
    limit: number
    percentage: number
  }
  network: {
    rxBytes: number
    txBytes: number
  }
  blockIO: {
    read: number
    write: number
  }
}

export interface KeeperBackup {
  id: string
  type: 'full' | 'config' | 'plugins' | 'manual'
  created: string
  size: number
  version?: string
  description?: string
  files?: string[]
}

export interface BackupListResponse {
  backups: {
    full: KeeperBackup[]
    config: KeeperBackup[]
    plugins: KeeperBackup[]
    manual: KeeperBackup[]
  }
  totalSize: number
  availableSpace: number
}

export interface BackupSchedulerStatus {
  enabled: boolean
  schedule?: string
  nextRun?: string
  lastRun?: string
  lastResult?: 'success' | 'failed'
  retentionDays?: number
}

export interface ImageVersion {
  tag: string
  digest: string
  created: string
  size: number
  isLocal: boolean
  isCurrent?: boolean
}

export interface VersionListResponse {
  current: {
    tag: string
    digest: string
    created: string
  }
  available: ImageVersion[]
  local: ImageVersion[]
}

export interface UpdateStatus {
  state:
    | 'idle'
    | 'checking'
    | 'pulling'
    | 'backup'
    | 'switching'
    | 'verifying'
    | 'complete'
    | 'failed'
    | 'rolling_back'
  progress?: number
  message?: string
  currentStep?: string
  totalSteps?: number
  error?: string
  startedAt?: string
  completedAt?: string
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  checks: {
    podmanSocket: boolean
    signalkContainer: boolean
    networkConnectivity?: boolean
  }
  version: string
  uptime: number
}

export interface DoctorCheck {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  details?: string
}

export interface DoctorResult {
  overall: 'pass' | 'warn' | 'fail'
  checks: DoctorCheck[]
  timestamp: string
}

export interface SystemInfo {
  os: string
  arch: string
  hostname: string
  capabilities: {
    dbus: boolean
    bluetooth: boolean
    serialPorts: string[]
  }
  storage: {
    total: number
    used: number
    available: number
  }
}

export type HistoryStatus =
  | 'disabled'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

export interface HistoryContainerStatus {
  name: string
  status: 'running' | 'stopped' | 'starting' | 'error' | 'not_found'
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none'
  error?: string
}

export interface PluginStatus {
  installed: boolean
  enabled: boolean
  configured: boolean
  error?: string
}

export interface HistorySystemStatus {
  status: HistoryStatus
  influxdb: HistoryContainerStatus
  grafana: HistoryContainerStatus | null
  plugin: PluginStatus
  storageUsed?: number
  oldestDataPoint?: string
  lastError?: string
}

export interface HistorySettings {
  enabled: boolean
  grafanaEnabled: boolean
  retentionDays: number
  bucket: string
  org: string
}

export interface HistoryCredentials {
  influxUrl: string
  influxUser?: string
  influxPassword?: string
  grafanaUrl?: string
  grafanaUser?: string
  grafanaPassword?: string
  org: string
  bucket: string
}

export interface EnableHistoryRequest {
  enableGrafana?: boolean
  retentionDays?: number
  bucket?: string
  org?: string
}

export interface EnableHistoryResult {
  success: boolean
  status: HistorySystemStatus
  error?: string
  credentials?: HistoryCredentials
}
