import type { StateCreator } from 'zustand'
import remove from 'lodash.remove'
import type {
  SourcePrioritiesData,
  SourcePriority,
  PathPriority
} from '../types'

function checkTimeouts(priorities: SourcePriority[]): boolean {
  return priorities.reduce((acc: boolean, prio, i) => {
    const { timeout } = prio
    if (!acc) {
      return acc
    }
    if (i === 0) {
      return true
    }

    const thisOne = Number(timeout)
    if (Number.isNaN(thisOne) || thisOne <= 0) {
      return false
    }
    if (i === 1) {
      return true
    }

    return thisOne > Number(priorities[i - 1].timeout)
  }, true)
}

export interface PrioritiesSliceState {
  sourcePrioritiesData: SourcePrioritiesData
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
  setSaving: () => void
  setSaved: () => void
  setSaveFailed: () => void
  clearSaveFailed: () => void
}

export type PrioritiesSlice = PrioritiesSliceState & PrioritiesSliceActions

const initialPrioritiesState: PrioritiesSliceState = {
  sourcePrioritiesData: {
    sourcePriorities: [],
    saveState: {
      dirty: false,
      timeoutsOk: true
    }
  }
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
        prios.push({ sourceRef: '', timeout: '' })
      }
      prios[index] = { sourceRef, timeout }
      sourcePriorities[pathIndex] = {
        ...sourcePriorities[pathIndex],
        priorities: prios
      }

      return {
        sourcePrioritiesData: {
          ...state.sourcePrioritiesData,
          sourcePriorities,
          saveState: {
            ...state.sourcePrioritiesData.saveState,
            dirty: true,
            timeoutsOk: checkTimeouts(prios)
          }
        }
      }
    })
  },

  deletePriority: (pathIndex, index) => {
    set((state) => {
      const sourcePriorities = [...state.sourcePrioritiesData.sourcePriorities]
      const prios = [...sourcePriorities[pathIndex].priorities]
      remove(prios, (_, i) => i === index)
      sourcePriorities[pathIndex] = {
        ...sourcePriorities[pathIndex],
        priorities: prios
      }

      return {
        sourcePrioritiesData: {
          ...state.sourcePrioritiesData,
          sourcePriorities,
          saveState: { ...state.sourcePrioritiesData.saveState, dirty: true }
        }
      }
    })
  },

  movePriority: (pathIndex, index, change) => {
    set((state) => {
      const sourcePriorities = [...state.sourcePrioritiesData.sourcePriorities]
      const prios = [...sourcePriorities[pathIndex].priorities]
      const tmp = prios[index]
      prios[index] = prios[index + change]
      prios[index + change] = tmp
      sourcePriorities[pathIndex] = {
        ...sourcePriorities[pathIndex],
        priorities: prios
      }

      return {
        sourcePrioritiesData: {
          ...state.sourcePrioritiesData,
          sourcePriorities,
          saveState: {
            ...state.sourcePrioritiesData.saveState,
            dirty: true,
            timeoutsOk: checkTimeouts(prios)
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
  }
})
