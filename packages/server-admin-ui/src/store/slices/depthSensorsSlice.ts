import type { StateCreator } from 'zustand'
import type { DepthSensorConfig, DepthSensorsData } from '../types'

// v2 sensors API endpoint for the depth transducer positions, shared by the
// initial REST load (dataFetching) and the settings page.
export const DEPTH_API_PATH = '/signalk/v2/api/vessels/self/sensors/depth'

export interface DepthConfigPayload {
  sensors: readonly DepthSensorConfig[]
}

export const EMPTY_DEPTH_CONFIG: Readonly<DepthConfigPayload> = Object.freeze({
  sensors: Object.freeze<DepthSensorConfig[]>([])
})

const isNullableNumber = (v: unknown): boolean =>
  v === null || typeof v === 'number'

function isDepthSensorConfig(v: unknown): v is DepthSensorConfig {
  if (typeof v !== 'object' || v === null) return false
  const s = v as DepthSensorConfig
  return (
    typeof s.sensorId === 'string' &&
    typeof s.$source === 'string' &&
    isNullableNumber(s.fromBow) &&
    isNullableNumber(s.fromCenter) &&
    isNullableNumber(s.fromWaterline)
  )
}

// Coerce an untrusted server payload (REST GET body or a DEPTH_SENSORS
// websocket event) into a valid config, falling back to the empty default
// on any shape mismatch so both entry points validate the same way.
export function sanitizeDepthConfig(data: unknown): DepthConfigPayload {
  const payload = data as Partial<DepthConfigPayload> | undefined
  if (
    !payload ||
    !Array.isArray(payload.sensors) ||
    !payload.sensors.every(isDepthSensorConfig)
  ) {
    return EMPTY_DEPTH_CONFIG
  }
  return { sensors: payload.sensors }
}

export interface DepthSensorsSliceState {
  depthSensorsData: DepthSensorsData
  depthSources: string[]
}

export interface DepthSensorsSliceActions {
  /** Replace the rows with server state. Skipped while local edits are
   * unsaved so a live DEPTH_SENSORS event cannot clobber them; force
   * overrides that, e.g. after a reset. */
  setDepthSensors: (config: DepthConfigPayload, force?: boolean) => void
  setDepthSources: (sources: string[]) => void
  /** Returns false when the edit was rejected (out-of-range index or a
   * duplicate sensorId/$source). */
  updateDepthSensor: (
    index: number,
    updates: Partial<DepthSensorConfig>
  ) => boolean
  addDepthSensor: ($source: string) => void
  removeDepthSensor: (index: number) => void
  setDepthSaving: () => void
  setDepthSaved: () => void
  setDepthSaveFailed: (message?: string) => void
  clearDepthSaveFailed: () => void
}

export type DepthSensorsSlice = DepthSensorsSliceState &
  DepthSensorsSliceActions

function nextSensorId(sensors: DepthSensorConfig[]): string {
  const existing = new Set(sensors.map((s) => s.sensorId))
  for (let i = 1; ; i++) {
    const id = `depth${i}`
    if (!existing.has(id)) return id
  }
}

const CLEAN_SAVE_STATE = { dirty: false, timeoutsOk: true }

export const createDepthSensorsSlice: StateCreator<
  DepthSensorsSlice,
  [],
  [],
  DepthSensorsSlice
> = (set) => {
  const setSaveState = (
    saveState: Partial<DepthSensorsData['saveState']>,
    saveError?: string
  ) =>
    set((state) => ({
      depthSensorsData: {
        ...state.depthSensorsData,
        saveState: { ...state.depthSensorsData.saveState, ...saveState },
        saveError
      }
    }))

  const setSensors = (
    state: DepthSensorsSliceState,
    sensors: DepthSensorConfig[]
  ) => ({
    depthSensorsData: {
      ...state.depthSensorsData,
      sensors,
      saveState: { ...state.depthSensorsData.saveState, dirty: true }
    }
  })

  return {
    depthSensorsData: { sensors: [], saveState: CLEAN_SAVE_STATE },
    depthSources: [],

    setDepthSensors: (config, force = false) => {
      set((state) => {
        if (!force && state.depthSensorsData.saveState.dirty) return state
        return {
          depthSensorsData: {
            // Copy so the frozen default is never stored as slice state.
            sensors: [...config.sensors],
            saveState: CLEAN_SAVE_STATE
          }
        }
      })
    },

    setDepthSources: (depthSources) => {
      set({ depthSources })
    },

    updateDepthSensor: (index, updates) => {
      let applied = false
      set((state) => {
        const current = state.depthSensorsData.sensors
        if (index < 0 || index >= current.length) return state
        const clashes = (key: '$source' | 'sensorId') =>
          updates[key] !== undefined &&
          current.some((s, i) => i !== index && s[key] === updates[key])
        if (clashes('$source') || clashes('sensorId')) return state
        applied = true
        const sensors = [...current]
        sensors[index] = { ...sensors[index], ...updates }
        return setSensors(state, sensors)
      })
      return applied
    },

    addDepthSensor: ($source) => {
      set((state) => {
        const current = state.depthSensorsData.sensors
        if ($source && current.some((s) => s.$source === $source)) {
          return state
        }
        return setSensors(state, [
          ...current,
          {
            sensorId: nextSensorId(current),
            $source,
            fromBow: null,
            fromCenter: null,
            fromWaterline: null
          }
        ])
      })
    },

    removeDepthSensor: (index) => {
      set((state) => {
        const current = state.depthSensorsData.sensors
        if (index < 0 || index >= current.length) return state
        return setSensors(
          state,
          current.filter((_, i) => i !== index)
        )
      })
    },

    setDepthSaving: () => setSaveState({ isSaving: true, saveFailed: false }),
    setDepthSaved: () =>
      setSaveState({ dirty: false, isSaving: false, saveFailed: false }),
    setDepthSaveFailed: (message) =>
      setSaveState({ isSaving: false, saveFailed: true }, message),
    clearDepthSaveFailed: () => setSaveState({ saveFailed: false })
  }
}
