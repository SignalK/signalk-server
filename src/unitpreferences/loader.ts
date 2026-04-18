import * as fs from 'fs'
import * as path from 'path'
import {
  CategoryMap,
  UnitDefinitions,
  Preset,
  UnitPreferencesConfig,
  PrimaryCategoryMap,
  UserUnitPreferences
} from './types'
import { atomicWriteFileSync } from '../atomicWrite'
import { createDebug } from '../debug'

const debug = createDebug('signalk-server:unitpreferences:loader')

const PACKAGE_UNITPREFS_DIR = path.join(__dirname, '../../unitpreferences')
export const DEFAULT_PRESET = 'nautical-metric'
const VALID_USERNAME = /^[a-zA-Z0-9_.\-@]+$/
const USER_PREFS_FILE = '1.0.0.json'

let categories: CategoryMap
let customCategories: { [category: string]: string } = {}
let standardDefinitions: UnitDefinitions
let customDefinitions: UnitDefinitions
let activePreset: Preset
let config: UnitPreferencesConfig
let defaultCategories: { [path: string]: string } = {}
let baseUnitToCategoriesCache: { [baseUnit: string]: string[] } | null = null
const userPreferencesCache = new Map<string, UserUnitPreferences | null>()
let applicationDataPath: string = ''
let configUnitprefsDir: string = ''

let defaultPrimaryCategories: PrimaryCategoryMap = {}

function validateUsername(username: string): void {
  if (!VALID_USERNAME.test(username) || username === '.' || username === '..') {
    throw new Error(`Invalid username: ${username}`)
  }
}

function getUserPrefsPath(username: string): string {
  validateUsername(username)
  const result = path.join(
    applicationDataPath,
    'users',
    username,
    'unitpreferences',
    USER_PREFS_FILE
  )
  const resolved = path.resolve(result)
  const usersRoot = path.resolve(applicationDataPath, 'users') + path.sep
  if (!resolved.startsWith(usersRoot)) {
    throw new Error(`Invalid username path: ${username}`)
  }
  return result
}

export function setApplicationDataPath(configPath: string): void {
  applicationDataPath = path.join(configPath, 'applicationData')
  configUnitprefsDir = path.join(configPath, 'unitpreferences')
  ensureConfigDir()
}

export function getConfigUnitprefsDir(): string {
  return configUnitprefsDir
}

function ensureConfigDir(): void {
  if (!configUnitprefsDir) return

  // Create directory structure
  fs.mkdirSync(path.join(configUnitprefsDir, 'presets', 'custom'), {
    recursive: true
  })

  // Seed mutable files from package dir if not present in config dir
  const mutableFiles = [
    'config.json',
    'custom-units-definitions.json',
    'custom-categories.json'
  ]
  for (const file of mutableFiles) {
    const destPath = path.join(configUnitprefsDir, file)
    if (!fs.existsSync(destPath)) {
      const srcPath = path.join(PACKAGE_UNITPREFS_DIR, file)
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }

  // Migrate custom presets from package dir if any exist
  const pkgCustomDir = path.join(PACKAGE_UNITPREFS_DIR, 'presets', 'custom')
  if (fs.existsSync(pkgCustomDir)) {
    const configCustomDir = path.join(configUnitprefsDir, 'presets', 'custom')
    for (const file of fs.readdirSync(pkgCustomDir)) {
      if (file.endsWith('.json')) {
        const destPath = path.join(configCustomDir, file)
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(path.join(pkgCustomDir, file), destPath)
        }
      }
    }
  }
}

