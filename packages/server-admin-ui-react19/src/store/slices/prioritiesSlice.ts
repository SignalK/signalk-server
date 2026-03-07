import type { StateCreator } from 'zustand'
import remove from 'lodash.remove'
import type {
  SourcePrioritiesData,
  SourcePriority,
  PathPriority,
  SourceRankingData,
  SourceRankingEntry
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

function checkRankingTimeouts(ranking: SourceRankingEntry[]): boolean {
  return ranking.every((entry, i) => {
    if (i === 0) {
      return true
    }
    const value = Number(entry.timeout)
    // Allow -1 (disabled) or positive values
    return !Number.isNaN(value) && (value === -1 || value > 0)
  })
}

export interface PrioritiesSliceState {
  sourcePrioritiesData: SourcePrioritiesData
  sourceRankingData: SourceRankingData
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
  // Source ranking actions
  setSourceRanking: (ranking: SourceRankingEntry[]) => void
  addRankedSource: (sourceRef: string, timeout: number) => void
  removeRankedSource: (index: number) => void
  moveRankedSource: (index: number, change: 1 | -1) => void
  changeRankedTimeout: (index: number, timeout: string | number) => void
  setRankingSaving: () => void
  setRankingSaved: () => void
  setRankingSaveFailed: () => void
  clearRankingSaveFailed: () => void
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
  sourceRankingData: {
    ranking: [],
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
        prios.push({ sourceRef: '', timeout: index > 0 ? 60000 : '' })
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
  },

  // Source ranking actions
  setSourceRanking: (ranking) => {
    set({
      sourceRankingData: {
        ranking,
        saveState: {
          dirty: false,
          timeoutsOk: true
        }
      }
    })
  },

  addRankedSource: (sourceRef, timeout) => {
    set((state) => {
      const ranking = [
        ...state.sourceRankingData.ranking,
        { sourceRef, timeout }
      ]
      return {
        sourceRankingData: {
          ...state.sourceRankingData,
          ranking,
          saveState: {
            ...state.sourceRankingData.saveState,
            dirty: true,
            timeoutsOk: checkRankingTimeouts(ranking)
          }
        }
      }
    })
  },

  removeRankedSource: (index) => {
    set((state) => {
      const ranking = [...state.sourceRankingData.ranking]
      remove(ranking, (_, i) => i === index)
      return {
        sourceRankingData: {
          ...state.sourceRankingData,
          ranking,
          saveState: {
            ...state.sourceRankingData.saveState,
            dirty: true,
            timeoutsOk: checkRankingTimeouts(ranking)
          }
        }
      }
    })
  },

  moveRankedSource: (index, change) => {
    set((state) => {
      const ranking = [...state.sourceRankingData.ranking]
      const tmp = ranking[index]
      ranking[index] = ranking[index + change]
      ranking[index + change] = tmp
      return {
        sourceRankingData: {
          ...state.sourceRankingData,
          ranking,
          saveState: {
            ...state.sourceRankingData.saveState,
            dirty: true,
            timeoutsOk: checkRankingTimeouts(ranking)
          }
        }
      }
    })
  },

  changeRankedTimeout: (index, timeout) => {
    set((state) => {
      const ranking = [...state.sourceRankingData.ranking]
      ranking[index] = { ...ranking[index], timeout }
      return {
        sourceRankingData: {
          ...state.sourceRankingData,
          ranking,
          saveState: {
            ...state.sourceRankingData.saveState,
            dirty: true,
            timeoutsOk: checkRankingTimeouts(ranking)
          }
        }
      }
    })
  },

  setRankingSaving: () => {
    set((state) => ({
      sourceRankingData: {
        ...state.sourceRankingData,
        saveState: {
          ...state.sourceRankingData.saveState,
          isSaving: true,
          saveFailed: false
        }
      }
    }))
  },

  setRankingSaved: () => {
    set((state) => ({
      sourceRankingData: {
        ...state.sourceRankingData,
        saveState: {
          ...state.sourceRankingData.saveState,
          dirty: false,
          isSaving: false,
          saveFailed: false
        }
      }
    }))
  },

  setRankingSaveFailed: () => {
    set((state) => ({
      sourceRankingData: {
        ...state.sourceRankingData,
        saveState: {
          ...state.sourceRankingData.saveState,
          isSaving: false,
          saveFailed: true
        }
      }
    }))
  },

  clearRankingSaveFailed: () => {
    set((state) => ({
      sourceRankingData: {
        ...state.sourceRankingData,
        saveState: {
          ...state.sourceRankingData.saveState,
          saveFailed: false
        }
      }
    }))
  }
})
