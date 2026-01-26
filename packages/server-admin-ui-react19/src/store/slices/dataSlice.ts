/**
 * Data Slice - Manages real-time SignalK data (paths, values, metadata)
 *
 * Provides granular subscriptions for high-frequency updates via
 * Zustand's subscribeWithSelector middleware.
 */

import type { StateCreator } from 'zustand'

export interface PathData {
  path?: string
  value: unknown
  timestamp?: string
  $source?: string
  pgn?: string
  sentence?: string
  [key: string]: unknown
}

export interface RendererConfig {
  module?: string
  name?: string
  options?: Record<string, unknown>
}

export interface MetaData {
  units?: string
  description?: string
  renderer?: RendererConfig
  [key: string]: unknown
}

export interface DataSliceState {
  /** Nested data: { context: { path$source: PathData } } */
  signalkData: Record<string, Record<string, PathData>>
  /** Nested metadata: { context: { path: MetaData } } */
  signalkMeta: Record<string, Record<string, MetaData>>
  /** Version counter - increments when structure changes (new paths added) */
  dataVersion: number
}

export interface DataSliceActions {
  updatePath: (
    context: string,
    path$SourceKey: string,
    pathData: PathData
  ) => void
  updateMeta: (
    context: string,
    path: string,
    metaData: Partial<MetaData>
  ) => void
  getPathData: (context: string, path$SourceKey: string) => PathData | undefined
  getMeta: (context: string, path: string) => MetaData | undefined
  getPath$SourceKeys: (context: string) => string[]
  getContexts: () => string[]
  clearData: () => void
}

export type DataSlice = DataSliceState & DataSliceActions

const initialDataState: DataSliceState = {
  signalkData: {},
  signalkMeta: {},
  dataVersion: 0
}

export const createDataSlice: StateCreator<DataSlice, [], [], DataSlice> = (
  set,
  get
) => ({
  ...initialDataState,

  updatePath: (context, path$SourceKey, pathData) => {
    set((state) => {
      const contextData = state.signalkData[context] || {}
      const isNew = !contextData[path$SourceKey]

      const newContextData = {
        ...contextData,
        [path$SourceKey]: pathData
      }

      const newSignalkData = {
        ...state.signalkData,
        [context]: newContextData
      }

      // Increment version only for new paths
      const newVersion = isNew ? state.dataVersion + 1 : state.dataVersion

      return {
        signalkData: newSignalkData,
        dataVersion: newVersion
      }
    })
  },

  updateMeta: (context, path, metaData) => {
    set((state) => {
      const contextMeta = state.signalkMeta[context] || {}
      const existingMeta = contextMeta[path] || {}

      const newContextMeta = {
        ...contextMeta,
        [path]: { ...existingMeta, ...metaData }
      }

      return {
        signalkMeta: {
          ...state.signalkMeta,
          [context]: newContextMeta
        }
      }
    })
  },

  getPathData: (context, path$SourceKey) => {
    const state = get()
    return state.signalkData[context]?.[path$SourceKey]
  },

  getMeta: (context, path) => {
    const state = get()
    return state.signalkMeta[context]?.[path]
  },

  getPath$SourceKeys: (context) => {
    const state = get()
    return Object.keys(state.signalkData[context] || {})
  },

  getContexts: () => {
    const state = get()
    return Object.keys(state.signalkData)
  },

  clearData: () => {
    set(initialDataState)
  }
})
