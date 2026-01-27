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
        return handleResponse<ContainerInfo>(response)
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
      ): Promise<string[]> => {
        const response = await fetch(
          `${apiUrl}/api/container/logs?lines=${lines}&source=${source}`
        )
        return handleResponse<string[]>(response)
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
        return handleResponse<BackupListResponse>(response)
      },

      create: async (options?: {
        type?: 'full' | 'config' | 'plugins'
        description?: string
      }): Promise<KeeperBackup> => {
        const response = await fetch(`${apiUrl}/api/backups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options || {})
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
          return handleResponse<BackupSchedulerStatus>(response)
        },

        update: async (
          config: Partial<BackupSchedulerStatus>
        ): Promise<BackupSchedulerStatus> => {
          const response = await fetch(`${apiUrl}/api/backups/scheduler`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
          })
          return handleResponse<BackupSchedulerStatus>(response)
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
        return handleResponse<VersionListResponse>(response)
      },

      local: async (): Promise<{
        images: ImageVersion[]
        totalSize: number
      }> => {
        const response = await fetch(`${apiUrl}/api/versions/local`)
        return handleResponse<{ images: ImageVersion[]; totalSize: number }>(
          response
        )
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
            dbus: boolean
            bluetooth: boolean
            serialPorts: string[]
          }
          storage: {
            signalkDataMB: number
            backupsMB: number
            containerImagesMB: number
          }
        }>(response)
        return {
          os: rawInfo.host.platform,
          arch: process.arch || 'unknown',
          hostname: window.location.hostname,
          capabilities: {
            dbus: rawInfo.host.dbus,
            bluetooth: rawInfo.host.bluetooth,
            serialPorts: rawInfo.host.serialPorts || []
          },
          storage: {
            total: 0,
            used:
              (rawInfo.storage.signalkDataMB +
                rawInfo.storage.backupsMB +
                rawInfo.storage.containerImagesMB) *
              1024 *
              1024,
            available: 0
          }
        }
      }
    },

    doctor: {
      preflight: async (): Promise<DoctorResult> => {
        const response = await fetch(`${apiUrl}/api/doctor/preflight`, {
          method: 'POST'
        })
        return handleResponse<DoctorResult>(response)
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
        const response = await fetch(`${apiUrl}/api/history/credentials`)
        return handleResponse<HistoryCredentials>(response)
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
