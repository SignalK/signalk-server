import {
  getCategories,
  getMergedDefinitions,
  getActivePreset,
  getActivePresetForUser
} from './loader'
import {
  EnhancedDisplayUnits,
  DisplayUnitsMetadata,
  DisplayUnitsOverride
} from './types'

/**
 * The path specific unit override, as opposed to what the preset supplied.
 *
 * A response this server resolved carries the override in its `override`
 * field; anything else is the stored metadata, where every field present is
 * part of the override.
 */
function pathOverride(
  displayUnits: DisplayUnitsMetadata
): DisplayUnitsOverride {
  const source = displayUnits.override ?? displayUnits
  const override: DisplayUnitsOverride = {}
  if (source.targetUnit !== undefined) {
    override.targetUnit = source.targetUnit
  }
  if (source.displayFormat !== undefined) {
    override.displayFormat = source.displayFormat
  }
  return override
}

/**
 * Given stored displayUnits metadata, resolve the full conversion info
 *
 * @param storedDisplayUnits - What's in baseDeltas.json (category, optional targetUnit)
 * @param pathSiUnit - The SI unit for this path (optional)
 * @param username - Username for per-user preset resolution (optional)
 * @param includeOverride - Report the path specific override in an `override` field
 * @returns Full displayUnits with formula, or null if can't resolve
 */
export function resolveDisplayUnits(
  storedDisplayUnits: DisplayUnitsMetadata | undefined,
  pathSiUnit?: string,
  username?: string,
  includeOverride = false
): EnhancedDisplayUnits | null {
  if (!storedDisplayUnits?.category) {
    return null
  }

  const category = storedDisplayUnits.category
  const pathSpecific = pathOverride(storedDisplayUnits)
  // Only an editor needs to tell a path specific override from the preset's
  // settings, so the field rides along only where the request asked for it. It
  // stays in the object literal either way to keep one shape; JSON drops it
  // when unset.
  const override = includeOverride ? pathSpecific : undefined
  // Resolving a response this server already resolved is the same job as
  // resolving the stored metadata it came from.
  const stored: DisplayUnitsMetadata = storedDisplayUnits.override
    ? {
        category,
        ...pathSpecific,
        formula: storedDisplayUnits.formula,
        inverseFormula: storedDisplayUnits.inverseFormula,
        symbol: storedDisplayUnits.symbol
      }
    : storedDisplayUnits

  // "base" category means display in SI units without conversion
  if (category === 'base') {
    return {
      category: 'base',
      targetUnit: pathSiUnit || 'base',
      formula: 'value',
      inverseFormula: 'value',
      symbol: pathSiUnit || '',
      displayFormat: undefined,
      override
    }
  }

  // "custom" category stores explicit conversion info
  if (category === 'custom') {
    if (!stored.targetUnit) {
      return null
    }
    // Identity conversion: targetUnit matches the path's SI unit
    if (pathSiUnit && stored.targetUnit === pathSiUnit) {
      return {
        category: 'custom',
        targetUnit: stored.targetUnit,
        formula: 'value',
        inverseFormula: 'value',
        symbol: stored.symbol || stored.targetUnit,
        displayFormat: stored.displayFormat,
        override
      }
    }
    // If formula is stored, use it directly
    if (stored.formula) {
      return {
        category: 'custom',
        targetUnit: stored.targetUnit,
        formula: stored.formula,
        inverseFormula: stored.inverseFormula || '',
        symbol: stored.symbol || stored.targetUnit,
        displayFormat: stored.displayFormat,
        override
      }
    }
    // Otherwise look up from definitions using pathSiUnit
    if (pathSiUnit) {
      const definitions = getMergedDefinitions()
      const conversion =
        definitions[pathSiUnit]?.conversions?.[stored.targetUnit]
      if (conversion) {
        return {
          category: 'custom',
          targetUnit: stored.targetUnit,
          formula: conversion.formula,
          inverseFormula: conversion.inverseFormula,
          symbol: conversion.symbol || stored.targetUnit,
          displayFormat: stored.displayFormat,
          override
        }
      }
    }
    return null
  }

  const categoriesData = getCategories()
  const definitions = getMergedDefinitions()
  const preset = username ? getActivePresetForUser(username) : getActivePreset()

  // Step 1: Get SI unit for this category
  const siUnit = categoriesData.categoryToBaseUnit[category]
  if (!siUnit) {
    return null // Unknown category
  }

  // Step 2: Determine target unit
  // Priority: path override > preset default
  let targetUnit: string
  if (stored.targetUnit) {
    targetUnit = stored.targetUnit
  } else if (preset?.categories?.[category]?.targetUnit) {
    targetUnit = preset.categories[category].targetUnit
  } else {
    return null // No target unit defined
  }

  // Step 3: Identity conversion (targetUnit === baseUnit)
  if (targetUnit === siUnit) {
    return {
      category,
      targetUnit,
      formula: 'value',
      inverseFormula: 'value',
      symbol: siUnit,
      displayFormat:
        stored.displayFormat || preset?.categories?.[category]?.displayFormat,
      override
    }
  }

  // Step 4: Get formula from definitions
  const unitDef = definitions[siUnit]
  if (!unitDef?.conversions) {
    return null // No conversions for this SI unit
  }

  const conversion = unitDef.conversions[targetUnit]
  if (!conversion) {
    return null // Target unit not found in conversions
  }

  // Step 5: Build response
  return {
    category,
    targetUnit,
    formula: conversion.formula,
    inverseFormula: conversion.inverseFormula,
    symbol: conversion.symbol,
    displayFormat:
      stored.displayFormat || preset?.categories?.[category]?.displayFormat,
    override
  }
}

