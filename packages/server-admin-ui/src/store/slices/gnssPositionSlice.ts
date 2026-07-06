import type { StateCreator } from 'zustand'
import type { GnssSensorConfig, GnssSensorsData } from '../types'

export interface GnssPositionSliceState {
  gnssSensorsData: GnssSensorsData
  positionSources: string[]
}

export interface GnssPositionSliceActions {
  /** Replace the sensor rows with server state. Skipped while local
   * edits are unsaved (dirty) so a live GNSS_SENSORS event from another
   * session cannot clobber in-progress work; pass force to override
   * (e.g. after a reset that just deleted the config server-side). */
  setGnssSensors: (sensors: GnssSensorConfig[], force?: boolean) => void
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

  setGnssSensors: (sensors, force = false) => {
    set((state) => {
      if (!force && state.gnssSensorsData.saveState.dirty) return state
      return {
        gnssSensorsData: {
          sensors,
          saveState: {
            dirty: false,
            timeoutsOk: true
          }
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
        }
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
