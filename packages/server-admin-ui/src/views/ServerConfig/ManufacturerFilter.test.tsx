import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ManufacturerFilter from './ManufacturerFilter'

const KNOWN = [
  { name: 'Garmin', code: 229 },
  { name: 'Victron Energy', code: 358 }
]

function renderFilter(
  options: Record<string, unknown> = {},
  onChange = vi.fn()
) {
  render(
    <ManufacturerFilter
      options={{ filtersEnabled: true, ...options }}
      onChange={onChange}
      known={KNOWN}
    />
  )
  return onChange
}

function changed(name: string, value: unknown) {
  return expect.objectContaining({
    target: expect.objectContaining({ name, value })
  })
}

describe('ManufacturerFilter', () => {
  it('filters nothing by default', () => {
    renderFilter()
    expect(
      screen.getByRole('combobox', { name: 'Manufacturers' })
    ).toHaveProperty('value', '')
    expect(screen.queryByRole('combobox', { name: 'Manufacturer' })).toBeNull()
  })

  it('sets the mode', () => {
    const onChange = renderFilter()
    fireEvent.change(screen.getByRole('combobox', { name: 'Manufacturers' }), {
      target: { value: 'allow' }
    })
    expect(onChange).toHaveBeenCalledWith(
      changed('options.manufacturerFilter', 'allow')
    )
  })

  it('adds a listed manufacturer, spelled as the list spells it', () => {
    const onChange = renderFilter({
      manufacturerFilter: 'deny',
      manufacturers: ['Garmin']
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Manufacturer' }), {
      target: { value: 'victron energy' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Add manufacturer/ }))
    expect(onChange).toHaveBeenCalledWith(
      changed('options.manufacturers', ['Garmin', 'Victron Energy'])
    )
  })

  it('does not add a name that is not listed', () => {
    renderFilter({ manufacturerFilter: 'allow', manufacturers: [] })
    fireEvent.change(screen.getByRole('combobox', { name: 'Manufacturer' }), {
      target: { value: 'Vicron' }
    })
    expect(
      screen.getByRole('button', { name: /Add manufacturer/ })
    ).toHaveProperty('disabled', true)
  })

  it('removes a manufacturer', () => {
    const onChange = renderFilter({
      manufacturerFilter: 'allow',
      manufacturers: ['Garmin', 'Victron Energy']
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Garmin' }))
    expect(onChange).toHaveBeenCalledWith(
      changed('options.manufacturers', ['Victron Energy'])
    )
  })

  it('is disabled while the filters are off', () => {
    renderFilter({ filtersEnabled: false, manufacturerFilter: 'allow' })
    expect(
      screen.getByRole('combobox', { name: 'Manufacturers' })
    ).toHaveProperty('disabled', true)
  })
})
