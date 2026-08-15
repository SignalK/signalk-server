import { describe, it, expect } from 'vitest'
import {
  convertValue,
  type PresetDetails,
  type UnitDefinitions
} from './unitConversion'

const DEFINITIONS: UnitDefinitions = {
  'm/s': {
    conversions: {
      kn: {
        formula: 'value * 1.94384',
        inverseFormula: 'value * 0.514444',
        symbol: 'kn'
      },
      'km/h': {
        formula: 'value * 3.6',
        inverseFormula: 'value * 0.277778',
        symbol: 'km/h'
      }
    }
  }
}

const PRESET: PresetDetails = {
  categories: { speed: { targetUnit: 'kn' } }
}

describe('convertValue', () => {
  it('converts to the target unit the path asks for', () => {
    const converted = convertValue(10, 'm/s', 'speed', PRESET, DEFINITIONS, {
      targetUnit: 'km/h'
    })
    expect(converted).toEqual({ value: 36, unit: 'km/h' })
  })

  it('converts to the preset target unit when the path asks for none', () => {
    const converted = convertValue(10, 'm/s', 'speed', PRESET, DEFINITIONS)
    expect(converted?.unit).toBe('kn')
  })

  it('converts to the target unit without a preset', () => {
    const converted = convertValue(10, 'm/s', 'speed', null, DEFINITIONS, {
      targetUnit: 'km/h'
    })
    expect(converted).toEqual({ value: 36, unit: 'km/h' })
  })

  it('reports no conversion when the target unit is the SI unit', () => {
    expect(
      convertValue(10, 'm/s', 'speed', PRESET, DEFINITIONS, {
        targetUnit: 'm/s'
      })
    ).toBeNull()
  })

  it('uses the formula a custom unit carries', () => {
    const converted = convertValue(10, 'm/s', 'custom', PRESET, DEFINITIONS, {
      targetUnit: 'kn',
      formula: 'value * 2',
      symbol: 'kn'
    })
    expect(converted).toEqual({ value: 20, unit: 'kn' })
  })

  it('leaves the base category in SI units', () => {
    expect(convertValue(10, 'm/s', 'base', PRESET, DEFINITIONS)).toEqual({
      value: 10,
      unit: 'm/s'
    })
  })
})
