import { useCallback, useEffect } from 'react'
import { useStore } from '../store'
import {
  buildSourceLabel,
  buildSourceLabelParts,
  type SourcesData
} from '../utils/sourceLabels'

const LEGACY_STORAGE_KEY = 'admin.v1.sourceAliases'

// One-shot guard: a successful migration should not run again, and a
// failed migration only retries on full page reload. The recovery path
// is to refresh — we deliberately don't retry automatically because a
// 5xx from /sourceAliases usually means the server is restarting and
// repeated PUT attempts would race the recovering settings file.
let migrationDone = false

function migrateFromLocalStorage(): void {
  if (migrationDone) return
  const loaded = useStore.getState().sourceAliasesLoaded
  if (!loaded) return
  migrationDone = true

  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Object.values(parsed).every((v) => typeof v === 'string')
    ) {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      return
    }
    // Filter out empty/whitespace-only aliases — they would round-trip
    // as deletes on the server anyway, so there's nothing to migrate.
    const localAliases: Record<string, string> = {}
    for (const [ref, value] of Object.entries(
      parsed as Record<string, string>
    )) {
      if (value.trim().length > 0) {
        localAliases[ref] = value
      }
    }
    if (Object.keys(localAliases).length === 0) {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      return
    }

    const serverAliases = useStore.getState().sourceAliases
    if (Object.keys(serverAliases).length === 0) {
      fetch(`${window.serverRoutesPrefix}/sourceAliases`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localAliases)
      })
        .then((res) => {
          if (res.ok) {
            useStore.getState().setSourceAliases(localAliases)
            localStorage.removeItem(LEGACY_STORAGE_KEY)
          } else {
            migrationDone = false
          }
        })
        .catch(() => {
          migrationDone = false
        })
    } else {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    }
  } catch {
    // Ignore localStorage errors
  }
}

function persistAliases(
  current: Record<string, string>,
  prev: Record<string, string>
): void {
  const revertOnFailure = () => {
    if (useStore.getState().sourceAliases === current) {
      useStore.getState().setSourceAliases(prev)
    }
  }
  fetch(`${window.serverRoutesPrefix}/sourceAliases`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(current)
  })
    .then((res) => {
      if (!res.ok) {
        console.error('Failed to save source aliases:', res.status)
        revertOnFailure()
      }
    })
    .catch((err) => {
      console.error('Failed to save source aliases:', err)
      revertOnFailure()
    })
}

export function useSourceAliases() {
  const aliases = useStore((s) => s.sourceAliases)
  const loaded = useStore((s) => s.sourceAliasesLoaded)

  // Migration runs once when the server's aliases have arrived; reading
  // current state from the store keeps `aliases` out of the dependency
  // list so the effect doesn't re-fire after each setSourceAliases.
  useEffect(() => {
    migrateFromLocalStorage()
  }, [loaded])

  const setAlias = useCallback((sourceRef: string, alias: string) => {
    const prev = useStore.getState().sourceAliases
    const current = { ...prev }
    if (alias.trim()) {
      current[sourceRef] = alias.trim()
    } else {
      delete current[sourceRef]
    }
    useStore.getState().setSourceAliases(current)
    persistAliases(current, prev)
  }, [])

  const removeAlias = useCallback(
    (sourceRef: string) => setAlias(sourceRef, ''),
    [setAlias]
  )

  const getDisplayName = useCallback(
    (sourceRef: string, sourcesData?: SourcesData | null): string => {
      if (aliases[sourceRef]) return aliases[sourceRef]
      return buildSourceLabel(sourceRef, sourcesData ?? null)
    },
    [aliases]
  )

  const getDisplayParts = useCallback(
    (
      sourceRef: string,
      sourcesData?: SourcesData | null
    ): { primary: string; secondary: string | null } => {
      if (aliases[sourceRef]) {
        return { primary: aliases[sourceRef], secondary: sourceRef }
      }
      return buildSourceLabelParts(sourceRef, sourcesData ?? null)
    },
    [aliases]
  )

  return { aliases, setAlias, removeAlias, getDisplayName, getDisplayParts }
}
