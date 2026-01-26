/**
 * Unified API Service Layer
 *
 * Provides a unified API that automatically routes requests to either
 * the SignalK Server API or Keeper API based on the runtime environment.
 */

import { createKeeperApi, type KeeperApi, KeeperApiError } from './keeper'
import { createSignalkApi, type SignalkApi } from './signalk'

export { KeeperApiError }
export type { KeeperApi, SignalkApi }
export * from './types'

export interface RuntimeConfig {
  containerRuntime: string | null
  keeperUrl: string | null
  useKeeper: boolean
}

let keeperApi: KeeperApi | null = null
let signalkApi: SignalkApi | null = null
let runtimeConfig: RuntimeConfig = {
  containerRuntime: null,
  keeperUrl: null,
  useKeeper: false
}

/**
 * Initialize the API layer with runtime configuration.
 * Call this once when the app store data is loaded.
 */
export function initializeApi(config: Partial<RuntimeConfig>): void {
  runtimeConfig = {
    containerRuntime: config.containerRuntime ?? null,
    keeperUrl: config.keeperUrl ?? null,
    useKeeper: config.useKeeper ?? false
  }

  signalkApi = createSignalkApi()

  if (runtimeConfig.useKeeper && runtimeConfig.keeperUrl) {
    keeperApi = createKeeperApi(runtimeConfig.keeperUrl)
  }
}

/**
 * Get the current runtime configuration
 */
export function getRuntimeConfig(): RuntimeConfig {
  return { ...runtimeConfig }
}

/**
 * Check if Keeper API should be used
 */
export function shouldUseKeeper(): boolean {
  return runtimeConfig.useKeeper && keeperApi !== null
}

/**
 * Get the Keeper API instance (throws if not available)
 */
export function getKeeperApi(): KeeperApi {
  if (!keeperApi) {
    throw new Error('Keeper API not initialized or not available')
  }
  return keeperApi
}

/**
 * Get the SignalK API instance
 */
export function getSignalkApi(): SignalkApi {
  if (!signalkApi) {
    signalkApi = createSignalkApi()
  }
  return signalkApi
}

/**
 * Unified Server API
 *
 * Routes calls to either Keeper or SignalK Server based on runtime.
 */
export const serverApi = {
  /**
   * Restart the server/container
   */
  restart: async (): Promise<void> => {
    if (shouldUseKeeper()) {
      await getKeeperApi().container.restart()
    } else {
      await getSignalkApi().restart()
    }
  },

  /**
   * Get container/server status (Keeper only)
   */
  getStatus: async () => {
    if (shouldUseKeeper()) {
      return getKeeperApi().container.status()
    }
    return null
  },

  /**
   * Get container stats (Keeper only)
   */
  getStats: async () => {
    if (shouldUseKeeper()) {
      return getKeeperApi().container.stats()
    }
    return null
  }
}

/**
 * Unified Backup API
 */
export const backupApi = {
  /**
   * List all backups
   * - Keeper: Returns structured backup list with types
   * - SignalK: Not supported (single download only)
   */
  list: async () => {
    if (shouldUseKeeper()) {
      return getKeeperApi().backups.list()
    }
    return null
  },

  /**
   * Create a new backup
   * - Keeper: Creates backup via API
   * - SignalK: Returns download URL
   */
  create: async (options?: {
    type?: 'full' | 'config' | 'plugins'
    description?: string
    includePlugins?: boolean
  }) => {
    if (shouldUseKeeper()) {
      return getKeeperApi().backups.create({
        type: options?.type,
        description: options?.description
      })
    }
    // For SignalK, return the download URL
    return {
      downloadUrl: getSignalkApi().backup.download(
        options?.includePlugins ?? true
      )
    }
  },

  /**
   * Get download URL for a backup
   */
  getDownloadUrl: (id?: string, includePlugins?: boolean): string => {
    if (shouldUseKeeper() && id) {
      return getKeeperApi().backups.download(id)
    }
    return getSignalkApi().backup.download(includePlugins ?? true)
  },

  /**
   * Upload a backup file for restore
   */
  upload: async (file: File) => {
    if (shouldUseKeeper()) {
      return getKeeperApi().backups.upload(file)
    }
    return getSignalkApi().backup.validate(file)
  },

  /**
   * Restore from a backup
   */
  restore: async (idOrFiles: string | string[]) => {
    if (shouldUseKeeper()) {
      if (typeof idOrFiles === 'string') {
        await getKeeperApi().backups.restore(idOrFiles)
      } else {
        throw new Error('Keeper restore requires backup ID, not file list')
      }
    } else {
      if (Array.isArray(idOrFiles)) {
        await getSignalkApi().backup.restore(idOrFiles)
      } else {
        throw new Error('SignalK restore requires file list, not backup ID')
      }
    }
  },

  /**
   * Delete a backup (Keeper only)
   */
  delete: async (id: string) => {
    if (shouldUseKeeper()) {
      await getKeeperApi().backups.delete(id)
    } else {
      throw new Error('Backup deletion not supported without Keeper')
    }
  },

  /**
   * Get/update backup scheduler (Keeper only)
   */
  scheduler: {
    status: async () => {
      if (shouldUseKeeper()) {
        return getKeeperApi().backups.scheduler.status()
      }
      return null
    },

    update: async (config: {
      enabled?: boolean
      schedule?: string
      retentionDays?: number
    }) => {
      if (shouldUseKeeper()) {
        return getKeeperApi().backups.scheduler.update(config)
      }
      throw new Error('Backup scheduling not supported without Keeper')
    }
  },

  /**
   * Get storage info (Keeper only)
   */
  storage: async () => {
    if (shouldUseKeeper()) {
      return getKeeperApi().backups.storage()
    }
    return null
  }
}

