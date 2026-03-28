import { useCallback, useEffect } from 'react'
import { useStore } from '../store'
import { buildSourceLabel, type SourcesData } from '../utils/sourceLabels'

const LEGACY_STORAGE_KEY = 'admin.v1.sourceAliases'

let migrationDone = false

function migrateFromLocalStorage(
  serverAliases: Record<string, string>,
  loaded: boolean
): void {
  if (migrationDone || !loaded) return
  migrationDone = true

  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return
    const localAliases = JSON.parse(raw)
    if (
      !localAliases ||
      typeof localAliases !== 'object' ||
      Object.keys(localAliases).length === 0
    ) {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      return
    }

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

export function useSourceAliases() {
  const aliases = useStore((s) => s.sourceAliases)
  const loaded = useStore((s) => s.sourceAliasesLoaded)

  useEffect(() => {
    migrateFromLocalStorage(aliases, loaded)
  }, [aliases, loaded])

  const setAlias = useCallback((sourceRef: string, alias: string) => {
    const prev = useStore.getState().sourceAliases
    const current = { ...prev }
    if (alias.trim()) {
      current[sourceRef] = alias.trim()
    } else {
      delete current[sourceRef]
    }
    useStore.getState().setSourceAliases(current)
    fetch(`${window.serverRoutesPrefix}/sourceAliases`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current)
    })
      .then((res) => {
        if (!res.ok) {
          console.error('Failed to save source alias:', res.status)
          if (useStore.getState().sourceAliases === current) {
            useStore.getState().setSourceAliases(prev)
          }
        }
      })
      .catch((err) => {
        console.error('Failed to save source alias:', err)
        if (useStore.getState().sourceAliases === current) {
          useStore.getState().setSourceAliases(prev)
        }
      })
  }, [])

  const removeAlias = useCallback((sourceRef: string) => {
    const prev = useStore.getState().sourceAliases
    const current = { ...prev }
    delete current[sourceRef]
    useStore.getState().setSourceAliases(current)
    fetch(`${window.serverRoutesPrefix}/sourceAliases`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current)
    })
      .then((res) => {
        if (!res.ok) {
          console.error('Failed to remove source alias:', res.status)
          if (useStore.getState().sourceAliases === current) {
            useStore.getState().setSourceAliases(prev)
          }
        }
      })
      .catch((err) => {
        console.error('Failed to remove source alias:', err)
        if (useStore.getState().sourceAliases === current) {
          useStore.getState().setSourceAliases(prev)
        }
      })
  }, [])

  const getDisplayName = useCallback(
    (sourceRef: string, sourcesData?: SourcesData | null): string => {
      if (aliases[sourceRef]) return aliases[sourceRef]
      return buildSourceLabel(sourceRef, sourcesData ?? null)
    },
    [aliases]
  )

  return { aliases, setAlias, removeAlias, getDisplayName }
}
