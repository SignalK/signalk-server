import type { StateCreator } from 'zustand'
import { findContextName, isNameKey } from '../../utils/pathKeys'

export interface PathData {
  path?: string
  value: unknown
  timestamp?: string
  $source?: string
  pgn?: string
  sentence?: string
  /**
   * Server-emitted staleness state. Populated when the server has
   * timed the path+source out via meta.timeout enforcement; clients use
   * `state.timedOut` to render a stale indicator and `state.lastValue`
   * to show the most recent good reading.
   */
  state?: {
    timedOut?: boolean
    lastValue?: { timestamp: string; value: unknown }
  }
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
  /**
   * Derived map of context key → vessel display name, maintained
   * incrementally as `name` leaves arrive, change, or are removed.
   * Contexts without a resolved name have no entry. Kept here rather
   * than computed in a selector so readers get O(1) access and the
   * object's identity only changes when a name actually changes —
   * scanning every context on each store update would put a full
   * cache sweep on the per-delta path.
   */
  contextNames: Record<string, string>
  /**
   * Self path → names NMEA 2000 devices already give it on the bus,
   * offered as a displayName for paths that have none.
   */
  labelSuggestions: Record<string, string[]>
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
  removeMetaKeys: (
    context: string,
    path: string,
    cleared: Record<string, unknown>
  ) => void
  getPathData: (context: string, path$SourceKey: string) => PathData | undefined
  getMeta: (context: string, path: string) => MetaData | undefined
  getPath$SourceKeys: (context: string) => string[]
  getContexts: () => string[]
  removePath: (context: string, path$SourceKey: string) => void
  evictSource: (sourceRef: string) => void
  clearData: () => void
  setLabelSuggestions: (suggestions: Record<string, string[]>) => void
}

export type DataSlice = DataSliceState & DataSliceActions

const initialDataState: DataSliceState = {
  signalkData: {},
  signalkMeta: {},
  dataVersion: 0,
  contextNames: {},
  labelSuggestions: {}
}

// Metadata values are JSON, and a delta may carry an object's keys in another
// order than the editor saw them, so objects compare by key regardless of
// order while arrays keep theirs.
function sameMetaValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameMetaValue(item, b[i]))
    )
  }
  const aRecord = a as Record<string, unknown>
  const bRecord = b as Record<string, unknown>
  const keys = Object.keys(aRecord)
  return (
    keys.length === Object.keys(bRecord).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(bRecord, key) &&
        sameMetaValue(aRecord[key], bRecord[key])
    )
  )
}

// Re-resolve one context's entry in the contextNames map after its data
// changed in a way that can affect the name. Returns the previous map
// unchanged (same identity) when the resolved name is the same.
function withContextName(
  contextNames: Record<string, string>,
  context: string,
  contextData: Record<string, PathData>
): Record<string, string> {
  const resolved = findContextName(contextData)
  if (resolved === contextNames[context]) return contextNames
  if (resolved === undefined) {
    const { [context]: _, ...rest } = contextNames
    return rest
  }
  return { ...contextNames, [context]: resolved }
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
        dataVersion: newVersion,
        contextNames: isNameKey(path$SourceKey)
          ? withContextName(state.contextNames, context, newContextData)
          : state.contextNames
      }
    })
  },

  updateMeta: (context, path, metaData) => {
    set((state) => {
      const contextMeta = state.signalkMeta[context] || {}

      const newContextMeta = {
        ...contextMeta,
        [path]: { ...contextMeta[path], ...metaData } as MetaData
      }

      return {
        signalkMeta: {
          ...state.signalkMeta,
          [context]: newContextMeta
        }
      }
    })
  },

  // Meta deltas are merged, because some carry only the field they change
  // (registerPutHandler sends `{ supportsPut: true }`). A field the user
  // cleared in the editor therefore survives the save it was removed in, so
  // the editor drops it here explicitly. `cleared` holds each field's value
  // before the save; a field the server has since given another value (an
  // inherited contract, say) is newer than the save and is kept.
  removeMetaKeys: (context, path, cleared) => {
    set((state) => {
      const existing = state.signalkMeta[context]?.[path]
      if (!existing) return state
      const remaining = { ...existing }
      let changed = false
      for (const [field, before] of Object.entries(cleared)) {
        const key = field as keyof MetaData
        if (key in remaining && sameMetaValue(remaining[key], before)) {
          delete remaining[key]
          changed = true
        }
      }
      if (!changed) return state
      return {
        signalkMeta: {
          ...state.signalkMeta,
          [context]: { ...state.signalkMeta[context], [path]: remaining }
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

  removePath: (context, path$SourceKey) => {
    set((state) => {
      const contextData = state.signalkData[context]
      if (!contextData || !contextData[path$SourceKey]) return state
      const { [path$SourceKey]: _, ...rest } = contextData
      return {
        signalkData: { ...state.signalkData, [context]: rest },
        dataVersion: state.dataVersion + 1,
        contextNames: isNameKey(path$SourceKey)
          ? withContextName(state.contextNames, context, rest)
          : state.contextNames
      }
    })
  },

  evictSource: (sourceRef) => {
    set((state) => {
      // Drop every leaf this client cached for the evicted sourceRef.
      // Triggered by the server's SOURCEEVICTED event after the trash
      // action clears the source-side cache. Keys are `path$source`,
      // so a sourceRef match shows up as a `$<ref>` suffix.
      const suffix = `$${sourceRef}`
      let changed = false
      let contextNames = state.contextNames
      const next: typeof state.signalkData = {}
      for (const ctx of Object.keys(state.signalkData)) {
        const contextData = state.signalkData[ctx]
        const keptEntries: [string, PathData][] = []
        let ctxChanged = false
        let nameDropped = false
        for (const key of Object.keys(contextData)) {
          if (key.endsWith(suffix)) {
            ctxChanged = true
            changed = true
            if (isNameKey(key)) nameDropped = true
            continue
          }
          keptEntries.push([key, contextData[key]])
        }
        if (ctxChanged) {
          next[ctx] = Object.fromEntries(keptEntries)
          if (nameDropped) {
            contextNames = withContextName(contextNames, ctx, next[ctx])
          }
        } else {
          next[ctx] = contextData
        }
      }
      if (!changed) return state
      return {
        signalkData: next,
        dataVersion: state.dataVersion + 1,
        contextNames
      }
    })
  },

  clearData: () => {
    set(initialDataState)
  },

  setLabelSuggestions: (suggestions) => {
    set({ labelSuggestions: suggestions })
  }
})