/**
 * Unified Update API
 */
export const updateApi = {
  /**
   * List available versions
   */
  listVersions: async () => {
    if (shouldUseKeeper()) {
      return getKeeperApi().versions.list()
    }
    // For SignalK, version info is in appStore
    return null
  },

  /**
   * Get update status
   */
  status: async () => {
    if (shouldUseKeeper()) {
      return getKeeperApi().update.status()
    }
    return null
  },

  /**
   * Start an update
   */
  start: async (version?: string) => {
    if (shouldUseKeeper()) {
      await getKeeperApi().update.start({ tag: version })
    } else {
      if (!version) {
        throw new Error('Version required for SignalK update')
      }
      await getSignalkApi().update.install(version)
    }
  },

  /**
   * Subscribe to update progress (Keeper only)
   */
  subscribeProgress: (
    onStatus: (status: import('./types').UpdateStatus) => void
  ): EventSource | null => {
    if (shouldUseKeeper()) {
      return getKeeperApi().update.statusStream(onStatus)
    }
    return null
  },

  /**
   * Rollback update (Keeper only)
   */
  rollback: async () => {
    if (shouldUseKeeper()) {
      await getKeeperApi().update.rollback()
    } else {
      throw new Error('Rollback not supported without Keeper')
    }
  },

  /**
   * Pull a specific version (Keeper only)
   */
  pullVersion: async (tag: string) => {
    if (shouldUseKeeper()) {
      await getKeeperApi().versions.pull(tag)
    } else {
      throw new Error('Version pull not supported without Keeper')
    }
  },

  /**
   * Switch to a specific version (Keeper only)
   */
  switchVersion: async (tag: string) => {
    if (shouldUseKeeper()) {
      await getKeeperApi().versions.switch(tag)
    } else {
      throw new Error('Version switch not supported without Keeper')
    }
  }
}

/**
 * Health/Doctor API (primarily Keeper)
 */
export const healthApi = {
  /**
   * Check overall health
   */
  check: async () => {
    if (shouldUseKeeper()) {
      return getKeeperApi().health.check()
    }
    return null
  },

  /**
   * Check SignalK container health
   */
  signalkHealth: async () => {
    if (shouldUseKeeper()) {
      return getKeeperApi().health.signalk()
    }
    return null
  },

  /**
   * Run doctor/preflight checks
   */
  runDoctor: async () => {
    if (shouldUseKeeper()) {
      return getKeeperApi().doctor.preflight()
    }
    return null
  },

  /**
   * Get system info
   */
  systemInfo: async () => {
    if (shouldUseKeeper()) {
      return getKeeperApi().system.info()
    }
    return null
  }
}

/**
 * History (InfluxDB + Grafana) API (Keeper only)
 */
export const historyApi = {
  /**
   * Get history system status
   */
  status: async () => {
    if (shouldUseKeeper()) {
      return getKeeperApi().history.status()
    }
    return null
  },

  /**
   * Get history settings
   */
  settings: async () => {
    if (shouldUseKeeper()) {
      return getKeeperApi().history.settings()
    }
    return null
  },

  /**
   * Get credentials (sanitized)
   */
  credentials: async () => {
    if (shouldUseKeeper()) {
      return getKeeperApi().history.credentials()
    }
    return null
  },

  /**
   * Enable history storage (InfluxDB + Grafana)
   */
  enable: async (options?: {
    retentionDays?: number
    bucket?: string
    org?: string
  }) => {
    if (shouldUseKeeper()) {
      return getKeeperApi().history.enable(options)
    }
    throw new Error('History management not supported without Keeper')
  },

  /**
   * Disable history storage
   */
  disable: async (retainData: boolean = true) => {
    if (shouldUseKeeper()) {
      await getKeeperApi().history.disable(retainData)
    } else {
      throw new Error('History management not supported without Keeper')
    }
  },

  /**
   * Update retention policy
   */
  updateRetention: async (retentionDays: number) => {
    if (shouldUseKeeper()) {
      return getKeeperApi().history.updateRetention(retentionDays)
    }
    throw new Error('History management not supported without Keeper')
  },

  /**
   * Grafana management
   */
  grafana: {
    enable: async () => {
      if (shouldUseKeeper()) {
        return getKeeperApi().history.grafana.enable()
      }
      throw new Error('Grafana management not supported without Keeper')
    },

    disable: async () => {
      if (shouldUseKeeper()) {
        return getKeeperApi().history.grafana.disable()
      }
      throw new Error('Grafana management not supported without Keeper')
    },

    refresh: async () => {
      if (shouldUseKeeper()) {
        return getKeeperApi().history.grafana.refresh()
      }
      throw new Error('Grafana management not supported without Keeper')
    }
  }
}
