/**
 * Keeper API Client
 *
 * Client for interacting with the Keeper container management API
 * when running in Podman/Universal Installer environment.
 */

import type {
  KeeperApiResponse,
  ContainerInfo,
  ContainerStats,
  KeeperBackup,
  BackupListResponse,
  BackupSchedulerStatus,
  VersionListResponse,
  ImageVersion,
  UpdateStatus,
  HealthStatus,
  DoctorResult,
  SystemInfo,
  HistorySystemStatus,
  HistorySettings,
  HistoryCredentials,
  EnableHistoryRequest,
  EnableHistoryResult
} from './types'

export class KeeperApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message)
    this.name = 'KeeperApiError'
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text()
    let error: { code: string; message: string } | null = null
    try {
      const json = JSON.parse(text) as KeeperApiResponse<unknown>
      error = json.error || null
    } catch {
      // Response wasn't JSON
    }
    throw new KeeperApiError(
      error?.message || `HTTP ${response.status}: ${text}`,
      error?.code || 'HTTP_ERROR',
      response.status
    )
  }

  const json = (await response.json()) as KeeperApiResponse<T>
  if (!json.success) {
    throw new KeeperApiError(
      json.error?.message || 'Unknown error',
      json.error?.code || 'UNKNOWN_ERROR'
    )
  }

  return json.data as T
}

