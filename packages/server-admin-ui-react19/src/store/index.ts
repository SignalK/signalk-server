import { useMemo } from 'react'
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'

import { createAppSlice, type AppSlice } from './slices/appSlice'
import { createWsSlice, type WsSlice } from './slices/wsSlice'
import { createDataSlice, type DataSlice } from './slices/dataSlice'
import {
  createPrioritiesSlice,
  type PrioritiesSlice
} from './slices/prioritiesSlice'
import {
  createUnitPreferencesSlice,
  type UnitPreferencesSlice
} from './slices/unitPreferencesSlice'

export type { AppSlice } from './slices/appSlice'
export type {
  WsSlice,
  WebSocketStatus,
  DeltaMessageHandler
} from './slices/wsSlice'
export type { DataSlice, PathData, MetaData } from './slices/dataSlice'
export type { PrioritiesSlice } from './slices/prioritiesSlice'
export type { UnitPreferencesSlice } from './slices/unitPreferencesSlice'

export type SignalKStore = AppSlice &
  WsSlice &
  DataSlice &
  PrioritiesSlice &
  UnitPreferencesSlice

export const useStore = create<SignalKStore>()(
  subscribeWithSelector((...args) => ({
    ...createAppSlice(...args),
    ...createWsSlice(...args),
    ...createDataSlice(...args),
    ...createPrioritiesSlice(...args),
    ...createUnitPreferencesSlice(...args)
  }))
)

export { useShallow }

export function useWsStatus() {
  return useStore((s) => s.wsStatus)
}

export function useWsConnection() {
  return useStore(
    useShallow((s) => ({
      status: s.wsStatus,
      skSelf: s.skSelf,
      ws: s.ws,
      isConnected: s.wsStatus === 'open'
    }))
  )
}

export function useLoginStatus() {
  return useStore((s) => s.loginStatus)
}

export function useAppStore() {
  return useStore((s) => s.appStore)
}

export function useServerStats() {
  return useStore((s) => s.serverStatistics)
}

export function useLogEntries() {
  return useStore((s) => s.log)
}

export function usePathData(context: string, path$SourceKey: string) {
  return useStore((s) => s.signalkData[context]?.[path$SourceKey])
}

export function useMetaData(context: string, path: string) {
  return useStore((s) => s.signalkMeta[context]?.[path])
}

export function useDataVersion() {
  return useStore((s) => s.dataVersion)
}

export function useSourcePriorities() {
  return useStore((s) => s.sourcePrioritiesData)
}

export function useSourceRanking() {
  return useStore((s) => s.sourceRankingData)
}

export function useWebapps() {
  return useStore((s) => s.webapps)
}

export function useAddons() {
  return useStore((s) => s.addons)
}

export function usePlugins() {
  return useStore((s) => s.plugins)
}

export function useAccessRequests() {
  return useStore((s) => s.accessRequests)
}

export function useVesselInfo() {
  return useStore((s) => s.vesselInfo)
}

export function useServerSpecification() {
  return useStore((s) => s.serverSpecification)
}

export function useRestarting() {
  return useStore((s) => s.restarting)
}

export function useBackpressureWarning() {
  return useStore((s) => s.backpressureWarning)
}

export function useActivePreset() {
  return useStore((s) => s.activePreset)
}

export function usePresets() {
  return useStore((s) => s.presets)
}

export function usePresetDetails() {
  return useStore((s) => s.presetDetails)
}

export function useUnitDefinitions() {
  return useStore((s) => s.unitDefinitions)
}

export function useDefaultCategories() {
  return useStore((s) => s.defaultCategories)
}

export function useUnitPrefsLoaded() {
  return useStore((s) => s.unitPrefsLoaded)
}

export function useUnitCategories() {
  return useStore((s) => s.categories)
}

export function useSourcesData() {
  return useStore((s) => s.sourcesData)
}

export function useSourceAliasesData() {
  return useStore((s) => s.sourceAliases)
}

export function useMultiSourcePaths() {
  return useStore((s) => s.multiSourcePaths)
}

export function useConfiguredPriorityPaths(): Set<string> {
  // Select a primitive string so zustand can compare by ===.
  // useShallow doesn't work with Set (Object.keys returns [] for Sets).
  const joined = useStore((s) => {
    const result: string[] = []
    for (const pp of s.sourcePrioritiesData.sourcePriorities) {
      if (pp.path) result.push(pp.path)
    }
    return result.sort().join('\0')
  })
  return useMemo(() => new Set(joined ? joined.split('\0') : []), [joined])
}

/**
 * Returns a Map from path → Set of configured sourceRefs for that path.
 * Includes both Path-Level Overrides and global Ranking sources.
 */
export function useConfiguredSourcesByPath(): Map<string, Set<string>> {
  const serialized = useStore((s) => {
    const entries: string[] = []
    for (const pp of s.sourcePrioritiesData.sourcePriorities) {
      if (pp.path) {
        const refs = pp.priorities.map((p) => p.sourceRef).join(',')
        entries.push(`${pp.path}\t${refs}`)
      }
    }
    return entries.sort().join('\0')
  })
  return useMemo(() => {
    const map = new Map<string, Set<string>>()
    if (!serialized) return map
    for (const entry of serialized.split('\0')) {
      const [path, refs] = entry.split('\t')
      map.set(path, new Set(refs ? refs.split(',').filter(Boolean) : []))
    }
    return map
  }, [serialized])
}

export * from './types'
