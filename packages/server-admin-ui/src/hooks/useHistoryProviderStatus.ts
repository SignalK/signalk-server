import { useState, useEffect } from 'react'
import { usePlugins } from '../store'

const PROVIDERS_PATH = '/signalk/v2/api/history/_providers'

/**
 * True when a default History API provider is configured but not
 * currently registered (e.g. its plugin is disabled), so requests are
 * served by a fallback. Re-checks whenever the plugin list changes,
 * since providers register and unregister with plugin enable/disable.
 */
export function useHistoryProviderUnavailable(): boolean {
  const plugins = usePlugins()
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const [providersRes, defaultRes] = await Promise.all([
          fetch(PROVIDERS_PATH, { credentials: 'include' }),
          fetch(`${PROVIDERS_PATH}/_default`, { credentials: 'include' })
        ])
        if (!providersRes.ok || !defaultRes.ok) {
          return
        }
        const ids = Object.keys(
          (await providersRes.json()) as Record<string, unknown>
        )
        const defaultBody = (await defaultRes.json()) as {
          configured?: string
        }
        if (!cancelled) {
          setUnavailable(
            defaultBody.configured !== undefined &&
              !ids.includes(defaultBody.configured)
          )
        }
      } catch {
        // status stays as-is; the badge is best-effort
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [plugins])

  return unavailable
}
