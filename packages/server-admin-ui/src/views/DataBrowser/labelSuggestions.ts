import { useEffect } from 'react'
import { useStore } from '../../store'

interface LabelSuggestion {
  path: string
  label: string
}

// Alerts and switch states keep arriving after a page opens or the
// server restarts, so the list is refreshed while the page is open.
const REFRESH_INTERVAL_MS = 30_000
// A request that never settles would otherwise block every later refresh.
const REQUEST_TIMEOUT_MS = 10_000

export function groupLabelSuggestions(
  suggestions: readonly LabelSuggestion[]
): Record<string, string[]> {
  const byPath: Record<string, string[]> = {}
  for (const { path, label } of suggestions) {
    ;(byPath[path] ??= []).push(label)
  }
  return byPath
}

function isSuggestionList(x: unknown): x is LabelSuggestion[] {
  return (
    Array.isArray(x) &&
    x.every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as LabelSuggestion).path === 'string' &&
        typeof (s as LabelSuggestion).label === 'string'
    )
  )
}

export function useLabelSuggestions(enabled: boolean): void {
  const setLabelSuggestions = useStore((s) => s.setLabelSuggestions)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // One request at a time, so a slow answer can never land after, and
    // overwrite, a newer one.
    let current: AbortController | undefined
    const load = () => {
      if (current) return
      const controller = new AbortController()
      current = controller
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      fetch(`${window.serverRoutesPrefix}/n2kLabelSuggestions`, {
        credentials: 'include',
        signal: controller.signal
      })
        .then((res) => (res.ok ? res.json() : undefined))
        .then((body: { suggestions?: unknown } | undefined) => {
          if (cancelled || !isSuggestionList(body?.suggestions)) return
          setLabelSuggestions(groupLabelSuggestions(body.suggestions))
        })
        .catch((err) => {
          if (!cancelled) console.warn('Label suggestions failed to load:', err)
        })
        .finally(() => {
          clearTimeout(timeout)
          current = undefined
        })
    }
    load()
    const timer = setInterval(load, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
      current?.abort()
    }
  }, [enabled, setLabelSuggestions])
}
