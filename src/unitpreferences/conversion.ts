import {
  isConstantNode,
  isOperatorNode,
  isParenthesisNode,
  isSymbolNode,
  parse,
  type EvalFunction,
  type MathNode
} from 'mathjs'
import type { DisplayUnitsValue } from '@signalk/server-api'
import { createDebug } from '../debug'
import { EnhancedDisplayUnits } from './types'

const debug = createDebug('signalk-server:unitpreferences:conversion')

const VALUE_SYMBOL = 'value'
const ARITHMETIC_OPERATORS = new Set(['+', '-', '*', '/', '^'])
// Shipped formulas are a few dozen characters; the cap keeps a stored
// formula's nesting depth far below what parsing and compiling recurse into.
export const MAX_FORMULA_LENGTH = 256
// Shipped definitions hold a few hundred formulas; stored custom formulas
// can add any number, so the cache starts over rather than grow unbounded.
export const MAX_CACHED_FORMULAS = 1000

// A stored custom formula is whatever a metadata PUT wrote, so only plain
// arithmetic on the value is run here; anything mathjs could do beyond that,
// such as allocating matrices, stays out of the server.
function isArithmetic(node: MathNode): boolean {
  if (isOperatorNode(node)) {
    return ARITHMETIC_OPERATORS.has(node.op) && node.args.every(isArithmetic)
  }
  if (isConstantNode(node)) {
    return typeof node.value === 'number'
  }
  if (isParenthesisNode(node)) {
    return isArithmetic(node.content)
  }
  if (isSymbolNode(node)) {
    return node.name === VALUE_SYMBOL
  }
  return false
}

function compileArithmetic(formula: string): EvalFunction | null {
  if (formula.length > MAX_FORMULA_LENGTH) {
    debug('Formula of %d characters is too long', formula.length)
    return null
  }
  // A deeply nested formula overflows the stack in any of these steps.
  try {
    const node = parse(formula)
    if (!isArithmetic(node)) {
      debug('Formula %s is not plain arithmetic', formula)
      return null
    }
    return node.compile()
  } catch (err) {
    debug('Cannot compile formula %s: %O', formula, err)
    return null
  }
}

const compiledFormulas = new Map<string, EvalFunction | null>()

function compiledFormula(formula: string): EvalFunction | null {
  let compiled = compiledFormulas.get(formula)
  if (compiled === undefined) {
    compiled = compileArithmetic(formula)
    if (compiledFormulas.size >= MAX_CACHED_FORMULAS) {
      compiledFormulas.clear()
    }
    compiledFormulas.set(formula, compiled)
  }
  return compiled
}

/**
 * Convert an SI value with resolved display units.
 *
 * @param displayUnits - Display units resolved for the value's path
 * @param value - The value in the path's SI unit
 * @returns The converted value, or undefined if the value is not a finite
 * number, or the formula is more than arithmetic on the value, fails, or
 * does not yield a finite number
 */
export function convertWithDisplayUnits(
  displayUnits: EnhancedDisplayUnits,
  value: number
): DisplayUnitsValue | undefined {
  // Plugins call this from JavaScript, and mathjs would coerce a string or
  // boolean into a number and convert it.
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  const compiled = compiledFormula(displayUnits.formula)
  if (!compiled) {
    return undefined
  }
  let converted: unknown
  try {
    converted = compiled.evaluate({ value })
  } catch (err) {
    debug('Cannot evaluate formula %s: %O', displayUnits.formula, err)
    return undefined
  }
  if (typeof converted !== 'number' || !Number.isFinite(converted)) {
    return undefined
  }
  return {
    value: converted,
    symbol: displayUnits.symbol,
    displayFormat: displayUnits.displayFormat
  }
}
