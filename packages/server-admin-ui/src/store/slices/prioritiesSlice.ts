import type { StateCreator } from 'zustand'
import remove from 'lodash.remove'
import { DEFAULT_FALLBACK_MS } from '../../utils/sourceGroups'
import type {
  SourcePrioritiesData,
  SourcePriority,
  PathPriority,
  PriorityGroup,
  PriorityGroupsData,
  PriorityDefaults,
  PriorityDefaultsData,
  PriorityOverridesData
} from '../types'

function checkTimeouts(priorities: SourcePriority[]): boolean {
  return priorities.every((prio, i) => {
    if (i === 0) {
      return true
    }
    const value = Number(prio.timeout)
    // Allow -1 (disabled) or positive values
    return !Number.isNaN(value) && (value === -1 || value > 0)
  })
}

export interface PrioritiesSliceState {
  sourcePrioritiesData: SourcePrioritiesData
  priorityGroupsData: PriorityGroupsData
  priorityDefaultsData: PriorityDefaultsData
  priorityOverridesData: PriorityOverridesData
  // Per-group suppression of newcomer sources the user just trashed.
  // The eviction fetch is async and the upstream stream may re-push
  // deltas during the gap, so without this override a trashed row
  // visibly bounces back to the bottom of the dnd list. Keyed by
  // group id (server's reconciled id), value is the canonical
  // sourceRefs to hide.
  //
  // Lifecycle is a two-step gate:
  //   1. trash click → suppressNewcomerInGroup adds the ref here.
  //   2. Save round-trip (setPriorityGroupsFromServer) marks the
  //      ref as retiring (mirrored into retiringNewcomersByGroup).
  //   3. Next RECONCILEDGROUPS where the server no longer reports the
  //      ref as a newcomer for that group → both entries are dropped
  //      (clearRetiredSuppressions). The ref is then a fresh
  //      newcomer the next time the source appears.
  // Without the retiring step, a server "absence" reconcile that
  // races a re-push from upstream would re-promote the ref before
  // Save lands. Without auto-clearing on confirmed absence, the user
  // can never re-discover a source they trashed earlier in the
  // session.
  suppressedNewcomersByGroup: Record<string, string[]>
  retiringNewcomersByGroup: Record<string, string[]>
}

export interface PrioritiesSliceActions {
  setSourcePriorities: (priorities: Record<string, SourcePriority[]>) => void
  changePath: (index: number, path: string) => void
  deletePath: (index: number) => void
  changePriority: (
    pathIndex: number,
    index: number,
    sourceRef: string,
    timeout: string | number
  ) => void
  deletePriority: (pathIndex: number, index: number) => void
  movePriority: (pathIndex: number, index: number, change: 1 | -1) => void
  setPathPriorities: (path: string, priorities: SourcePriority[]) => void
  setSaving: () => void
  setSaved: () => void
  setSaveFailed: () => void
  clearSaveFailed: () => void
  setPriorityGroups: (groups: PriorityGroup[]) => void
  setPriorityGroupsFromServer: (groups: PriorityGroup[]) => void
  reorderGroupSources: (groupId: string, from: number, to: number) => void
  setGroupSources: (groupId: string, sources: string[]) => void
  setGroupInactive: (groupId: string, inactive: boolean) => void
  suppressNewcomerInGroup: (groupId: string, sourceRef: string) => void
  clearRetiredSuppressions: (
    newcomerSourcesByGroup: Record<string, string[]>
  ) => void
  setGroupsSaving: () => void
  setGroupsSaved: () => void
  setGroupsSaveFailed: () => void
  clearGroupsSaveFailed: () => void
  setPriorityDefaultsFromServer: (defaults: PriorityDefaults) => void
  setPriorityDefaults: (defaults: PriorityDefaults) => void
  setPriorityOverridesFromServer: (paths: string[]) => void
  addPriorityOverride: (path: string) => void
  removePriorityOverride: (path: string) => void
}

export type PrioritiesSlice = PrioritiesSliceState & PrioritiesSliceActions

