/**
 * SignalK Admin UI Store
 *
 * Unified Zustand store for all application state management.
 */

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

// Re-export slice types
export type { AppSlice } from './slices/appSlice'
export type {
  WsSlice,
  WebSocketStatus,
  DeltaMessageHandler
} from './slices/wsSlice'
export type { DataSlice, PathData, MetaData } from './slices/dataSlice'
export type { PrioritiesSlice } from './slices/prioritiesSlice'

// Combined Zustand store type
export type SignalKStore = AppSlice & WsSlice & DataSlice & PrioritiesSlice

// Create the unified Zustand store
export const useStore = create<SignalKStore>()(
  subscribeWithSelector((...args) => ({
    ...createAppSlice(...args),
    ...createWsSlice(...args),
    ...createDataSlice(...args),
    ...createPrioritiesSlice(...args)
  }))
)

// Re-export useShallow for convenient usage
export { useShallow }

// Convenience hooks for common state selections
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

export function useZustandLoginStatus() {
  return useStore((s) => s.loginStatus)
}

export function useZustandAppStore() {
  return useStore((s) => s.appStore)
}

export function useServerStats() {
  return useStore((s) => s.serverStatistics)
}

export function useZustandLogEntries() {
  return useStore((s) => s.log)
}

export function useZustandPathData(context: string, path$SourceKey: string) {
  return useStore((s) => s.signalkData[context]?.[path$SourceKey])
}

export function useZustandMetaData(context: string, path: string) {
  return useStore((s) => s.signalkMeta[context]?.[path])
}

export function useDataVersion() {
  return useStore((s) => s.dataVersion)
}

export function useZustandSourcePriorities() {
  return useStore((s) => s.sourcePrioritiesData)
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

// Re-export types
export * from './types'
