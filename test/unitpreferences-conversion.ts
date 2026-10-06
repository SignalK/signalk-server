import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import {
  convertWithDisplayUnits,
  MAX_CACHED_FORMULAS,
  MAX_FORMULA_LENGTH
} from '../src/unitpreferences/conversion'
import type {
  EnhancedDisplayUnits,
  UnitDefinitions
} from '../src/unitpreferences/types'

const STANDARD_DEFINITIONS = path.join(
  __dirname,
  '../unitpreferences/standard-units-definitions.json'
)

// Formatters the clients supply and the server does not implement.
const CLIENT_ONLY_FORMATTERS = new Set([
  'formatDurationCompact(value)',
  'formatDurationDHMS(value)',
  'formatDurationHMS(value)',
  'formatDurationHMSMillis(value)',
  'formatDurationMS(value)',
  'formatDurationMSMillis(value)',
  'formatDurationVerbose(value)'
])

// Rejecting a formula must not cost its evaluation.
const REJECTION_BUDGET_MS = 1000
const LONG_CHAIN_TERMS = 3000
const DEEP_NEGATIONS = 5000

const withFormula = (formula: string): EnhancedDisplayUnits => ({
  category: 'custom',
  targetUnit: 'test',
  formula,
  inverseFormula: 'value',
  symbol: 'test'
})

const convert = (formula: string, value: number) =>
  convertWithDisplayUnits(withFormula(formula), value)?.value

describe('Display unit conversion', function () {
  it('evaluates arithmetic formulas', () => {
    expect(convert('(value - 32) * 5 / 9', 212)).to.equal(100)
    expect(convert('-value ^ 2', 3)).to.equal(-9)
    expect(convert('+value', 3)).to.equal(3)
    expect(convert('value * 6.684585813036146e-12', 1)).to.equal(
      6.684585813036146e-12
    )
  })

  it('evaluates exponential and logarithmic formulas', () => {
    expect(convert('10 * log10(value / 0.001)', 1)).to.be.closeTo(30, 1e-9)
    expect(convert('0.001 * 10 ^ (value / 10)', 30)).to.be.closeTo(1, 1e-9)
    expect(convert('log(value)', Math.E)).to.be.closeTo(1, 1e-9)
    expect(convert('log(value, 2)', 8)).to.be.closeTo(3, 1e-9)
    expect(convert('exp(value)', 0)).to.equal(1)
  })

  it('returns nothing for the logarithm of a negative value', () => {
    expect(convert('log10(value)', -1)).to.equal(undefined)
    expect(convert('log(value)', -1)).to.equal(undefined)
  })

  it('rejects formulas beyond the allowed operations', function () {
    this.timeout(REJECTION_BUDGET_MS)
    for (const formula of [
      'zeros(30000, 30000)',
      'sum(ones(1000))',
      'value > 0',
      'sqrt(value)',
      'sin(value)',
      'log10(sqrt(value))',
      'zeros(30000, 30000).log(value)',
      'exp',
      'pi * value',
      'value x',
      'x = value',
      '[value, value]',
      '"value"',
      'value *'
    ]) {
      expect(convert(formula, 1), formula).to.equal(undefined)
    }
  })

  it('returns nothing for a result that is not finite', () => {
    expect(convert('value / 0', 1)).to.equal(undefined)
    expect(convert('1e309 * value', 1)).to.equal(undefined)
    expect(convert('value / 0', 0)).to.equal(undefined)
  })

  it('returns nothing for a value that is not a finite number', () => {
    for (const value of [null, undefined, '12', '', 'abc', true, NaN, Infinity])
      expect(
        convert('value * 2', value as unknown as number),
        String(value)
      ).to.equal(undefined)
  })

  it('rejects deeply nested formulas without throwing', () => {
    expect(convert('1+'.repeat(LONG_CHAIN_TERMS) + 'value', 1)).to.equal(
      undefined
    )
    expect(convert('-'.repeat(DEEP_NEGATIONS) + 'value', 1)).to.equal(undefined)
  })

  it('converts a valid formula just under the length cap', () => {
    const terms = '+0'.repeat((MAX_FORMULA_LENGTH - 'value'.length - 1) / 2)
    const formula = 'value' + terms
    expect(formula.length).to.be.below(MAX_FORMULA_LENGTH)
    expect(convert(formula, 7)).to.equal(7)
  })

  it('keeps converting after more distinct formulas than it caches', () => {
    for (let i = 0; i <= MAX_CACHED_FORMULAS; i++) {
      expect(convert(`value + ${i}`, 1)).to.equal(1 + i)
    }
    expect(convert('value + 0', 1)).to.equal(1)
    expect(convert('sqrt(value)', 4)).to.equal(undefined)
  })

  it('accepts every shipped formula except the client-only formatters', () => {
    const definitions = JSON.parse(
      fs.readFileSync(STANDARD_DEFINITIONS, 'utf-8')
    ) as UnitDefinitions
    for (const [siUnit, definition] of Object.entries(definitions)) {
      for (const [targetUnit, conversion] of Object.entries(
        definition.conversions
      )) {
        for (const formula of [conversion.formula, conversion.inverseFormula]) {
          const where = `${siUnit} -> ${targetUnit}: ${formula}`
          if (CLIENT_ONLY_FORMATTERS.has(formula)) {
            expect(convert(formula, 1), where).to.equal(undefined)
          } else {
            expect(convert(formula, 1), where).to.not.equal(undefined)
          }
        }
      }
    }
  })
})
