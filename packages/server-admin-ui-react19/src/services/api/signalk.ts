/**
 * SignalK Server API Client
 *
 * Client for interacting with the SignalK server's admin API
 * when running in standard (non-Keeper) mode.
 */

declare const window: Window & {
  serverRoutesPrefix: string
}

export function createSignalkApi() {
  const prefix = window.serverRoutesPrefix || '/skServer'

  return {
    restart: async (): Promise<void> => {
      const response = await fetch(`${prefix}/restart`, {
        method: 'PUT'
      })
      if (!response.ok) {
        throw new Error(`Failed to restart: ${response.statusText}`)
      }
    },

    backup: {
      download: (includePlugins: boolean = true): string => {
        return `${prefix}/backup?includePlugins=${includePlugins}`
      },

      validate: async (
        file: File
      ): Promise<{
        valid: boolean
        files?: string[]
        error?: string
      }> => {
        const formData = new FormData()
        formData.append('backupFile', file)
        const response = await fetch(`${prefix}/validateBackup`, {
          method: 'POST',
          body: formData
        })
        if (!response.ok) {
          throw new Error(`Validation failed: ${response.statusText}`)
        }
        return response.json()
      },

      restore: async (files: string[]): Promise<void> => {
        const response = await fetch(`${prefix}/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files })
        })
        if (!response.ok) {
          throw new Error(`Restore failed: ${response.statusText}`)
        }
      }
    },

    update: {
      install: async (version: string): Promise<void> => {
        const response = await fetch(
          `${prefix}/appstore/install/signalk-server/${version}`,
          { method: 'POST' }
        )
        if (!response.ok) {
          throw new Error(`Update failed: ${response.statusText}`)
        }
      }
    },

    appStore: {
      available: async (): Promise<{
        updates: unknown[]
        installed: unknown[]
        available: unknown[]
        installing: unknown[]
        storeAvailable: boolean
        canUpdateServer: boolean
        serverUpdate?: string
        isInDocker: boolean
        containerRuntime?: string
        keeperUrl?: string
        useKeeper?: boolean
      }> => {
        const response = await fetch(`${prefix}/appstore/available/`)
        if (!response.ok) {
          throw new Error(`Failed to get app store: ${response.statusText}`)
        }
        return response.json()
      },

      install: async (name: string, version: string): Promise<void> => {
        const response = await fetch(
          `${prefix}/appstore/install/${name}/${version}`,
          { method: 'POST' }
        )
        if (!response.ok) {
          throw new Error(`Install failed: ${response.statusText}`)
        }
      },

      remove: async (name: string): Promise<void> => {
        const response = await fetch(`${prefix}/appstore/remove/${name}`, {
          method: 'POST'
        })
        if (!response.ok) {
          throw new Error(`Remove failed: ${response.statusText}`)
        }
      }
    },

    security: {
      loginStatus: async (): Promise<{
        status: string
        authenticationRequired: boolean
        username?: string
      }> => {
        const response = await fetch('/signalk/v1/auth/login')
        return response.json()
      },

      login: async (
        username: string,
        password: string
      ): Promise<{ token?: string; status?: string }> => {
        const response = await fetch('/signalk/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        })
        return response.json()
      },

      logout: async (): Promise<void> => {
        await fetch('/signalk/v1/auth/logout', { method: 'PUT' })
      }
    }
  }
}

export type SignalkApi = ReturnType<typeof createSignalkApi>