export function loadAll(): void {
  // Load categories (read-only, from package)
  categories = JSON.parse(
    fs.readFileSync(
      path.join(PACKAGE_UNITPREFS_DIR, 'categories.json'),
      'utf-8'
    )
  )

  // Load standard definitions (read-only, from package)
  standardDefinitions = JSON.parse(
    fs.readFileSync(
      path.join(PACKAGE_UNITPREFS_DIR, 'standard-units-definitions.json'),
      'utf-8'
    )
  )

  // Load custom definitions from config dir
  const customPath = configUnitprefsDir
    ? path.join(configUnitprefsDir, 'custom-units-definitions.json')
    : path.join(PACKAGE_UNITPREFS_DIR, 'custom-units-definitions.json')
  if (fs.existsSync(customPath)) {
    customDefinitions = JSON.parse(fs.readFileSync(customPath, 'utf-8'))
  } else {
    customDefinitions = {}
  }

  // Load custom categories from config dir
  const customCatPath = configUnitprefsDir
    ? path.join(configUnitprefsDir, 'custom-categories.json')
    : path.join(PACKAGE_UNITPREFS_DIR, 'custom-categories.json')
  if (fs.existsSync(customCatPath)) {
    customCategories = JSON.parse(fs.readFileSync(customCatPath, 'utf-8'))
  } else {
    customCategories = {}
  }

  // Load config from config dir
  const cfgPath = configUnitprefsDir
    ? path.join(configUnitprefsDir, 'config.json')
    : path.join(PACKAGE_UNITPREFS_DIR, 'config.json')
  if (fs.existsSync(cfgPath)) {
    config = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
  } else {
    config = { activePreset: DEFAULT_PRESET }
  }

  // Load default categories (read-only, from package)
  const defaultCatPath = path.join(
    PACKAGE_UNITPREFS_DIR,
    'default-categories.json'
  )
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

  // Load default primary categories (read-only, from package)
  const primaryCatPath = path.join(
    PACKAGE_UNITPREFS_DIR,
    'primary-categories.json'
  )
  if (fs.existsSync(primaryCatPath)) {
    defaultPrimaryCategories = JSON.parse(
      fs.readFileSync(primaryCatPath, 'utf-8')
    )
  }

  // Invalidate caches
  baseUnitToCategoriesCache = null
  userPreferencesCache.clear()

  // Load active preset
  loadActivePreset()
}

