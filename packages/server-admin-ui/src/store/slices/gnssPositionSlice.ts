import type { StateCreator } from 'zustand'
import type {
  GnssCorrectionMode,
  GnssSensorConfig,
  GnssSensorsData
} from '../types'

export interface GnssConfigPayload {
  correction: GnssCorrectionMode
  sensors: GnssSensorConfig[]
}

// Canonical empty server state, shared with every consumer that needs a
// fallback so the default cannot drift.
export const EMPTY_GNSS_CONFIG: GnssConfigPayload = {
  correction: 'off',
  sensors: []
}

export interface GnssPositionSliceState {
  gnssSensorsData: GnssSensorsData
  positionSources: string[]
}

export interface GnssPositionSliceActions {
  /** Replace the correction mode + sensor rows with server state.
   * Skipped while local edits are unsaved (dirty) so a live
   * GNSS_SENSORS event from another session cannot clobber in-progress
   * work; pass force to override (e.g. after a reset that just deleted
   * the config server-side). */
  setGnssSensors: (config: GnssConfigPayload, force?: boolean) => void
  setGnssCorrection: (correction: GnssCorrectionMode) => void
  setPositionSources: (sources: string[]) => void
  /** Returns false when the edit was rejected (out-of-range index or a
   * duplicate sensorId/$source) so callers can surface the reason
   * instead of letting the input silently snap back. */
  updateGnssSensor: (
    index: number,
    updates: Partial<GnssSensorConfig>
  ) => boolean
  addGnssSensor: ($source: string) => void
  removeGnssSensor: (index: number) => void
  setGnssSaving: () => void
  setGnssSaved: () => void
  setGnssSaveFailed: (message?: string) => void
  clearGnssSaveFailed: () => void
}

export type GnssPositionSlice = GnssPositionSliceState &
  GnssPositionSliceActions

function nextSensorId(sensors: GnssSensorConfig[]): string {
  const existing = new Set(sensors.map((s) => s.sensorId))
  for (let i = 1; ; i++) {
    const id = `gnss${i}`
    if (!existing.has(id)) return id
  }
}

const initialGnssPositionState: GnssPositionSliceState = {
  gnssSensorsData: {
    correction: 'off',
    sensors: [],
    saveState: {
      dirty: false,
      timeoutsOk: true
    }
  },
  positionSources: []
}

export const createGnssPositionSlice: StateCreator<
  GnssPositionSlice,
  [],
  [],
  GnssPositionSlice
> = (set) => ({
  ...initialGnssPositionState,

  setGnssSensors: (config, force = false) => {
    set((state) => {
      if (!force && state.gnssSensorsData.saveState.dirty) return state
      return {
        gnssSensorsData: {
          correction: config.correction,
          sensors: config.sensors,
          saveState: {
            dirty: false,
            timeoutsOk: true
          }
        }
      }
    })
  },

  setGnssCorrection: (correction) => {
    set((state) => {
      if (state.gnssSensorsData.correction === correction) return state
      return {
        gnssSensorsData: {
          ...state.gnssSensorsData,
          correction,
          saveState: { ...state.gnssSensorsData.saveState, dirty: true }
        }
      }
    })
  },

  setPositionSources: (positionSources) => {
    set({ positionSources })
  },

  updateGnssSensor: (index, updates) => {
    let applied = false
    set((state) => {
      const current = state.gnssSensorsData.sensors
      if (index < 0 || index >= current.length) return state
      if (
        updates.$source !== undefined &&
        current.some((s, i) => i !== index && s.$source === updates.$source)
      ) {
        return state
      }
      if (
        updates.sensorId !== undefined &&
        current.some((s, i) => i !== index && s.sensorId === updates.sensorId)
      ) {
        return state
      }
      applied = true
      const sensors = [...current]
      sensors[index] = { ...sensors[index], ...updates }
      return {
        gnssSensorsData: {
          ...state.gnssSensorsData,
          sensors,
          saveState: { ...state.gnssSensorsData.saveState, dirty: true }
        }
      }
    })
    return applied
  },

  addGnssSensor: ($source) => {
    set((state) => {
      if (
        $source &&
        state.gnssSensorsData.sensors.some((s) => s.$source === $source)
      ) {
        return state
      }
      const sensors = [
        ...state.gnssSensorsData.sensors,
        {
          sensorId: nextSensorId(state.gnssSensorsData.sensors),
          $source,
          fromBow: null,
          fromCenter: null
        }
      ]
      return {
        gnssSensorsData: {
          ...state.gnssSensorsData,
          sensors,
          saveState: { ...state.gnssSensorsData.saveState, dirty: true }
        }
      }
    })
  },

  removeGnssSensor: (index) => {
    set((state) => {
      const current = state.gnssSensorsData.sensors
      if (index < 0 || index >= current.length) return state
      const sensors = current.filter((_, i) => i !== index)
      return {
        gnssSensorsData: {
          ...state.gnssSensorsData,
          sensors,
          saveState: { ...state.gnssSensorsData.saveState, dirty: true }
        }
      }
    })
  },

  setGnssSaving: () => {
    set((state) => ({
      gnssSensorsData: {
        ...state.gnssSensorsData,
        saveState: {
          ...state.gnssSensorsData.saveState,
          isSaving: true,
          saveFailed: false
        },
        saveError: undefined
      }
    }))
  },

  setGnssSaved: () => {
    set((state) => ({
      gnssSensorsData: {
        ...state.gnssSensorsData,
        saveState: {
          ...state.gnssSensorsData.saveState,
          dirty: false,
          isSaving: false,
          saveFailed: false
        },
        saveError: undefined
      }
    }))
  },

  setGnssSaveFailed: (message?: string) => {
    set((state) => ({
      gnssSensorsData: {
        ...state.gnssSensorsData,
        saveState: {
          ...state.gnssSensorsData.saveState,
          isSaving: false,
          saveFailed: true
        },
        saveError: message
      }
    }))
  },

  clearGnssSaveFailed: () => {
    set((state) => ({
      gnssSensorsData: {
        ...state.gnssSensorsData,
        saveState: {
          ...state.gnssSensorsData.saveState,
          saveFailed: false
        },
        saveError: undefined
      }
    }))
  }
})
