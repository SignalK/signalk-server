import * as fs from 'fs'
import * as path from 'path'
import {
  CategoryMap,
  UnitDefinitions,
  Preset,
  UnitPreferencesConfig
} from './types'

const UNITPREFS_DIR = path.join(__dirname, '../../unitpreferences')
export const DEFAULT_PRESET = 'nautical-metric'

let categories: CategoryMap
let customCategories: { [category: string]: string } = {}
let standardDefinitions: UnitDefinitions
let customDefinitions: UnitDefinitions
let activePreset: Preset
let config: UnitPreferencesConfig
let defaultCategories: { [path: string]: string } = {}

export function loadAll(): void {
  // Load categories
  categories = JSON.parse(
    fs.readFileSync(path.join(UNITPREFS_DIR, 'categories.json'), 'utf-8')
  )

  // Load standard definitions
  standardDefinitions = JSON.parse(
    fs.readFileSync(
      path.join(UNITPREFS_DIR, 'standard-units-definitions.json'),
      'utf-8'
    )
  )

  // Load custom definitions (if exists)
  const customPath = path.join(UNITPREFS_DIR, 'custom-units-definitions.json')
  if (fs.existsSync(customPath)) {
    customDefinitions = JSON.parse(fs.readFileSync(customPath, 'utf-8'))
  } else {
    customDefinitions = {}
  }

  // Load custom categories (if exists)
  const customCatPath = path.join(UNITPREFS_DIR, 'custom-categories.json')
  if (fs.existsSync(customCatPath)) {
    customCategories = JSON.parse(fs.readFileSync(customCatPath, 'utf-8'))
  } else {
    customCategories = {}
  }

  // Load config
  const configPath = path.join(UNITPREFS_DIR, 'config.json')
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } else {
    config = { activePreset: DEFAULT_PRESET }
  }

  // Load default categories
  const defaultCatPath = path.join(UNITPREFS_DIR, 'default-categories.json')
  if (fs.existsSync(defaultCatPath)) {
    const defaultCatData = JSON.parse(fs.readFileSync(defaultCatPath, 'utf-8'))
    // Build flat lookup: path -> category
    defaultCategories = {}
    for (const [categoryName, catDef] of Object.entries(
      defaultCatData.categories || {}
    )) {
      const def = catDef as { paths: string[] }
      for (const p of def.paths || []) {
        defaultCategories[p] = categoryName
      }
    }
  }

  // Load active preset
  loadActivePreset()
}

function loadActivePreset(): void {
  const presetName = config.activePreset

  // Check custom presets first
  const customPresetPath = path.join(
    UNITPREFS_DIR,
    'presets/custom',
    `${presetName}.json`
  )
  if (fs.existsSync(customPresetPath)) {
    activePreset = JSON.parse(fs.readFileSync(customPresetPath, 'utf-8'))
    return
  }

  // Fall back to built-in presets
  const builtInPath = path.join(UNITPREFS_DIR, 'presets', `${presetName}.json`)
  if (fs.existsSync(builtInPath)) {
    activePreset = JSON.parse(fs.readFileSync(builtInPath, 'utf-8'))
    return
  }

  // Default to nautical
  activePreset = JSON.parse(
    fs.readFileSync(
      path.join(UNITPREFS_DIR, `presets/${DEFAULT_PRESET}.json`),
      'utf-8'
    )
  )
}

export function getCategories(): CategoryMap {
  // Return merged categories (core + custom)
  const merged = { ...categories }
  merged.categoryToBaseUnit = {
    ...categories.categoryToBaseUnit,
    ...customCategories
  }
  return merged
}
export function getCustomCategories(): { [category: string]: string } {
  return customCategories
}
export function getStandardDefinitions(): UnitDefinitions {
  return standardDefinitions
}
export function getCustomDefinitions(): UnitDefinitions {
  return customDefinitions
}
export function getActivePreset(): Preset {
  return activePreset
}
export function getConfig(): UnitPreferencesConfig {
  return config
}

export function reloadPreset(): void {
  // Re-read config from file to get updated activePreset
  const configPath = path.join(UNITPREFS_DIR, 'config.json')
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  }
  loadActivePreset()
}

export function reloadCustomDefinitions(): void {
  const customPath = path.join(UNITPREFS_DIR, 'custom-units-definitions.json')
  if (fs.existsSync(customPath)) {
    customDefinitions = JSON.parse(fs.readFileSync(customPath, 'utf-8'))
  } else {
    customDefinitions = {}
  }
}

export function reloadCustomCategories(): void {
  const customCatPath = path.join(UNITPREFS_DIR, 'custom-categories.json')
  if (fs.existsSync(customCatPath)) {
    customCategories = JSON.parse(fs.readFileSync(customCatPath, 'utf-8'))
  } else {
    customCategories = {}
  }
}

export function getMergedDefinitions(): UnitDefinitions {
  // Custom definitions override standard
  const merged: UnitDefinitions = JSON.parse(
    JSON.stringify(standardDefinitions)
  )
  for (const [siUnit, def] of Object.entries(customDefinitions)) {
    if (!merged[siUnit]) {
      merged[siUnit] = def
    } else {
      merged[siUnit].conversions = {
        ...merged[siUnit].conversions,
        ...def.conversions
      }
    }
  }
  return merged
}

export function getDefaultCategory(signalkPath: string): string | null {
  // Direct match first
  if (defaultCategories[signalkPath]) {
    return defaultCategories[signalkPath]
  }

  // Try wildcard matching
  for (const [pattern, category] of Object.entries(defaultCategories)) {
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '[^.]+') + '$'
      )
      if (regex.test(signalkPath)) {
        return category
      }
    }
  }

  return null
}

function loadPresetByName(presetName: string): Preset | null {
  // Check custom presets first
  const customPresetPath = path.join(
    UNITPREFS_DIR,
    'presets/custom',
    `${presetName}.json`
  )
  if (fs.existsSync(customPresetPath)) {
    return JSON.parse(fs.readFileSync(customPresetPath, 'utf-8'))
  }

  // Fall back to built-in presets
  const builtInPath = path.join(UNITPREFS_DIR, 'presets', `${presetName}.json`)
  if (fs.existsSync(builtInPath)) {
    return JSON.parse(fs.readFileSync(builtInPath, 'utf-8'))
  }

  return null
}

export function getActivePresetForUser(username?: string): Preset {
  // 1. User-specific preset
  if (username && config.userPresets?.[username]) {
    const preset = loadPresetByName(config.userPresets[username])
    if (preset) return preset
  }
  // 2. Admin preset
  if (config.activePreset) {
    const preset = loadPresetByName(config.activePreset)
    if (preset) return preset
  }
  // 3. Default
  return loadPresetByName(DEFAULT_PRESET) || activePreset
}
