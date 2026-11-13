import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

  it('saves All manufacturers as an empty mode, replacing a saved one', () => {
    const onChange = renderFilter({
      manufacturerFilter: 'deny',
      manufacturers: ['Garmin']
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Manufacturers' }), {
      target: { value: '' }
    })
    expect(onChange).toHaveBeenCalledWith(
      changed('options.manufacturerFilter', '')
    )
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

  it('says the filter is off while no manufacturer is listed', () => {
    renderFilter({ manufacturerFilter: 'allow', manufacturers: [] })
    expect(screen.getByText(/the filter is off/)).toBeTruthy()
  })

  it('does not say the filter is off once a manufacturer is listed', () => {
    renderFilter({ manufacturerFilter: 'allow', manufacturers: ['Garmin'] })
    expect(screen.queryByText(/the filter is off/)).toBeNull()
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

  it('adds names only once the list has loaded from the server', async () => {
    window.serverRoutesPrefix = '/skServer'
    let answer: (value: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            answer = resolve
          })
      )
    )
    render(
      <ManufacturerFilter
        options={{ filtersEnabled: true, manufacturerFilter: 'allow' }}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText(/Loading the manufacturer names/)).toBeTruthy()
    expect(
      screen.getByRole('combobox', { name: 'Manufacturer' })
    ).toHaveProperty('disabled', true)
    answer({ ok: true, json: () => Promise.resolve(KNOWN) })
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Manufacturer' })
      ).toHaveProperty('disabled', false)
    )
    vi.unstubAllGlobals()
  })

  it('says so, and adds nothing, when the list fails to load', async () => {
    window.serverRoutesPrefix = '/skServer'
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
    )
    render(
      <ManufacturerFilter
        options={{ filtersEnabled: true, manufacturerFilter: 'allow' }}
        onChange={vi.fn()}
      />
    )
    await waitFor(() =>
      expect(screen.getByText(/could not be loaded/)).toBeTruthy()
    )
    expect(
      screen.getByRole('combobox', { name: 'Manufacturer' })
    ).toHaveProperty('disabled', true)
    vi.unstubAllGlobals()
  })
})
