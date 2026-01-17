// categories.json structure
export interface CategoryMap {
  categoryToBaseUnit: {
    [categoryName: string]: string // category → SI unit (e.g., "speed" → "m/s")
  }
  coreCategories: string[]
}

// Conversion formula
export interface ConversionFormula {
  formula: string // e.g., "value * 1.94384"
  inverseFormula: string // e.g., "value * 0.514444"
  symbol: string // e.g., "kn"
  longName?: string // e.g., "knots"
  key?: string // ASCII-safe key for special characters
}

// standard-units-definitions.json structure
export interface UnitDefinitions {
  [siUnit: string]: {
    longName?: string
    conversions: {
      [targetUnit: string]: ConversionFormula
    }
  }
}

// Preset file structure
export interface Preset {
  version: string
  name: string
  description?: string
  date?: string
  categories: {
    [categoryName: string]: {
      baseUnit: string
      targetUnit: string
      displayFormat?: string
    }
  }
}

// Config file structure
export interface UnitPreferencesConfig {
  activePreset: string // e.g., "imperial-us" or "my-boat"
  version?: string
}

// What gets stored in path metadata (baseDeltas.json)
export interface DisplayUnitsMetadata {
  category: string
  targetUnit?: string // Only if path override
  displayFormat?: string // Only if path override
}

// What server returns in GET /meta response
export interface EnhancedDisplayUnits {
  category: string
  targetUnit: string
  formula: string
  inverseFormula: string
  symbol: string
  displayFormat?: string
}