function loadActivePreset(): void {
  const presetName = config.activePreset

  // Check custom presets in config dir first
  if (configUnitprefsDir) {
    const customPresetPath = path.join(
      configUnitprefsDir,
      'presets/custom',
      `${presetName}.json`
    )
    if (fs.existsSync(customPresetPath)) {
      activePreset = JSON.parse(fs.readFileSync(customPresetPath, 'utf-8'))
      return
    }
  }

  // Fall back to built-in presets in package dir
  const builtInPath = path.join(
    PACKAGE_UNITPREFS_DIR,
    'presets',
    `${presetName}.json`
  )
  if (fs.existsSync(builtInPath)) {
    activePreset = JSON.parse(fs.readFileSync(builtInPath, 'utf-8'))
    return
  }

  // Default to nautical-metric
  activePreset = JSON.parse(
    fs.readFileSync(
      path.join(PACKAGE_UNITPREFS_DIR, `presets/${DEFAULT_PRESET}.json`),
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
  // Re-read config from config dir
  const cfgPath = configUnitprefsDir
    ? path.join(configUnitprefsDir, 'config.json')
    : path.join(PACKAGE_UNITPREFS_DIR, 'config.json')
  if (fs.existsSync(cfgPath)) {
    config = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
  }
  loadActivePreset()
}

export function reloadCustomDefinitions(): void {
  const customPath = configUnitprefsDir
    ? path.join(configUnitprefsDir, 'custom-units-definitions.json')
    : path.join(PACKAGE_UNITPREFS_DIR, 'custom-units-definitions.json')
  if (fs.existsSync(customPath)) {
    customDefinitions = JSON.parse(fs.readFileSync(customPath, 'utf-8'))
  } else {
    customDefinitions = {}
  }
}

export function reloadCustomCategories(): void {
  baseUnitToCategoriesCache = null
  const customCatPath = configUnitprefsDir
    ? path.join(configUnitprefsDir, 'custom-categories.json')
    : path.join(PACKAGE_UNITPREFS_DIR, 'custom-categories.json')
  if (fs.existsSync(customCatPath)) {
    customCategories = JSON.parse(fs.readFileSync(customCatPath, 'utf-8'))
  } else {
    customCategories = {}
  }
}

export function getMergedDefinitions(): UnitDefinitions {
  // Custom definitions override standard
  const merged: UnitDefinitions = structuredClone(standardDefinitions)
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

export function getDefaultCategory(
  signalkPath: string,
  pathSiUnit?: string,
  username?: string
): string | null {
  // Priority 1: Direct match in default-categories.json
  if (defaultCategories[signalkPath]) {
    return defaultCategories[signalkPath]
  }

  // Priority 2: Wildcard match in default-categories.json
  for (const [pattern, category] of Object.entries(defaultCategories)) {
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' +
          pattern
            .replace(/[\\^$+?()[\]{}|]/g, '\\$&')
            .replace(/\./g, '\\.')
            .replace(/\*/g, '[^.]+') +
          '$'
      )
      if (regex.test(signalkPath)) {
        return category
      }
    }
  }

  // Priority 3: Auto-assign from base unit
  if (pathSiUnit) {
    return getCategoryForBaseUnit(pathSiUnit, username)
  }

  return null
}

export function getBaseUnitToCategories(): { [baseUnit: string]: string[] } {
  if (!baseUnitToCategoriesCache) {
    // Object.create(null): baseUnit values come from admin-controlled
    // custom-categories.json and become keys here; a null-prototype map
    // is immune to __proto__/constructor pollution.
    const cache: { [baseUnit: string]: string[] } = Object.create(null)
    const cats = getCategories()
    for (const [category, baseUnit] of Object.entries(
      cats.categoryToBaseUnit
    )) {
      if (!cache[baseUnit]) {
        cache[baseUnit] = []
      }
      cache[baseUnit].push(category)
    }
    baseUnitToCategoriesCache = cache
  }
  return baseUnitToCategoriesCache
}

export function getCategoryForBaseUnit(
  baseUnit: string,
  username?: string
): string | null {
  const map = getBaseUnitToCategories()
  const matchingCategories = map[baseUnit]
  if (!matchingCategories || matchingCategories.length === 0) return null
  if (matchingCategories.length === 1) return matchingCategories[0]

  // Multiple categories for this base unit — need disambiguation
  // 1. Check per-user primary category
  if (username) {
    const userPrefs = loadUserPreferences(username)
    if (userPrefs?.primaryCategories?.[baseUnit]) {
      const userPrimary = userPrefs.primaryCategories[baseUnit]
      if (matchingCategories.includes(userPrimary)) return userPrimary
    }
  }

  // 2. Fall back to system default
  const defaultPrimary = defaultPrimaryCategories[baseUnit]
  if (defaultPrimary && matchingCategories.includes(defaultPrimary))
    return defaultPrimary

  // 3. Fall back to first category alphabetically (deterministic)
  return [...matchingCategories].sort()[0]
}

export function loadUserPreferences(
  username: string
): UserUnitPreferences | null {
  if (!applicationDataPath) return null

  const cached = userPreferencesCache.get(username)
  if (cached !== undefined) {
    return cached === null ? null : structuredClone(cached)
  }

  try {
    const userPrefPath = getUserPrefsPath(username)
    if (fs.existsSync(userPrefPath)) {
      const prefs = JSON.parse(
        fs.readFileSync(userPrefPath, 'utf-8')
      ) as UserUnitPreferences
      userPreferencesCache.set(username, prefs)
      return structuredClone(prefs)
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      debug('Error reading user preferences for %s: %O', username, err)
    }
  }
  userPreferencesCache.set(username, null)
  return null
}

export function saveUserPreferences(
  username: string,
  prefs: UserUnitPreferences
): void {
  if (!applicationDataPath) throw new Error('applicationDataPath not set')
  const filePath = getUserPrefsPath(username)
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  atomicWriteFileSync(filePath, JSON.stringify(prefs, null, 2))
  userPreferencesCache.set(username, structuredClone(prefs))
}

function loadPresetByName(presetName: string): Preset | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(presetName)) {
    return null
  }

  // Check custom presets in config dir first
  if (configUnitprefsDir) {
    const customPresetPath = path.join(
      configUnitprefsDir,
      'presets/custom',
      `${presetName}.json`
    )
    if (fs.existsSync(customPresetPath)) {
      return JSON.parse(fs.readFileSync(customPresetPath, 'utf-8'))
    }
  }

  // Fall back to built-in presets in package dir
  const builtInPath = path.join(
    PACKAGE_UNITPREFS_DIR,
    'presets',
    `${presetName}.json`
  )
  if (fs.existsSync(builtInPath)) {
    return JSON.parse(fs.readFileSync(builtInPath, 'utf-8'))
  }

  return null
}

export function getActivePresetForUser(username?: string): Preset {
  // 1. Check applicationData for user's preset preference
  if (username) {
    const userPref = loadUserPreferences(username)
    if (userPref?.activePreset) {
      const preset = loadPresetByName(userPref.activePreset)
      if (preset) return preset
    }
  }
  // 2. User-specific preset from config (legacy)
  if (username && config.userPresets?.[username]) {
    const preset = loadPresetByName(config.userPresets[username])
    if (preset) return preset
  }
  // 3. Admin preset
  if (config.activePreset) {
    const preset = loadPresetByName(config.activePreset)
    if (preset) return preset
  }
  // 4. Default
  return loadPresetByName(DEFAULT_PRESET) || activePreset
}