const initialPrioritiesState: PrioritiesSliceState = {
  sourcePrioritiesData: {
    sourcePriorities: [],
    saveState: {
      dirty: false,
      timeoutsOk: true
    }
  },
  priorityGroupsData: {
    groups: [],
    saveState: {
      dirty: false,
      timeoutsOk: true
    }
  },
  priorityDefaultsData: {
    defaults: {},
    saveState: {
      dirty: false,
      timeoutsOk: true
    }
  },
  priorityOverridesData: {
    paths: [],
    saveState: {
      dirty: false,
      timeoutsOk: true
    }
  },
  suppressedNewcomersByGroup: {},
  retiringNewcomersByGroup: {}
}

export const createPrioritiesSlice: StateCreator<
  PrioritiesSlice,
  [],
  [],
  PrioritiesSlice
> = (set) => ({
  ...initialPrioritiesState,

  setSourcePriorities: (sourcePrioritiesMap) => {
    const sourcePriorities: PathPriority[] = Object.keys(
      sourcePrioritiesMap
    ).map((key) => ({
      path: key,
      priorities: sourcePrioritiesMap[key]
    }))
    set({
      sourcePrioritiesData: {
        sourcePriorities,
        saveState: {
          dirty: false,
          timeoutsOk: true
        }
      }
    })
  },

  changePath: (index, path) => {
    set((state) => {
      const sourcePriorities = [...state.sourcePrioritiesData.sourcePriorities]
      if (index === sourcePriorities.length) {
        sourcePriorities.push({ path: '', priorities: [] })
      }
      sourcePriorities[index] = { ...sourcePriorities[index], path }
      return {
        sourcePrioritiesData: {
          ...state.sourcePrioritiesData,
          sourcePriorities,
          saveState: { ...state.sourcePrioritiesData.saveState, dirty: true }
        }
      }
    })
  },

  deletePath: (index) => {
    set((state) => {
      const sourcePriorities = [...state.sourcePrioritiesData.sourcePriorities]
      remove(sourcePriorities, (_, i) => i === index)
      return {
        sourcePrioritiesData: {
          ...state.sourcePrioritiesData,
          sourcePriorities,
          saveState: { ...state.sourcePrioritiesData.saveState, dirty: true }
        }
      }
    })
  },

  changePriority: (pathIndex, index, sourceRef, timeout) => {
    set((state) => {
      const sourcePriorities = [...state.sourcePrioritiesData.sourcePriorities]
      if (pathIndex === sourcePriorities.length) {
        sourcePriorities.push({ path: '', priorities: [] })
      }
      const prios = [...sourcePriorities[pathIndex].priorities]
      if (index === prios.length) {
        prios.push({
          sourceRef: '',
          timeout: index > 0 ? DEFAULT_FALLBACK_MS : ''
        })
      }
      prios[index] = { sourceRef, timeout }
      sourcePriorities[pathIndex] = {
        ...sourcePriorities[pathIndex],
        priorities: prios
      }

      const allTimeoutsOk = sourcePriorities.every((pp) =>
        checkTimeouts(pp.priorities)
      )
      return {
        sourcePrioritiesData: {
          ...state.sourcePrioritiesData,
          sourcePriorities,
          saveState: {
            ...state.sourcePrioritiesData.saveState,
            dirty: true,
            timeoutsOk: allTimeoutsOk
          }
        }
      }
    })
  },

  deletePriority: (pathIndex, index) => {
    set((state) => {
      const sourcePriorities = [...state.sourcePrioritiesData.sourcePriorities]
      if (pathIndex < 0 || pathIndex >= sourcePriorities.length) return state
      const prios = [...sourcePriorities[pathIndex].priorities]
      remove(prios, (_, i) => i === index)
      sourcePriorities[pathIndex] = {
        ...sourcePriorities[pathIndex],
        priorities: prios
      }

      const allTimeoutsOk = sourcePriorities.every((pp) =>
        checkTimeouts(pp.priorities)
      )
      return {
        sourcePrioritiesData: {
          ...state.sourcePrioritiesData,
          sourcePriorities,
          saveState: {
            ...state.sourcePrioritiesData.saveState,
            dirty: true,
            timeoutsOk: allTimeoutsOk
          }
        }
      }
    })
  },

  movePriority: (pathIndex, index, change) => {
    set((state) => {
      const sourcePriorities = [...state.sourcePrioritiesData.sourcePriorities]
      const prios = [...sourcePriorities[pathIndex].priorities]
      const target = index + change
      if (target < 0 || target >= prios.length) return state
      const tmp = prios[index]
      prios[index] = prios[target]
      prios[target] = tmp
      // After swapping, normalise timeouts so rank-1 stays at 0 and any
      // row that just moved out of rank-1 picks up the default fallback
      // (it was carrying 0 only because rank-1 doesn't use a timeout).
      // Without this the demoted source displays "0 ms" in the UI until
      // the save handler renormalises on its way to disk.
      const normalised = prios.map((p, i) => {
        const t = Number(p.timeout)
        if (i === 0) return { ...p, timeout: 0 }
        if (t === -1) return p
        if (t > 0) return p
        return { ...p, timeout: DEFAULT_FALLBACK_MS }
      })
      sourcePriorities[pathIndex] = {
        ...sourcePriorities[pathIndex],
        priorities: normalised
      }

      const allTimeoutsOk = sourcePriorities.every((pp) =>
        checkTimeouts(pp.priorities)
      )
      return {
        sourcePrioritiesData: {
          ...state.sourcePrioritiesData,
          sourcePriorities,
          saveState: {
            ...state.sourcePrioritiesData.saveState,
            dirty: true,
            timeoutsOk: allTimeoutsOk
          }
        }
      }
    })
  },

  setSaving: () => {
    set((state) => ({
      sourcePrioritiesData: {
        ...state.sourcePrioritiesData,
        saveState: {
          ...state.sourcePrioritiesData.saveState,
          isSaving: true,
          saveFailed: false
        }
      }
    }))
  },

  setSaved: () => {
    set((state) => ({
      sourcePrioritiesData: {
        ...state.sourcePrioritiesData,
        saveState: {
          ...state.sourcePrioritiesData.saveState,
          dirty: false,
          isSaving: false,
          saveFailed: false
        }
      }
    }))
  },

  setSaveFailed: () => {
    set((state) => ({
      sourcePrioritiesData: {
        ...state.sourcePrioritiesData,
        saveState: {
          ...state.sourcePrioritiesData.saveState,
          isSaving: false,
          saveFailed: true
        }
      }
    }))
  },

  clearSaveFailed: () => {
    set((state) => ({
      sourcePrioritiesData: {
        ...state.sourcePrioritiesData,
        saveState: {
          ...state.sourcePrioritiesData.saveState,
          saveFailed: false
        }
      }
    }))
  },

  setPathPriorities: (path, priorities) => {
    set((state) => {
      const sourcePriorities = [...state.sourcePrioritiesData.sourcePriorities]
      const existingIndex = sourcePriorities.findIndex((pp) => pp.path === path)
      if (existingIndex === -1) {
        sourcePriorities.push({ path, priorities })
      } else {
        sourcePriorities[existingIndex] = { path, priorities }
      }
      const allTimeoutsOk = sourcePriorities.every((pp) =>
        checkTimeouts(pp.priorities)
      )
      return {
        sourcePrioritiesData: {
          ...state.sourcePrioritiesData,
          sourcePriorities,
          saveState: {
            ...state.sourcePrioritiesData.saveState,
            dirty: true,
            timeoutsOk: allTimeoutsOk
          }
        }
      }
    })
  },

  setPriorityGroups: (groups) => {
    set((state) => ({
      priorityGroupsData: {
        ...state.priorityGroupsData,
        groups,
        saveState: { ...state.priorityGroupsData.saveState, dirty: true }
      }
    }))
  },

  setPriorityGroupsFromServer: (groups) => {
    set((state) => {
      // Mark every currently-suppressed ref as retiring. Step 2 of
      // the two-step gate: now that the saved config has been
      // accepted by the server, a subsequent reconcile that no
      // longer lists the ref as a newcomer means the source is
      // genuinely gone and the suppression can retire. See
      // clearRetiredSuppressions for the matching drop.
      const retiringNewcomersByGroup: Record<string, string[]> = {}
      for (const [groupId, refs] of Object.entries(
        state.suppressedNewcomersByGroup
      )) {
        if (refs.length > 0) retiringNewcomersByGroup[groupId] = [...refs]
      }
      return {
        priorityGroupsData: {
          groups,
          saveState: { dirty: false, timeoutsOk: true }
        },
        retiringNewcomersByGroup
      }
    })
  },

  reorderGroupSources: (groupId, from, to) => {
    set((state) => {
      const existing = state.priorityGroupsData.groups.find(
        (g) => g.id === groupId
      )
      if (!existing) return state
      if (
        from < 0 ||
        to < 0 ||
        from >= existing.sources.length ||
        to >= existing.sources.length ||
        from === to
      ) {
        return state
      }
      const groups = state.priorityGroupsData.groups.map((g) => {
        if (g.id !== groupId) return g
        const sources = [...g.sources]
        const [moved] = sources.splice(from, 1)
        sources.splice(to, 0, moved)
        return { ...g, sources }
      })
      return {
        priorityGroupsData: {
          ...state.priorityGroupsData,
          groups,
          saveState: { ...state.priorityGroupsData.saveState, dirty: true }
        }
      }
    })
  },

  setGroupSources: (groupId, sources) => {
    set((state) => {
      const existing = state.priorityGroupsData.groups.find(
        (g) => g.id === groupId
      )
      const groups = existing
        ? state.priorityGroupsData.groups.map((g) =>
            g.id === groupId ? { ...g, sources } : g
          )
        : [
            ...state.priorityGroupsData.groups,
            { id: groupId, sources, inactive: false }
          ]
      return {
        priorityGroupsData: {
          ...state.priorityGroupsData,
          groups,
          saveState: { ...state.priorityGroupsData.saveState, dirty: true }
        }
      }
    })
  },

  setGroupInactive: (groupId, inactive) => {
    set((state) => {
      const existing = state.priorityGroupsData.groups.find(
        (g) => g.id === groupId
      )
      // Unranked groups don't have a saved entry yet. Without inserting
      // one here a Deactivate click would be a silent no-op: map() would
      // not touch anything, the displayed group would re-derive inactive
      // from the missing saved entry, and the only on-screen feedback
      // (Save going dirty) would be misleading.
      const groups = existing
        ? state.priorityGroupsData.groups.map((g) =>
            g.id === groupId ? { ...g, inactive } : g
          )
        : [
            ...state.priorityGroupsData.groups,
            { id: groupId, sources: [], inactive }
          ]
      return {
        priorityGroupsData: {
          ...state.priorityGroupsData,
          groups,
          saveState: { ...state.priorityGroupsData.saveState, dirty: true }
        }
      }
    })
  },

  suppressNewcomerInGroup: (groupId, sourceRef) => {
    set((state) => {
      const existing = state.suppressedNewcomersByGroup[groupId] ?? []
      if (existing.includes(sourceRef)) return state
      return {
        suppressedNewcomersByGroup: {
          ...state.suppressedNewcomersByGroup,
          [groupId]: [...existing, sourceRef]
        }
      }
    })
  },

  clearRetiredSuppressions: (newcomerSourcesByGroup) => {
    set((state) => {
      // Step 3 of the two-step gate. For each (groupId, ref) marked
      // as retiring, drop both the suppression and the retiring
      // marker once the server confirms the ref is no longer a
      // newcomer for that group. A ref that's still in newcomers
      // stays suppressed (upstream re-pushed during the Save gap);
      // it'll retire on the next reconcile that genuinely shows
      // absence. After retirement the ref has no client-side memory
      // — when the source reappears it's a fresh newcomer.
      const retiring = state.retiringNewcomersByGroup
      if (Object.keys(retiring).length === 0) return state
      let changed = false
      const nextSuppressed: Record<string, string[]> = {
        ...state.suppressedNewcomersByGroup
      }
      const nextRetiring: Record<string, string[]> = { ...retiring }
      for (const [groupId, refs] of Object.entries(retiring)) {
        const stillNewcomers = new Set(newcomerSourcesByGroup[groupId] ?? [])
        const stillRetiring = refs.filter((ref) => stillNewcomers.has(ref))
        const toClear = refs.filter((ref) => !stillNewcomers.has(ref))
        if (toClear.length === 0) continue
        changed = true
        if (stillRetiring.length > 0) {
          nextRetiring[groupId] = stillRetiring
        } else {
          delete nextRetiring[groupId]
        }
        const cleared = (nextSuppressed[groupId] ?? []).filter(
          (ref) => !toClear.includes(ref)
        )
        if (cleared.length > 0) {
          nextSuppressed[groupId] = cleared
        } else {
          delete nextSuppressed[groupId]
        }
      }
      if (!changed) return state
      return {
        suppressedNewcomersByGroup: nextSuppressed,
        retiringNewcomersByGroup: nextRetiring
      }
    })
  },

  setGroupsSaving: () => {
    set((state) => ({
      priorityGroupsData: {
        ...state.priorityGroupsData,
        saveState: {
          ...state.priorityGroupsData.saveState,
          isSaving: true,
          saveFailed: false
        }
      }
    }))
  },

  setGroupsSaved: () => {
    set((state) => ({
      priorityGroupsData: {
        ...state.priorityGroupsData,
        saveState: {
          ...state.priorityGroupsData.saveState,
          dirty: false,
          isSaving: false,
          saveFailed: false
        }
      }
    }))
  },

  setGroupsSaveFailed: () => {
    set((state) => ({
      priorityGroupsData: {
        ...state.priorityGroupsData,
        saveState: {
          ...state.priorityGroupsData.saveState,
          isSaving: false,
          saveFailed: true
        }
      }
    }))
  },

  clearGroupsSaveFailed: () => {
    set((state) => ({
      priorityGroupsData: {
        ...state.priorityGroupsData,
        saveState: {
          ...state.priorityGroupsData.saveState,
          saveFailed: false
        }
      }
    }))
  },

  setPriorityDefaultsFromServer: (defaults) => {
    set({
      priorityDefaultsData: {
        defaults,
        saveState: { dirty: false, timeoutsOk: true }
      }
    })
  },

  setPriorityDefaults: (defaults) => {
    set((state) => ({
      priorityDefaultsData: {
        ...state.priorityDefaultsData,
        defaults,
        saveState: { ...state.priorityDefaultsData.saveState, dirty: true }
      }
    }))
  },

  setPriorityOverridesFromServer: (paths) => {
    set({
      priorityOverridesData: {
        paths: [...paths].sort(),
        saveState: { dirty: false, timeoutsOk: true }
      }
    })
  },

  addPriorityOverride: (path) => {
    set((state) => {
      if (state.priorityOverridesData.paths.includes(path)) return state
      return {
        priorityOverridesData: {
          ...state.priorityOverridesData,
          paths: [...state.priorityOverridesData.paths, path].sort(),
          saveState: {
            ...state.priorityOverridesData.saveState,
            dirty: true
          }
        }
      }
    })
  },

  removePriorityOverride: (path) => {
    set((state) => {
      if (!state.priorityOverridesData.paths.includes(path)) return state
      return {
        priorityOverridesData: {
          ...state.priorityOverridesData,
          paths: state.priorityOverridesData.paths.filter((p) => p !== path),
          saveState: {
            ...state.priorityOverridesData.saveState,
            dirty: true
          }
        }
      }
    })
  }
})
