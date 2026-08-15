import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CategorySelect } from './Meta'
import type { PresetDetails, UnitDefinitions } from '../../utils/unitConversion'

const DEFINITIONS: UnitDefinitions = {
  'm/s': {
    conversions: {
      'm/s': {
        formula: 'value * 1',
        inverseFormula: 'value * 1',
        symbol: 'm/s',
        longName: 'meters per second'
      },
      kn: {
        formula: 'value * 1.94384',
        inverseFormula: 'value * 0.514444',
        symbol: 'kn',
        longName: 'knots'
      }
    }
  }
}

const PRESET: PresetDetails = {
  categories: { speed: { targetUnit: 'kn' } }
}

const renderSelect = (
  value: unknown,
  setValue: (value: unknown) => void = () => {}
) =>
  render(
    <CategorySelect
      disabled={false}
      value={value}
      setValue={setValue}
      categories={['speed', 'windSpeed']}
      siUnit="m/s"
      unitDefinitions={DEFINITIONS}
      presetDetails={PRESET}
    />
  )

// What the server sends back for a path that follows the preset: the target
// unit comes with the conversion it resolved.
const RESOLVED_PRESET_UNITS = {
  category: 'speed',
  targetUnit: 'kn',
  formula: 'value * 1.94384',
  inverseFormula: 'value * 0.514444',
  symbol: 'kn'
}

const categorySelect = () => screen.getByLabelText('Display unit category')
const targetSelect = () => screen.queryByLabelText('Target unit')

describe('CategorySelect', () => {
  it('offers a target unit for a named category', () => {
    renderSelect({ category: 'speed' })
    expect(targetSelect()).toBeInTheDocument()
  })

  it('stores the target unit a named category was given', () => {
    const setValue = vi.fn()
    renderSelect({ category: 'speed' }, setValue)
    fireEvent.change(targetSelect()!, { target: { value: 'm/s' } })
    expect(setValue).toHaveBeenCalledWith({
      category: 'speed',
      targetUnit: 'm/s'
    })
  })

  it('leaves the conversion for the server to resolve', () => {
    const setValue = vi.fn()
    renderSelect({ category: 'speed' }, setValue)
    fireEvent.change(targetSelect()!, { target: { value: 'kn' } })
    expect(setValue.mock.calls[0][0]).not.toHaveProperty('formula')
    expect(setValue.mock.calls[0][0]).not.toHaveProperty('symbol')
  })

  it('drops the target unit when the default is chosen', () => {
    const setValue = vi.fn()
    renderSelect({ category: 'speed', targetUnit: 'm/s' }, setValue)
    fireEvent.change(targetSelect()!, { target: { value: '' } })
    expect(setValue).toHaveBeenCalledWith({ category: 'speed' })
  })

  it('names the unit the default follows', () => {
    renderSelect({ category: 'speed' })
    expect(
      screen.getByRole('option', { name: 'default (kn)' })
    ).toBeInTheDocument()
  })

  it('offers the default unit as an explicit choice as well', () => {
    const setValue = vi.fn()
    renderSelect({ category: 'speed' }, setValue)
    fireEvent.change(targetSelect()!, { target: { value: 'kn' } })
    expect(setValue).toHaveBeenCalledWith({
      category: 'speed',
      targetUnit: 'kn'
    })
  })

  it('shows the default as chosen for a path that follows the preset', () => {
    renderSelect(RESOLVED_PRESET_UNITS)
    expect(targetSelect()).toHaveValue('')
  })

  it('shows the target unit as chosen for a path that overrides the preset', () => {
    renderSelect({ category: 'speed', targetUnit: 'm/s' })
    expect(targetSelect()).toHaveValue('m/s')
  })

  it('does not turn the preset unit into an override on a category change', () => {
    const setValue = vi.fn()
    renderSelect(RESOLVED_PRESET_UNITS, setValue)
    fireEvent.change(categorySelect(), { target: { value: 'windSpeed' } })
    expect(setValue).toHaveBeenCalledWith({ category: 'windSpeed' })
  })

  it('keeps a still valid target unit across a category change', () => {
    const setValue = vi.fn()
    renderSelect({ category: 'speed', targetUnit: 'm/s' }, setValue)
    fireEvent.change(categorySelect(), { target: { value: 'windSpeed' } })
    expect(setValue).toHaveBeenCalledWith({
      category: 'windSpeed',
      targetUnit: 'm/s'
    })
  })

  it('drops the target unit when the base category is chosen', () => {
    const setValue = vi.fn()
    renderSelect({ category: 'speed', targetUnit: 'kn' }, setValue)
    fireEvent.change(categorySelect(), { target: { value: 'base' } })
    expect(setValue).toHaveBeenCalledWith({ category: 'base' })
  })

  it('hides the target unit for the base category', () => {
    renderSelect({ category: 'base' })
    expect(targetSelect()).not.toBeInTheDocument()
  })

  it('stores the explicit conversion a custom unit carries', () => {
    const setValue = vi.fn()
    renderSelect({ category: 'custom' }, setValue)
    fireEvent.change(targetSelect()!, { target: { value: 'kn' } })
    expect(setValue).toHaveBeenCalledWith({
      category: 'custom',
      targetUnit: 'kn',
      formula: 'value * 1.94384',
      inverseFormula: 'value * 0.514444',
      symbol: 'kn'
    })
  })

  it('gives a unit kept into the custom category its conversion', () => {
    const setValue = vi.fn()
    renderSelect({ category: 'speed', targetUnit: 'm/s' }, setValue)
    fireEvent.change(categorySelect(), { target: { value: 'custom' } })
    expect(setValue).toHaveBeenCalledWith({
      category: 'custom',
      targetUnit: 'm/s',
      formula: 'value * 1',
      inverseFormula: 'value * 1',
      symbol: 'm/s'
    })
  })
})
