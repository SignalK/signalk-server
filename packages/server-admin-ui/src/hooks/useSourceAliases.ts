import { useCallback } from 'react'
import { useStore } from '../store'
import { buildSourceLabel, type SourcesData } from '../utils/sourceLabels'

const LEGACY_STORAGE_KEY = 'admin.v1.sourceAliases'

let migrationDone = false

function migrateFromLocalStorage(serverAliases: Record<string, string>): void {
  if (migrationDone) return
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
          }
        })
        .catch(() => {
          migrationDone = false
        })
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Ignore localStorage errors
  }
}

export function useSourceAliases() {
  const aliases = useStore((s) => s.sourceAliases)

  migrateFromLocalStorage(aliases)

  const setAlias = useCallback((sourceRef: string, alias: string) => {
    const current = { ...useStore.getState().sourceAliases }
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
    }).catch((err) => {
      console.error('Failed to save source alias:', err)
    })
  }, [])

  const removeAlias = useCallback((sourceRef: string) => {
    const current = { ...useStore.getState().sourceAliases }
    delete current[sourceRef]
    useStore.getState().setSourceAliases(current)
    fetch(`${window.serverRoutesPrefix}/sourceAliases`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current)
    }).catch((err) => {
      console.error('Failed to remove source alias:', err)
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
