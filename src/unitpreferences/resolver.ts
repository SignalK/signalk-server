import {
  getCategories,
  getMergedDefinitions,
  getActivePreset
} from './loader'
import { EnhancedDisplayUnits, DisplayUnitsMetadata } from './types'

/**
 * Given stored displayUnits metadata, resolve the full conversion info
 *
 * @param storedDisplayUnits - What's in baseDeltas.json (category, optional targetUnit)
 * @returns Full displayUnits with formula, or null if can't resolve
 */
export function resolveDisplayUnits(
  storedDisplayUnits: DisplayUnitsMetadata | undefined
): EnhancedDisplayUnits | null {

  if (!storedDisplayUnits?.category) {
    return null
  }

  const category = storedDisplayUnits.category
  const categoriesData = getCategories()
  const definitions = getMergedDefinitions()
  const preset = getActivePreset()

  // Step 1: Get SI unit for this category
  const siUnit = categoriesData.categoryToBaseUnit[category]
  if (!siUnit) {
    return null  // Unknown category
  }

  // Step 2: Determine target unit
  // Priority: path override > preset default
  let targetUnit: string
  if (storedDisplayUnits.targetUnit) {
    targetUnit = storedDisplayUnits.targetUnit
  } else if (preset.categories[category]?.targetUnit) {
    targetUnit = preset.categories[category].targetUnit
  } else {
    return null  // No target unit defined
  }

  // Step 3: Get formula from definitions
  const unitDef = definitions[siUnit]
  if (!unitDef?.conversions) {
    return null  // No conversions for this SI unit
  }

  const conversion = unitDef.conversions[targetUnit]
  if (!conversion) {
    return null  // Target unit not found in conversions
  }

  // Step 4: Build response
  return {
    category,
    targetUnit,
    formula: conversion.formula,
    inverseFormula: conversion.inverseFormula,
    symbol: conversion.symbol,
    displayFormat: storedDisplayUnits.displayFormat || preset.categories[category]?.displayFormat
  }
}

/**
 * Validate that a category assignment is valid for a path
 *
 * @param pathSiUnit - The SI unit from SignalK schema for this path (may be undefined)
 * @param category - The category being assigned
 * @returns Error message if invalid, null if valid
 */
export function validateCategoryAssignment(
  pathSiUnit: string | undefined,
  category: string
): string | null {
  const categoriesData = getCategories()
  const categorySiUnit = categoriesData.categoryToBaseUnit[category]

  if (!categorySiUnit) {
    return `Unknown category: ${category}`
  }

  // If path has a defined SI unit, it must match category's SI unit
  if (pathSiUnit && pathSiUnit !== categorySiUnit) {
    return `Category "${category}" requires SI unit "${categorySiUnit}" but path has "${pathSiUnit}"`
  }

  return null  // Valid
}
