import type { StateCreator } from 'zustand'
import type {
  GnssCorrectionMode,
  GnssCorrectionStatus,
  GnssSensorConfig,
  GnssSensorsData
} from '../types'

// v2 sensors API endpoint for the GNSS config; single source of truth for
// both the initial REST load (dataFetching) and the settings page.
export const GNSS_API_PATH = '/signalk/v2/api/vessels/self/sensors/gnss'

export interface GnssConfigPayload {
  correction: GnssCorrectionMode
  sensors: GnssSensorConfig[]
  status?: GnssCorrectionStatus
}

// Canonical empty server state, shared with every consumer that needs a
// fallback so the default cannot drift. Frozen so a stray push/assign on a
// consumer cannot corrupt the shared default for every other caller.
export const EMPTY_GNSS_CONFIG: Readonly<GnssConfigPayload> = Object.freeze({
  correction: 'off',
  // Freeze the array too: it is shared by reference into every
  // setGnssSensors(EMPTY_GNSS_CONFIG) call, so a shallow freeze would still
  // let a stray push/sort corrupt the shared default.
  sensors: Object.freeze([]) as GnssSensorConfig[]
})

function isGnssCorrectionMode(v: unknown): v is GnssCorrectionMode {
  return v === 'off' || v === 'replace' || v === 'both'
}

function isGnssCorrectionStatus(v: unknown): v is GnssCorrectionStatus {
  if (typeof v !== 'object' || v === null) return false
  const s = v as GnssCorrectionStatus
  return (
    isGnssCorrectionMode(s.mode) &&
    typeof s.active === 'boolean' &&
    (s.blocked === undefined ||
      s.blocked === 'no-length' ||
      s.blocked === 'no-heading')
  )
}

function isGnssSensorConfig(v: unknown): v is GnssSensorConfig {
  if (typeof v !== 'object' || v === null) return false
  const s = v as GnssSensorConfig
  return (
    typeof s.sensorId === 'string' &&
    typeof s.$source === 'string' &&
    (s.fromBow === null || typeof s.fromBow === 'number') &&
    (s.fromCenter === null || typeof s.fromCenter === 'number')
  )
}

// Coerce an untrusted server payload (REST GET body or a GNSS_SENSORS
// websocket event) into a valid config, falling back to the empty default
// on any shape mismatch so both entry points validate the same way.
export function sanitizeGnssConfig(data: unknown): GnssConfigPayload {
  const payload = data as Partial<GnssConfigPayload> | undefined
  if (
    !payload ||
    !isGnssCorrectionMode(payload.correction) ||
    !Array.isArray(payload.sensors) ||
    !payload.sensors.every(isGnssSensorConfig)
  ) {
    return EMPTY_GNSS_CONFIG
  }
  return {
    correction: payload.correction,
    sensors: payload.sensors,
    status: isGnssCorrectionStatus(payload.status) ? payload.status : undefined
  }
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
          status: config.status,
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
