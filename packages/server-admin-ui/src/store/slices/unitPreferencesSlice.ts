import type { StateCreator } from 'zustand'
import type {
  PresetInfo,
  PresetDetails,
  UnitDefinitions,
  CategoryInfo
} from '../types'

export interface DefaultCategories {
  [category: string]: {
    paths?: string[]
    baseUnit?: string
    [key: string]: unknown
  }
}

export interface UnitPreferencesSliceState {
  activePreset: string
  serverDefaultPreset: string
  presets: PresetInfo[]
  presetDetails: PresetDetails | null
  unitDefinitions: UnitDefinitions | null
  defaultCategories: DefaultCategories | null
  categories: Record<string, CategoryInfo> | null
  unitPrefsLoaded: boolean
  unitPrefsFailedLoads: number
}

export interface UnitPreferencesSliceActions {
  fetchUnitPreferences: () => Promise<void>
  fetchPresetDetails: (presetName: string) => Promise<void>
  setActivePresetAndSave: (preset: string) => Promise<void>
  setServerDefaultPreset: (preset: string) => Promise<void>
  setPresets: (presets: PresetInfo[]) => void
  setActivePreset: (preset: string) => void
  setUnitDefinitions: (defs: UnitDefinitions) => void
  setDefaultCategories: (cats: DefaultCategories) => void
  setCategories: (cats: Record<string, CategoryInfo>) => void
}

export type UnitPreferencesSlice = UnitPreferencesSliceState &
  UnitPreferencesSliceActions

const DEFAULT_PRESETS: PresetInfo[] = [
  { name: 'nautical-metric', label: 'Nautical (Metric)' },
  { name: 'metric', label: 'Metric (SI)' },
  { name: 'imperial-us', label: 'Imperial (US)' },
  { name: 'imperial-uk', label: 'Imperial (UK)' }
]

// Trying again doesn't change a client error, such as a 404 with the
// unitpreferences-api interface switched off, a 401 when not logged in, or
// a 400 for an invalid preset name. So only other failures throw.
async function fetchJsonOrNull(url: string) {
  const response = await fetch(url, { credentials: 'include' })
  if (response.ok) {
    return response.json()
  }
  if (response.status < 500) {
    return null
  }
  throw new Error(`${url}: ${response.status}`)
}

async function fetchPresetsFromServer(): Promise<PresetInfo[]> {
  const data = await fetchJsonOrNull('/signalk/v1/unitpreferences/presets')
  const presets: PresetInfo[] = []
  if (data?.builtIn) {
    for (const p of data.builtIn) {
      presets.push({
        name: typeof p === 'object' ? p.name : p,
        label: typeof p === 'object' ? p.displayName || p.name : p,
        isCustom: false,
        isBuiltIn: true
      })
    }
  }
  if (data?.custom) {
    for (const p of data.custom) {
      presets.push({
        name: typeof p === 'object' ? p.name : p,
        label: typeof p === 'object' ? p.displayName || p.name : p,
        isCustom: true,
        isBuiltIn: false
      })
    }
  }
  return presets.length > 0 ? presets : DEFAULT_PRESETS
}

async function fetchUserPresetFromServer(): Promise<string | undefined> {
  const userConfig = await fetchJsonOrNull(
    '/signalk/v1/applicationData/user/unitpreferences/1.0.0'
  )
  return userConfig?.activePreset
}

async function fetchServerDefaultPresetFromServer(): Promise<string> {
  const config = await fetchJsonOrNull('/signalk/v1/unitpreferences/config')
  return config?.activePreset || 'nautical-metric'
}

const initialState: UnitPreferencesSliceState = {
  activePreset: 'nautical-metric',
  serverDefaultPreset: 'nautical-metric',
  presets: DEFAULT_PRESETS,
  presetDetails: null,
  unitDefinitions: null,
  defaultCategories: null,
  categories: null,
  unitPrefsLoaded: false,
  unitPrefsFailedLoads: 0
}

export const createUnitPreferencesSlice: StateCreator<
  UnitPreferencesSlice,
  [],
  [],
  UnitPreferencesSlice
> = (set, get) => ({
  ...initialState,

  fetchUnitPreferences: async () => {
    try {
      const [
        presets,
        userPreset,
        serverDefaultPreset,
        unitDefinitions,
        defaultCategories,
        categories
      ] = await Promise.all([
        fetchPresetsFromServer(),
        fetchUserPresetFromServer(),
        fetchServerDefaultPresetFromServer(),
        fetchJsonOrNull('/signalk/v1/unitpreferences/definitions'),
        fetchJsonOrNull('/signalk/v1/unitpreferences/default-categories'),
        fetchJsonOrNull('/signalk/v1/unitpreferences/categories')
      ])
      const activePreset = userPreset || serverDefaultPreset
      const presetDetails = await fetchJsonOrNull(
        `/signalk/v1/unitpreferences/presets/${activePreset}`
      )
      set({
        presets,
        activePreset,
        serverDefaultPreset,
        presetDetails,
        unitDefinitions,
        defaultCategories: defaultCategories?.categories || null,
        categories,
        unitPrefsLoaded: true,
        unitPrefsFailedLoads: 0
      })
    } catch (e) {
      console.error('Failed to load unit preferences:', e)
      // Loaded all the same: the pages show what they have, and retry.
      set({
        unitPrefsLoaded: true,
        unitPrefsFailedLoads: get().unitPrefsFailedLoads + 1
      })
    }
  },

  fetchPresetDetails: async (presetName: string) => {
    try {
      const response = await fetch(
        `/signalk/v1/unitpreferences/presets/${presetName}`,
        { credentials: 'include' }
      )
      if (response.ok) {
        const details = await response.json()
        set({ presetDetails: details })
      }
    } catch (e) {
      console.error('Failed to fetch preset details:', e)
    }
  },

  setActivePresetAndSave: async (preset: string) => {
    set({ activePreset: preset })
    try {
      await fetch('/signalk/v1/applicationData/user/unitpreferences/1.0.0', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activePreset: preset })
      })
    } catch (e) {
      console.error('Failed to set unit preferences:', e)
    }
    await get().fetchPresetDetails(preset)
  },

  setServerDefaultPreset: async (preset: string) => {
    try {
      await fetch('/signalk/v1/unitpreferences/config', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activePreset: preset })
      })
      set({ serverDefaultPreset: preset })
    } catch (e) {
      console.error('Failed to set server default preset:', e)
    }
  },

  setPresets: (presets) => {
    set({ presets })
  },

  setActivePreset: (activePreset) => {
    set({ activePreset })
  },

  setUnitDefinitions: (unitDefinitions) => {
    set({ unitDefinitions })
  },

  setDefaultCategories: (defaultCategories) => {
    set({ defaultCategories })
  },

  setCategories: (categories) => {
    set({ categories })
  }
})
