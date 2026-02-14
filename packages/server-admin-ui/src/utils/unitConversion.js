import { compile } from 'mathjs'

// Cache for compiled mathjs expressions
const compiledFormulaCache = new Map()

/**
 * Get a compiled expression from cache, or compile and cache it
 * @param {string} formula - The formula string to compile
 * @returns {object} - Compiled mathjs expression
 */
export function getCompiledFormula(formula) {
  if (!compiledFormulaCache.has(formula)) {
    compiledFormulaCache.set(formula, compile(formula))
  }
  return compiledFormulaCache.get(formula)
}

/**
 * Convert value based on category and preset
 * @param {number} value - The value to convert
 * @param {string} siUnit - The SI unit of the value
 * @param {string} category - The category for conversion
 * @param {object} presetDetails - The preset configuration
 * @param {object} unitDefinitions - The unit definitions with formulas
 * @returns {object|null} - { value, unit } or null if no conversion
 */
export function convertValue(
  value,
  siUnit,
  category,
  presetDetails,
  unitDefinitions
) {
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
