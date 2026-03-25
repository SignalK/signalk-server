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
  { name: 'metric', label: 'Metric (SI)' },
  { name: 'imperial-us', label: 'Imperial (US)' },
  { name: 'imperial-uk', label: 'Imperial (UK)' }
]

async function fetchPresetsFromServer(): Promise<PresetInfo[]> {
  try {
    const response = await fetch('/signalk/v1/unitpreferences/presets', {
      credentials: 'include'
    })
    if (response.ok) {
      const data = await response.json()
      const presets: PresetInfo[] = []
      if (data.builtIn) {
        for (const p of data.builtIn) {
          presets.push({
            name: typeof p === 'object' ? p.name : p,
            label: typeof p === 'object' ? p.displayName || p.name : p,
            isCustom: false,
            isBuiltIn: true
          })
        }
      }
      if (data.custom) {
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
  } catch (e) {
    console.error('Failed to fetch presets:', e)
  }
  return DEFAULT_PRESETS
}

async function fetchActivePresetFromServer(): Promise<string> {
  try {
    const userResponse = await fetch(
      '/signalk/v1/applicationData/user/unitpreferences/1.0.0',
      { credentials: 'include' }
    )
    if (userResponse.ok) {
      const userConfig = await userResponse.json()
      if (userConfig.activePreset) {
        return userConfig.activePreset
      }
    }
  } catch {}

  try {
    const response = await fetch('/signalk/v1/unitpreferences/config', {
      credentials: 'include'
    })
    if (response.ok) {
      const config = await response.json()
      return config.activePreset || 'nautical-metric'
    }
  } catch (e) {
    console.error('Failed to fetch unit preferences:', e)
  }
  return 'nautical-metric'
}

async function fetchServerDefaultPresetFromServer(): Promise<string> {
  try {
    const response = await fetch('/signalk/v1/unitpreferences/config', {
      credentials: 'include'
    })
    if (response.ok) {
      const config = await response.json()
      return config.activePreset || 'nautical-metric'
    }
  } catch (e) {
    console.error('Failed to fetch server default preset:', e)
  }
  return 'nautical-metric'
}

const initialState: UnitPreferencesSliceState = {
  activePreset: 'nautical-metric',
  serverDefaultPreset: 'nautical-metric',
  presets: DEFAULT_PRESETS,
  presetDetails: null,
  unitDefinitions: null,
  defaultCategories: null,
  categories: null,
  unitPrefsLoaded: false
}

export const createUnitPreferencesSlice: StateCreator<
  UnitPreferencesSlice,
  [],
  [],
  UnitPreferencesSlice
> = (set, get) => ({
  ...initialState,

  fetchUnitPreferences: async () => {
    const [presets, activePreset, serverDefaultPreset] = await Promise.all([
      fetchPresetsFromServer(),
      fetchActivePresetFromServer(),
      fetchServerDefaultPresetFromServer()
    ])

    const [definitions, defaultCategories, categories] = await Promise.all([
      fetch('/signalk/v1/unitpreferences/definitions', {
        credentials: 'include'
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch('/signalk/v1/unitpreferences/default-categories', {
        credentials: 'include'
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data?.categories || null)
        .catch(() => null),
      fetch('/signalk/v1/unitpreferences/categories', {
        credentials: 'include'
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    ])

    set({
      presets,
      activePreset,
      serverDefaultPreset,
      unitDefinitions: definitions,
      defaultCategories,
      categories,
      unitPrefsLoaded: true
    })

    await get().fetchPresetDetails(activePreset)
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
