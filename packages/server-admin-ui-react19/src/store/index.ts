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

export type { AppSlice } from './slices/appSlice'
export type {
  WsSlice,
  WebSocketStatus,
  DeltaMessageHandler
} from './slices/wsSlice'
export type { DataSlice, PathData, MetaData } from './slices/dataSlice'
export type { PrioritiesSlice } from './slices/prioritiesSlice'

export type SignalKStore = AppSlice & WsSlice & DataSlice & PrioritiesSlice

export const useStore = create<SignalKStore>()(
  subscribeWithSelector((...args) => ({
    ...createAppSlice(...args),
    ...createWsSlice(...args),
    ...createDataSlice(...args),
    ...createPrioritiesSlice(...args)
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

export * from './types'
