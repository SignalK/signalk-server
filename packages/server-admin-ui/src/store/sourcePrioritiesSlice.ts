import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import remove from 'lodash.remove'
import type { SourcePrioritiesData, SourcePriority } from './types'

// Action type constants (exported for backward compatibility)
export const SOURCEPRIOS_PRIO_CHANGED = 'sourcePriorities/prioChanged'
export const SOURCEPRIOS_PRIO_DELETED = 'sourcePriorities/prioDeleted'
export const SOURCEPRIOS_PRIO_MOVED = 'sourcePriorities/prioMoved'
export const SOURCEPRIOS_PATH_CHANGED = 'sourcePriorities/pathChanged'
export const SOURCEPRIOS_PATH_DELETED = 'sourcePriorities/pathDeleted'
export const SOURCEPRIOS_SAVING = 'sourcePriorities/saving'
export const SOURCEPRIOS_SAVED = 'sourcePriorities/saved'
export const SOURCEPRIOS_SAVE_FAILED = 'sourcePriorities/saveFailed'
export const SOURCEPRIOS_SAVE_FAILED_OVER = 'sourcePriorities/saveFailedOver'

function checkTimeouts(priorities: SourcePriority[]): boolean {
  return priorities.reduce((acc: boolean, prio, i) => {
    const { timeout } = prio
    if (!acc) return acc
    if (i === 0) return true

    const thisOne = Number(timeout)
    if (Number.isNaN(thisOne) || thisOne <= 0) return false
    if (i === 1) return true

    return thisOne > Number(priorities[i - 1].timeout)
  }, true)
}

interface PrioChangedPayload {
  pathIndex: number
  index: number
  sourceRef: string
  timeout: string | number
}

interface PrioDeletedPayload {
  pathIndex: number
  index: number
}

interface PrioMovedPayload {
  pathIndex: number
  index: number
  change: 1 | -1
}

interface PathChangedPayload {
  index: number
  path: string
}

interface PathDeletedPayload {
  index: number
}

const initialState: SourcePrioritiesData = {
  sourcePriorities: [],
  saveState: {
    dirty: false,
    timeoutsOk: true
  }
}

const sourcePrioritiesSlice = createSlice({
  name: 'sourcePriorities',
  initialState,
  reducers: {
    setSourcePriorities(
      state,
      action: PayloadAction<Record<string, SourcePriority[]>>
    ) {
      const sourcePrioritiesMap = action.payload
      state.sourcePriorities = Object.keys(sourcePrioritiesMap).map((key) => ({
        path: key,
        priorities: sourcePrioritiesMap[key]
      }))
      state.saveState = {
        dirty: false,
        timeoutsOk: true
      }
    },

    pathChanged(state, action: PayloadAction<PathChangedPayload>) {
      const { index, path } = action.payload
      if (index === state.sourcePriorities.length) {
        state.sourcePriorities.push({ path: '', priorities: [] })
      }
      state.sourcePriorities[index].path = path
      state.saveState.dirty = true
    },

    pathDeleted(state, action: PayloadAction<PathDeletedPayload>) {
      const { index } = action.payload
      remove(state.sourcePriorities, (_, i) => i === index)
      state.saveState.dirty = true
    },

    prioChanged(state, action: PayloadAction<PrioChangedPayload>) {
      const { pathIndex, index, sourceRef, timeout } = action.payload
      if (pathIndex === state.sourcePriorities.length) {
        state.sourcePriorities.push({ path: '', priorities: [] })
      }
      const prios = state.sourcePriorities[pathIndex].priorities
      if (index === prios.length) {
        prios.push({ sourceRef: '', timeout: '' })
      }
      prios[index] = { sourceRef, timeout }
      state.saveState.dirty = true
      state.saveState.timeoutsOk = checkTimeouts(prios)
    },

    prioDeleted(state, action: PayloadAction<PrioDeletedPayload>) {
      const { pathIndex, index } = action.payload
      const prios = state.sourcePriorities[pathIndex].priorities
      remove(prios, (_, i) => i === index)
      state.saveState.dirty = true
    },

    prioMoved(state, action: PayloadAction<PrioMovedPayload>) {
      const { pathIndex, index, change } = action.payload
      const prios = state.sourcePriorities[pathIndex].priorities
      const tmp = prios[index]
      prios[index] = prios[index + change]
      prios[index + change] = tmp
      state.saveState.dirty = true
      state.saveState.timeoutsOk = checkTimeouts(prios)
    },

    saving(state) {
      state.saveState.isSaving = true
      state.saveState.saveFailed = false
    },

    saved(state) {
      state.saveState.dirty = false
      state.saveState.isSaving = false
      state.saveState.saveFailed = false
    },

    saveFailed(state) {
      state.saveState.isSaving = false
      state.saveState.saveFailed = true
    },

    saveFailedOver(state) {
      state.saveState.saveFailed = false
    }
  }
})

export const {
  setSourcePriorities,
  pathChanged,
  pathDeleted,
  prioChanged,
  prioDeleted,
  prioMoved,
  saving,
  saved,
  saveFailed,
  saveFailedOver
} = sourcePrioritiesSlice.actions

export default sourcePrioritiesSlice.reducer