/**
 * Reduce displayUnits to the override it expresses.
 *
 * Clients read metadata back resolved — target unit, formulas and format
 * filled in from the applied preset — so writing it back verbatim would store
 * the preset's current settings as a path specific override and detach the
 * path from the preset. A resolved response reports the path specific override
 * in its `override` field, which settles the question outright. A client that sends
 * neither is read by shape: the resolved shape carries a formula and the
 * stored shape does not, and in a formula-carrying echo a value the preset
 * would have produced anyway is dropped unless the path already stored it.
 *
 * @param incoming - displayUnits as received in a metadata PUT
 * @param previous - displayUnits currently stored for the path
 * @param username - Username for per-user preset resolution (optional)
 * @returns displayUnits to store
 */
export function stripResolvedDisplayUnits(
  incoming: DisplayUnitsMetadata | undefined,
  previous: DisplayUnitsMetadata | undefined,
  username?: string
): DisplayUnitsMetadata | undefined {
  if (!incoming?.category) {
    return incoming
  }

  const category = incoming.category

  // A custom unit is nothing but its explicit conversion, and "base" needs
  // no conversion at all.
  if (category === 'custom') {
    const { override: _override, ...stored } = incoming
    return stored
  }
  if (category === 'base') {
    return { category }
  }

  if (incoming.override) {
    return { category, ...incoming.override }
  }

  const echoesResolution = incoming.formula !== undefined
  const preset = username ? getActivePresetForUser(username) : getActivePreset()
  const presetCategory = preset?.categories?.[category]
  const stored: DisplayUnitsMetadata = { category }

  const overrides = (
    value?: string,
    presetValue?: string,
    storedValue?: string
  ) =>
    value !== undefined &&
    (!echoesResolution || value !== presetValue || storedValue !== undefined)

  if (
    overrides(
      incoming.targetUnit,
      presetCategory?.targetUnit,
      previous?.targetUnit
    )
  ) {
    stored.targetUnit = incoming.targetUnit
  }
  if (
    overrides(
      incoming.displayFormat,
      presetCategory?.displayFormat,
      previous?.displayFormat
    )
  ) {
    stored.displayFormat = incoming.displayFormat
  }

  return stored
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
  // "base" category is always valid - it means use SI units
  if (category === 'base') {
    return null
  }

  // "custom" category is always valid - user picks an explicit target unit
  if (category === 'custom') {
    return null
  }

  const categoriesData = getCategories()
  const preset = getActivePreset()

  // Check built-in categories first, then preset categories
  let categorySiUnit = categoriesData.categoryToBaseUnit[category]
  if (!categorySiUnit && preset?.categories?.[category]?.baseUnit) {
    categorySiUnit = preset.categories[category].baseUnit
  }

  if (!categorySiUnit) {
    return `Unknown category: ${category}`
  }

  // If path has a defined SI unit, it must match category's SI unit
  if (pathSiUnit && pathSiUnit !== categorySiUnit) {
    return `Category "${category}" requires SI unit "${categorySiUnit}" but path has "${pathSiUnit}"`
  }

  return null // Valid
}
