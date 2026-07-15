import { useState, useEffect, useCallback } from 'react'
import { usePlugins } from '../store'

export const PROVIDERS_PATH = '/signalk/v2/api/history/_providers'

/** Response of GET /signalk/v2/api/history/_providers */
type HistoryProvidersResponse = Record<string, { isDefault: boolean }>

export interface HistoryProvidersState {
  ids: string[]
  /** Provider currently serving unqualified History API requests */
  defaultId: string | null
  /** Provider persisted in server settings; may not be registered */
  configuredId: string | null
}

/**
 * Registered History API providers and the effective/configured
 * default. Fetches once on mount; call refresh() to re-check.
 */
export function useHistoryProviders(): {
  providers: HistoryProvidersState | null
  loadError: string | null
  refresh: () => Promise<void>
} {
  const [providers, setProviders] = useState<HistoryProvidersState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [providersRes, defaultRes] = await Promise.all([
        fetch(PROVIDERS_PATH, { credentials: 'include' }),
        fetch(`${PROVIDERS_PATH}/_default`, { credentials: 'include' })
      ])
      if (!providersRes.ok || !defaultRes.ok) {
        setLoadError(
          `Failed to load history providers (HTTP ${
            providersRes.ok ? defaultRes.status : providersRes.status
          })`
        )
        return
      }
      const providersBody =
        (await providersRes.json()) as HistoryProvidersResponse
      const defaultBody = (await defaultRes.json()) as {
        id?: string
        configured?: string
      }
      setProviders({
        ids: Object.keys(providersBody),
        defaultId: defaultBody.id ?? null,
        configuredId: defaultBody.configured ?? null
      })
      setLoadError(null)
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : 'Failed to load history providers'
      )
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { providers, loadError, refresh }
}

export const isConfiguredProviderUnavailable = (
  providers: HistoryProvidersState | null
): boolean =>
  providers !== null &&
  providers.configuredId !== null &&
  !providers.ids.includes(providers.configuredId)

/**
 * True when a default History API provider is configured but not
 * currently registered (e.g. its plugin is disabled), so requests are
 * served by a fallback. Re-checks whenever the plugin list changes,
 * since providers register and unregister with plugin enable/disable.
 */
export function useHistoryProviderUnavailable(): boolean {
  const plugins = usePlugins()
  const { providers, refresh } = useHistoryProviders()

  useEffect(() => {
    refresh()
  }, [plugins, refresh])

  return isConfiguredProviderUnavailable(providers)
}
