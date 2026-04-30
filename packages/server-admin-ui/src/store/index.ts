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

export function useClearLogEntries() {
  return useStore((s) => s.clearLogEntries)
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

export function usePriorityGroups() {
  return useStore((s) => s.priorityGroupsData)
}

export function usePriorityDefaults() {
  return useStore((s) => s.priorityDefaultsData)
}

export function usePriorityOverrides() {
  return useStore((s) => s.priorityOverridesData)
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

export function useDevices() {
  return useStore((s) => s.devices)
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

export function useNodeInfo() {
  return useStore((s) => s.nodeInfo)
}

export function useBackpressureWarning() {
  return useStore((s) => s.backpressureWarning)
}

export function useActivePreset() {
  return useStore((s) => s.activePreset)
}

export function useServerDefaultPreset() {
  return useStore((s) => s.serverDefaultPreset)
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

export function useIgnoredInstanceConflicts() {
  return useStore((s) => s.ignoredInstanceConflicts)
}

export function useActiveConflictCount() {
  return useStore((s) => s.activeConflictCount)
}

export function usePgnDataInstances() {
  return useStore((s) => s.pgnDataInstances)
}

export function usePgnSourceKeys() {
  return useStore((s) => s.pgnSourceKeys)
}

export function useDiscoveredAddresses() {
  return useStore((s) => s.discoveredAddresses)
}

export function useN2kDeviceStatusLoaded() {
  return useStore((s) => s.n2kDeviceStatusLoaded)
}

export function useMultiSourcePaths() {
  return useStore((s) => s.multiSourcePaths)
}

export function useLivePreferredSources() {
  return useStore((s) => s.livePreferredSources)
}

export function useLivePreferredSourcesLoaded() {
  return useStore((s) => s.livePreferredSourcesLoaded)
}

export function useSourceStatus() {
  return useStore((s) => s.sourceStatus)
}

export function useSourceStatusLoaded() {
  return useStore((s) => s.sourceStatusLoaded)
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
 * Returns a Map from path → Set of configured sourceRefs for that path,
 * as configured via path-level source priorities.
 */
export function useConfiguredSourcesByPath(): Map<string, Set<string>> {
  const serialized = useStore((s) => {
    const entries: string[] = []
    for (const pp of s.sourcePrioritiesData.sourcePriorities) {
      if (pp.path) {
        const pathRefs = pp.priorities.map((p) => p.sourceRef)
        // \x1F (ASCII unit separator) keeps path and refs apart even if a
        // sourceRef ever contains a tab; \0 still separates entries.
        entries.push(`${pp.path}\x1F${pathRefs.join(',')}`)
      }
    }
    return entries.sort().join('\0')
  })
  return useMemo(() => {
    const map = new Map<string, Set<string>>()
    if (!serialized) return map
    for (const entry of serialized.split('\0')) {
      const [path, refs] = entry.split('\x1F')
      map.set(path, new Set(refs ? refs.split(',').filter(Boolean) : []))
    }
    return map
  }, [serialized])
}

/**
 * Returns a Map from path → preferred (first) sourceRef for that path.
 */
export function usePreferredSourceByPath(): Map<string, string> {
  const serialized = useStore((s) => {
    const entries: string[] = []
    for (const pp of s.sourcePrioritiesData.sourcePriorities) {
      if (pp.path && pp.priorities.length > 0 && pp.priorities[0].sourceRef) {
        entries.push(`${pp.path}\x1F${pp.priorities[0].sourceRef}`)
      }
    }
    return entries.sort().join('\0')
  })
  return useMemo(() => {
    const map = new Map<string, string>()
    if (!serialized) return map
    for (const entry of serialized.split('\0')) {
      const [path, ref] = entry.split('\x1F')
      if (path && ref) map.set(path, ref)
    }
    return map
  }, [serialized])
}

export * from './types'
