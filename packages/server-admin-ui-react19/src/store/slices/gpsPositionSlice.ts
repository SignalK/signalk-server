import type { StateCreator } from 'zustand'
import remove from 'lodash.remove'
import type { GpsSensorConfig, GpsSensorsData } from '../types'

export interface GpsPositionSliceState {
  gpsSensorsData: GpsSensorsData
  positionSources: string[]
}

export interface GpsPositionSliceActions {
  setGpsSensors: (sensors: GpsSensorConfig[]) => void
  setPositionSources: (sources: string[]) => void
  updateGpsSensor: (index: number, updates: Partial<GpsSensorConfig>) => void
  addGpsSensor: (sourceRef: string) => void
  removeGpsSensor: (index: number) => void
  setGpsSaving: () => void
  setGpsSaved: () => void
  setGpsSaveFailed: () => void
  clearGpsSaveFailed: () => void
}

export type GpsPositionSlice = GpsPositionSliceState & GpsPositionSliceActions

function nextSensorId(sensors: GpsSensorConfig[]): string {
  const existing = new Set(sensors.map((s) => s.sensorId))
  for (let i = 1; ; i++) {
    const id = `gps${i}`
    if (!existing.has(id)) return id
  }
}

const initialGpsPositionState: GpsPositionSliceState = {
  gpsSensorsData: {
    sensors: [],
    saveState: {
      dirty: false,
      timeoutsOk: true
    }
  },
  positionSources: []
}

export const createGpsPositionSlice: StateCreator<
  GpsPositionSlice,
  [],
  [],
  GpsPositionSlice
> = (set) => ({
  ...initialGpsPositionState,

  setGpsSensors: (sensors) => {
    set({
      gpsSensorsData: {
        sensors,
        saveState: {
          dirty: false,
          timeoutsOk: true
        }
      }
    })
  },

  setPositionSources: (positionSources) => {
    set({ positionSources })
  },

  updateGpsSensor: (index, updates) => {
    set((state) => {
      const sensors = [...state.gpsSensorsData.sensors]
      sensors[index] = { ...sensors[index], ...updates }
      return {
        gpsSensorsData: {
          ...state.gpsSensorsData,
          sensors,
          saveState: { ...state.gpsSensorsData.saveState, dirty: true }
        }
      }
    })
  },

  addGpsSensor: (sourceRef) => {
    set((state) => {
      const sensors = [
        ...state.gpsSensorsData.sensors,
        {
          sensorId: nextSensorId(state.gpsSensorsData.sensors),
          sourceRef,
          fromBow: null,
          fromCenter: null
        }
      ]
      return {
        gpsSensorsData: {
          ...state.gpsSensorsData,
          sensors,
          saveState: { ...state.gpsSensorsData.saveState, dirty: true }
        }
      }
    })
  },

  removeGpsSensor: (index) => {
    set((state) => {
      const sensors = [...state.gpsSensorsData.sensors]
      remove(sensors, (_, i) => i === index)
      return {
        gpsSensorsData: {
          ...state.gpsSensorsData,
          sensors,
          saveState: { ...state.gpsSensorsData.saveState, dirty: true }
        }
      }
    })
  },

  setGpsSaving: () => {
    set((state) => ({
      gpsSensorsData: {
        ...state.gpsSensorsData,
        saveState: {
          ...state.gpsSensorsData.saveState,
          isSaving: true,
          saveFailed: false
        }
      }
    }))
  },

  setGpsSaved: () => {
    set((state) => ({
      gpsSensorsData: {
        ...state.gpsSensorsData,
        saveState: {
          ...state.gpsSensorsData.saveState,
          dirty: false,
          isSaving: false,
          saveFailed: false
        }
      }
    }))
  },

  setGpsSaveFailed: () => {
    set((state) => ({
      gpsSensorsData: {
        ...state.gpsSensorsData,
        saveState: {
          ...state.gpsSensorsData.saveState,
          isSaving: false,
          saveFailed: true
        }
      }
    }))
  },

  clearGpsSaveFailed: () => {
    set((state) => ({
      gpsSensorsData: {
        ...state.gpsSensorsData,
        saveState: {
          ...state.gpsSensorsData.saveState,
          saveFailed: false
        }
      }
    }))
  }
})
