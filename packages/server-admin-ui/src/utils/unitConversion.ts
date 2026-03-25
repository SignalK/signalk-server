import { compile, type EvalFunction } from 'mathjs'

const compiledFormulaCache = new Map<string, EvalFunction>()

export function getCompiledFormula(formula: string): EvalFunction {
  let cached = compiledFormulaCache.get(formula)
  if (!cached) {
    cached = compile(formula)
    compiledFormulaCache.set(formula, cached)
  }
  return cached
}

export interface ConvertedValue {
  value: number
  unit: string
}

export interface PresetDetails {
  name?: string
  label?: string
  categories?: Record<
    string,
    {
      targetUnit?: string
      symbol?: string
    }
  >
}

export interface UnitConversion {
  formula?: string
  inverseFormula?: string
  symbol?: string
  longName?: string
}

export interface UnitDefinition {
  conversions?: Record<string, UnitConversion>
}

export type UnitDefinitions = Record<string, UnitDefinition>

export function convertValue(
  value: unknown,
  siUnit: string,
  category: string,
  presetDetails: PresetDetails | null,
  unitDefinitions: UnitDefinitions | null
): ConvertedValue | null {
  if (typeof value !== 'number' || !category) {
    return null
  }
  // "base" category means display in SI units without conversion
  if (category === 'base' && siUnit) {
    return { value, unit: siUnit }
  }
  if (!presetDetails || !unitDefinitions) {
    return null
  }
  const targetConfig = presetDetails.categories?.[category]
  if (!targetConfig?.targetUnit) return null
  const targetUnit = targetConfig.targetUnit
  if (targetUnit === siUnit) return null
  const formula = unitDefinitions[siUnit]?.conversions?.[targetUnit]?.formula
  const symbol =
    unitDefinitions[siUnit]?.conversions?.[targetUnit]?.symbol || targetUnit
  if (!formula) return null
  try {
    const compiled = getCompiledFormula(formula)
    const converted = compiled.evaluate({ value })
    return { value: converted, unit: symbol }
  } catch {
    return null
  }
}

export function convertFromSI(
  siValue: number,
  siUnit: string,
  targetUnit: string,
  unitDefinitions: UnitDefinitions | null
): number | null {
  if (!unitDefinitions || targetUnit === siUnit) return siValue
  const formula = unitDefinitions[siUnit]?.conversions?.[targetUnit]?.formula
  if (!formula) return null
  try {
    return getCompiledFormula(formula).evaluate({ value: siValue })
  } catch {
    return null
  }
}

export function convertToSI(
  displayValue: number,
  siUnit: string,
  targetUnit: string,
  unitDefinitions: UnitDefinitions | null
): number | null {
  if (!unitDefinitions || targetUnit === siUnit) return displayValue
  const inverseFormula =
    unitDefinitions[siUnit]?.conversions?.[targetUnit]?.inverseFormula
  if (!inverseFormula) return null
  try {
    return getCompiledFormula(inverseFormula).evaluate({ value: displayValue })
  } catch {
    return null
  }
}

export interface AvailableUnit {
  unit: string
  symbol: string
}

export function getAvailableUnits(
  siUnit: string,
  unitDefinitions: UnitDefinitions | null
): AvailableUnit[] {
  if (!unitDefinitions || !siUnit) return []
  const conversions = unitDefinitions[siUnit]?.conversions
  if (!conversions) return []
  return Object.entries(conversions).map(([unit, conv]) => ({
    unit,
    symbol: conv.symbol || unit
  }))
}