export function createKeeperApi(baseUrl: string) {
  const apiUrl = baseUrl.replace(/\/$/, '')
  console.log('[KeeperAPI] Created with baseUrl:', baseUrl, '-> apiUrl:', apiUrl)

  return {
    health: {
      check: async (): Promise<HealthStatus> => {
        const response = await fetch(`${apiUrl}/api/health`)
        return handleResponse<HealthStatus>(response)
      },

      signalk: async (): Promise<{ status: string; healthy: boolean }> => {
        const response = await fetch(`${apiUrl}/api/health/signalk`)
        return handleResponse<{ status: string; healthy: boolean }>(response)
      }
    },

    container: {
      status: async (): Promise<ContainerInfo> => {
        const response = await fetch(`${apiUrl}/api/container`)
        // Keeper returns slightly different structure, transform to expected format
        const rawContainer = await handleResponse<{
          id: string
          name: string
          status: string
          health: string
          created: string
          started?: string
          image: string
          imageId: string
          ports: Array<{
            hostPort?: number
            containerPort?: number
            protocol?: string
          }>
        }>(response)

        return {
          id: rawContainer.id,
          name: rawContainer.name,
          state: rawContainer.status as ContainerInfo['state'],
          status: rawContainer.status,
          created: rawContainer.created,
          startedAt: rawContainer.started,
          image: rawContainer.image,
          imageId: rawContainer.imageId,
          ports: rawContainer.ports.map((p) => ({
            hostPort: p.hostPort || 0,
            containerPort: p.containerPort || 0,
            protocol: p.protocol || 'tcp'
          })),
          health:
            rawContainer.health !== 'none'
              ? {
                  status: rawContainer.health as
                    | 'healthy'
                    | 'unhealthy'
                    | 'starting'
                    | 'none',
                  failingStreak: 0
                }
              : undefined
        }
      },

      stats: async (): Promise<ContainerStats> => {
        const response = await fetch(`${apiUrl}/api/container/stats`)
        // Keeper returns flat structure, transform to expected nested format
        const rawStats = await handleResponse<{
          cpuPercent: number
          memoryUsage: number
          memoryLimit: number
          memoryPercent: number
          networkRx: number
          networkTx: number
        }>(response)
        return {
          cpu: {
            percentage: rawStats.cpuPercent,
            system: 0,
            user: 0
          },
          memory: {
            usage: rawStats.memoryUsage,
            limit: rawStats.memoryLimit,
            percentage: rawStats.memoryPercent
          },
          network: {
            rxBytes: rawStats.networkRx,
            txBytes: rawStats.networkTx
          },
          blockIO: {
            read: 0,
            write: 0
          }
        }
      },

      logs: async (
        lines: number = 500,
        source: string = 'signalk'
      ): Promise<{
        lines: Array<{ timestamp: string; message: string; level: string }>
        count: number
      }> => {
        const response = await fetch(
          `${apiUrl}/api/container/logs?lines=${lines}&source=${source}`
        )
        // Keeper returns { lines: [{ timestamp, message, level }], count }
        // Strip ANSI codes from messages
        const data = await handleResponse<{
          lines: Array<{ timestamp: string; message: string; level: string }>
          count: number
        }>(response)
        return {
          ...data,
          lines: data.lines.map((l) => ({
            ...l,
            // Strip ANSI escape codes
            message: l.message.replace(/\x1b\[[0-9;]*m/g, '')
          }))
        }
      },

      start: async (): Promise<void> => {
        const response = await fetch(`${apiUrl}/api/container/start`, {
          method: 'POST'
        })
        await handleResponse<void>(response)
      },

      stop: async (): Promise<void> => {
        const response = await fetch(`${apiUrl}/api/container/stop`, {
          method: 'POST'
        })
        await handleResponse<void>(response)
      },

      restart: async (): Promise<void> => {
        const response = await fetch(`${apiUrl}/api/container/restart`, {
          method: 'POST'
        })
        await handleResponse<void>(response)
      }
    },

    backups: {
      list: async (): Promise<BackupListResponse> => {
        const response = await fetch(`${apiUrl}/api/backups`)
        // Keeper returns flat array, transform to expected grouped format
        const rawBackups = await handleResponse<{
          backups: Array<{
            id: string
            createdAt: string
            version?: { tag: string }
            type: string
            size: number
            description?: string
          }>
          storage?: {
            totalSizeBytes?: number
            availableBytes?: number
          }
        }>(response)

        // Transform each backup to expected format
        const transformBackup = (
          b: (typeof rawBackups.backups)[0]
        ): KeeperBackup => ({
          id: b.id,
          type: 'manual', // Default type for UI
          created: b.createdAt,
          size: b.size,
          version: b.version?.tag,
          description: b.description
        })

        // Group backups - put scheduled backups in "full", manual in "manual"
        const grouped: BackupListResponse['backups'] = {
          full: [],
          config: [],
          plugins: [],
          manual: []
        }

        for (const backup of rawBackups.backups) {
          const transformed = transformBackup(backup)
          // Map Keeper types to UI categories
          if (backup.type === 'manual' || backup.type === 'uploaded') {
            grouped.manual.push({ ...transformed, type: 'manual' })
          } else {
            // hourly, daily, weekly, upgrade -> treat as full backups
            grouped.full.push({ ...transformed, type: 'full' })
          }
        }

        return {
          backups: grouped,
          totalSize: rawBackups.storage?.totalSizeBytes || 0,
          availableSpace: rawBackups.storage?.availableBytes || 0
        }
      },

      create: async (options?: {
        type?: 'full' | 'config' | 'plugins'
        description?: string
      }): Promise<KeeperBackup> => {
        // Keeper expects type to be 'manual' for user-initiated backups
        // Don't send the UI's type field, just description
        const response = await fetch(`${apiUrl}/api/backups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: options?.description,
            type: 'manual'
          })
        })
        return handleResponse<KeeperBackup>(response)
      },

      download: (id: string): string => {
        return `${apiUrl}/api/backups/${id}`
      },

      upload: async (file: File): Promise<KeeperBackup> => {
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch(`${apiUrl}/api/backups/upload`, {
          method: 'POST',
          body: formData
        })
        return handleResponse<KeeperBackup>(response)
      },

      restore: async (id: string): Promise<void> => {
        const response = await fetch(`${apiUrl}/api/backups/${id}/restore`, {
          method: 'POST'
        })
        await handleResponse<void>(response)
      },

      delete: async (id: string): Promise<void> => {
        const response = await fetch(`${apiUrl}/api/backups/${id}`, {
          method: 'DELETE'
        })
        await handleResponse<void>(response)
      },

      scheduler: {
        status: async (): Promise<BackupSchedulerStatus> => {
          const response = await fetch(`${apiUrl}/api/backups/scheduler`)
          // Keeper returns different structure, transform to expected format
          const rawScheduler = await handleResponse<{
            enabled: boolean
            lastBackup?: string
            nextBackups?: {
              hourly?: string
              daily?: string
              weekly?: string
            }
          }>(response)

          // Find the earliest next backup time
          const nextTimes = Object.values(
            rawScheduler.nextBackups || {}
          ).filter(Boolean)
          const nextRun = nextTimes.length > 0 ? nextTimes.sort()[0] : undefined

          return {
            enabled: rawScheduler.enabled,
            lastRun: rawScheduler.lastBackup,
            nextRun
          }
        },

        update: async (
          config: Partial<BackupSchedulerStatus>
        ): Promise<BackupSchedulerStatus> => {
          const response = await fetch(`${apiUrl}/api/backups/scheduler`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
          })
          // Keeper returns different structure, transform to expected format
          const rawScheduler = await handleResponse<{
            enabled: boolean
            lastBackup?: string
            nextBackups?: {
              hourly?: string
              daily?: string
              weekly?: string
            }
          }>(response)

          const nextTimes = Object.values(
            rawScheduler.nextBackups || {}
          ).filter(Boolean)
          const nextRun = nextTimes.length > 0 ? nextTimes.sort()[0] : undefined

          return {
            enabled: rawScheduler.enabled,
            lastRun: rawScheduler.lastBackup,
            nextRun
          }
        }
      },

      storage: async (): Promise<{
        total: number
        used: number
        available: number
      }> => {
        const response = await fetch(`${apiUrl}/api/backups/storage`)
        return handleResponse<{
          total: number
          used: number
          available: number
        }>(response)
      }
    },

    versions: {
      list: async (): Promise<VersionListResponse> => {
        const response = await fetch(`${apiUrl}/api/versions`)
        // Keeper returns different structure, transform to expected format
        const rawVersions = await handleResponse<{
          currentVersion: {
            tag: string
            fullRef?: string
          }
          availableVersions: Array<{
            tag: string
            digest?: string
            publishedAt?: string
            size?: number
            isLocallyAvailable?: boolean
            isCurrentlyRunning?: boolean
          }>
        }>(response)

        // Also fetch local images to include in the response
        const localResponse = await fetch(`${apiUrl}/api/versions/local`)
        const rawLocal = await handleResponse<{
          images: Array<{
            id: string
            tags: string[]
            size: number
            created: string
          }>
        }>(localResponse)

        // Transform local images
        const localImages: ImageVersion[] = rawLocal.images.map((img) => {
          const tag = img.tags[0]?.split(':')[1] || 'unknown'
          return {
            tag,
            digest: img.id,
            created: img.created,
            size: img.size,
            isLocal: true,
            isCurrent: rawVersions.currentVersion.tag === tag
          }
        })

        return {
          current: {
            tag: rawVersions.currentVersion.tag,
            digest: '',
            created: ''
          },
          available: rawVersions.availableVersions.map((v) => ({
            tag: v.tag,
            digest: v.digest || '',
            created: v.publishedAt || '',
            size: v.size || 0,
            isLocal: v.isLocallyAvailable || false,
            isCurrent: v.isCurrentlyRunning || false
          })),
          local: localImages
        }
      },

      local: async (): Promise<{
        images: ImageVersion[]
        totalSize: number
      }> => {
        const response = await fetch(`${apiUrl}/api/versions/local`)
        // Keeper returns different structure, transform to expected format
        const rawLocal = await handleResponse<{
          images: Array<{
            id: string
            tags: string[]
            size: number
            created: string
          }>
          storage: {
            totalSizeBytes: number
          }
        }>(response)

        return {
          images: rawLocal.images.map((img) => ({
            tag: img.tags[0]?.split(':')[1] || 'unknown',
            digest: img.id,
            created: img.created,
            size: img.size,
            isLocal: true
          })),
          totalSize: rawLocal.storage.totalSizeBytes
        }
      },

      pull: async (tag: string): Promise<void> => {
        const response = await fetch(`${apiUrl}/api/versions/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag })
        })
        await handleResponse<void>(response)
      },

      switch: async (tag: string): Promise<void> => {
        const response = await fetch(`${apiUrl}/api/versions/switch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag })
        })
        await handleResponse<void>(response)
      },

      estimateBackup: async (
        tag: string
      ): Promise<{ size: number; duration: number }> => {
        const response = await fetch(`${apiUrl}/api/versions/${tag}/estimate`)
        return handleResponse<{ size: number; duration: number }>(response)
      }
    },

    update: {
      status: async (): Promise<UpdateStatus> => {
        const response = await fetch(`${apiUrl}/api/update/status`)
        return handleResponse<UpdateStatus>(response)
      },

      start: async (options?: { tag?: string }): Promise<void> => {
        const response = await fetch(`${apiUrl}/api/update/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options || {})
        })
        await handleResponse<void>(response)
      },

      // Returns EventSource for SSE stream
      statusStream: (
        onMessage: (status: UpdateStatus) => void
      ): EventSource => {
        const eventSource = new EventSource(
          `${apiUrl}/api/update/status/stream`
        )
        eventSource.onmessage = (event) => {
          try {
            const status = JSON.parse(event.data) as UpdateStatus
            onMessage(status)
          } catch {
            console.error('Failed to parse update status:', event.data)
          }
        }
        return eventSource
      },

      rollback: async (): Promise<void> => {
        const response = await fetch(`${apiUrl}/api/update/rollback`, {
          method: 'POST'
        })
        await handleResponse<void>(response)
      },

      reset: async (): Promise<void> => {
        const response = await fetch(`${apiUrl}/api/update/reset`, {
          method: 'POST'
        })
        await handleResponse<void>(response)
      }
    },

    system: {
      info: async (): Promise<SystemInfo> => {
        const response = await fetch(`${apiUrl}/api/system`)
        // Keeper returns different structure, transform to expected format
        const rawInfo = await handleResponse<{
          host: {
            platform: string
            arch: string
            dbus: boolean
            bluetooth: boolean
            serialPorts: string[]
          }
          storage: {
            signalkDataMB: number
            backupsMB: number
            containerImagesMB: number
            diskTotalMB: number
            diskAvailableMB: number
          }
        }>(response)
        return {
          os: rawInfo.host.platform,
          arch: rawInfo.host.arch || 'unknown',
          hostname: window.location.hostname,
          capabilities: {
            dbus: rawInfo.host.dbus,
            bluetooth: rawInfo.host.bluetooth,
            serialPorts: rawInfo.host.serialPorts || []
          },
          storage: {
            total: (rawInfo.storage.diskTotalMB || 0) * 1024 * 1024,
            used:
              ((rawInfo.storage.diskTotalMB || 0) -
                (rawInfo.storage.diskAvailableMB || 0)) *
              1024 *
              1024,
            available: (rawInfo.storage.diskAvailableMB || 0) * 1024 * 1024
          }
        }
      }
    },

    doctor: {
      preflight: async (): Promise<DoctorResult> => {
        const response = await fetch(`${apiUrl}/api/doctor/preflight`, {
          method: 'POST'
        })
        // Keeper returns different structure, transform to expected format
        const rawDoctor = await handleResponse<{
          passed: boolean
          checks: Array<{
            name: string
            passed: boolean
            blocking: boolean
            message: string
          }>
        }>(response)

        return {
          overall: rawDoctor.passed ? 'pass' : 'fail',
          checks: rawDoctor.checks.map((c) => ({
            name: c.name,
            status: c.passed ? 'pass' : c.blocking ? 'fail' : 'warn',
            message: c.message
          })),
          timestamp: new Date().toISOString()
        }
      }
    },

    settings: {
      get: async (): Promise<Record<string, unknown>> => {
        const response = await fetch(`${apiUrl}/api/settings`)
        return handleResponse<Record<string, unknown>>(response)
      },

      autostart: async (enabled: boolean): Promise<void> => {
        const response = await fetch(`${apiUrl}/api/settings/autostart`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        })
        await handleResponse<void>(response)
      }
    },

    history: {
      status: async (): Promise<HistorySystemStatus> => {
        const response = await fetch(`${apiUrl}/api/history/status`)
        return handleResponse<HistorySystemStatus>(response)
      },

      settings: async (): Promise<HistorySettings> => {
        const response = await fetch(`${apiUrl}/api/history/settings`)
        return handleResponse<HistorySettings>(response)
      },

      credentials: async (): Promise<HistoryCredentials> => {
        // Use /credentials/full to get usernames and passwords
        const response = await fetch(`${apiUrl}/api/history/credentials/full`)
        const creds = await handleResponse<HistoryCredentials>(response)

        // Transform localhost URLs for remote browser access
        const browserHost = window.location.hostname
        if (browserHost !== 'localhost' && browserHost !== '127.0.0.1') {
          if (creds.influxUrl) {
            creds.influxUrl = creds.influxUrl
              .replace('localhost', browserHost)
              .replace('127.0.0.1', browserHost)
          }
          if (creds.grafanaUrl) {
            creds.grafanaUrl = creds.grafanaUrl
              .replace('localhost', browserHost)
              .replace('127.0.0.1', browserHost)
          }
        }
        return creds
      },

      enable: async (
        options?: EnableHistoryRequest
      ): Promise<EnableHistoryResult> => {
        const response = await fetch(`${apiUrl}/api/history/enable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options || {})
        })
        return handleResponse<EnableHistoryResult>(response)
      },

      disable: async (retainData: boolean = true): Promise<void> => {
        const response = await fetch(`${apiUrl}/api/history/disable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retainData })
        })
        await handleResponse<void>(response)
      },

      updateRetention: async (
        retentionDays: number
      ): Promise<HistorySettings> => {
        const response = await fetch(`${apiUrl}/api/history/retention`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retentionDays })
        })
        return handleResponse<HistorySettings>(response)
      },

      grafana: {
        enable: async (): Promise<HistorySystemStatus> => {
          const response = await fetch(`${apiUrl}/api/history/grafana/enable`, {
            method: 'POST'
          })
          return handleResponse<HistorySystemStatus>(response)
        },

        disable: async (): Promise<HistorySystemStatus> => {
          const response = await fetch(
            `${apiUrl}/api/history/grafana/disable`,
            {
              method: 'POST'
            }
          )
          return handleResponse<HistorySystemStatus>(response)
        },

        refresh: async (): Promise<HistorySystemStatus> => {
          const response = await fetch(
            `${apiUrl}/api/history/grafana/refresh`,
            {
              method: 'POST'
            }
          )
          return handleResponse<HistorySystemStatus>(response)
        }
      }
    }
  }
}

export type KeeperApi = ReturnType<typeof createKeeperApi>
