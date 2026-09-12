import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useStore } from '../../store'
import Meta, {
  CategorySelect,
  normalizeMetaForSave,
  UpdateContractSelect,
  Zones
} from './Meta'
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
// unit comes with the conversion it resolved, and the override it reports is
// empty. An older server reports no override at all.
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

  it('shows the default as chosen when the reported override is empty', () => {
    renderSelect({ ...RESOLVED_PRESET_UNITS, override: {} })
    expect(targetSelect()).toHaveValue('')
  })

  it('shows an override unit as chosen even when the preset agrees with it', () => {
    renderSelect({ ...RESOLVED_PRESET_UNITS, override: { targetUnit: 'kn' } })
    expect(targetSelect()).toHaveValue('kn')
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

  it('keeps a display format from an override across a unit change', () => {
    const setValue = vi.fn()
    renderSelect(
      {
        ...RESOLVED_PRESET_UNITS,
        displayFormat: '0.0',
        override: { displayFormat: '0.0' }
      },
      setValue
    )
    fireEvent.change(targetSelect()!, { target: { value: 'm/s' } })
    expect(setValue).toHaveBeenCalledWith({
      category: 'speed',
      targetUnit: 'm/s',
      displayFormat: '0.0'
    })
  })

  it('drops a display format that comes from the preset', () => {
    const setValue = vi.fn()
    renderSelect(
      { ...RESOLVED_PRESET_UNITS, displayFormat: '0.0', override: {} },
      setValue
    )
    fireEvent.change(targetSelect()!, { target: { value: 'm/s' } })
    expect(setValue).toHaveBeenCalledWith({
      category: 'speed',
      targetUnit: 'm/s'
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

const renderZones = (targetUnit?: string) =>
  render(
    <Zones
      zones={[]}
      isEditing={true}
      setZones={() => {}}
      idPrefix="test"
      siUnit="m/s"
      category="speed"
      targetUnit={targetUnit}
      presetDetails={PRESET}
      unitDefinitions={DEFINITIONS}
    />
  )

describe('Zones', () => {
  it('edits thresholds in the path-specific override unit', () => {
    renderZones('m/s')
    expect(screen.getByLabelText('Zone unit')).toHaveValue('m/s')
  })

  it('edits thresholds in the preset unit when there is no override', () => {
    renderZones()
    expect(screen.getByLabelText('Zone unit')).toHaveValue('kn')
  })
})

describe('UpdateContractSelect', () => {
  const renderContract = (
    value: unknown,
    setValue: (value: unknown) => void = () => {}
  ) =>
    render(
      <UpdateContractSelect
        disabled={false}
        value={value}
        setValue={setValue}
        inputId="contract"
      />
    )

  it('offers unset, periodic and event', () => {
    renderContract(undefined)
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).to.deep.equal([
      'Use the shipped classification',
      'periodic: regular updates expected',
      'event: emits only on change, never stale'
    ])
  })

  it('shows the unset option when the path has no contract', () => {
    renderContract(undefined)
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).to.equal(
      ''
    )
  })

  it('reflects a contract already set on the path', () => {
    renderContract('event')
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).to.equal(
      'event'
    )
  })

  it('reports a chosen contract to the editor', () => {
    const setValue = vi.fn()
    renderContract(undefined, setValue)
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'event' }
    })
    expect(setValue).toHaveBeenCalledWith('event')
  })

  it('clears the field rather than storing an empty string', () => {
    // An empty selection must remove the key so the shipped classification
    // applies again, not persist '' as the contract.
    const setValue = vi.fn()
    renderContract('event', setValue)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(setValue).toHaveBeenCalledWith(undefined)
  })
})

describe('normalizeMetaForSave', () => {
  it('drops a contract the user never chose', () => {
    // Add Field seeds '' — saving without touching the select must not
    // persist that as the contract.
    expect(
      normalizeMetaForSave({ description: 'x', updateContract: '' })
    ).to.deep.equal({ description: 'x' })
  })

  it('keeps periodic and event', () => {
    expect(normalizeMetaForSave({ updateContract: 'periodic' })).to.deep.equal({
      updateContract: 'periodic'
    })
    expect(normalizeMetaForSave({ updateContract: 'event' })).to.deep.equal({
      updateContract: 'event'
    })
  })

  it('drops an unrecognised contract', () => {
    expect(normalizeMetaForSave({ updateContract: 'sometimes' })).to.deep.equal(
      {}
    )
  })

  it('leaves metadata without a contract untouched', () => {
    const meta = { description: 'x', timeout: 900 }
    expect(normalizeMetaForSave(meta)).to.equal(meta)
  })
})

describe('Meta save clears removed fields', () => {
  const path = 'navigation.state'
  const meta = { description: 'Navigational state', updateContract: 'event' }

  const renderMeta = () =>
    render(<Meta meta={meta} path={path} context="vessels.self" />)

  const openEditorAndDeleteContract = async () => {
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    const selects = screen
      .getAllByRole('combobox')
      .filter((s) =>
        [...(s as HTMLSelectElement).options].some(
          (o) => o.value === 'description'
        )
      )
    const contractRow = selects.find(
      (s) => (s as HTMLSelectElement).value === 'updateContract'
    )
    expect(contractRow).to.not.equal(undefined)
    const trash = contractRow!
      .closest('div')!
      .parentElement!.querySelector('button')
    fireEvent.click(trash!)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
  }

  afterEach(() => {
    vi.restoreAllMocks()
    useStore.getState().clearData()
  })

  it('keeps the field locally when the save is rejected', async () => {
    useStore.getState().updateMeta('vessels.self', path, meta)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    )

    renderMeta()
    await openEditorAndDeleteContract()
    await new Promise((r) => setTimeout(r, 0))

    expect(
      useStore.getState().getMeta('vessels.self', path)?.updateContract
    ).to.equal('event')
  })

  it('drops the field locally once the save succeeds', async () => {
    useStore.getState().updateMeta('vessels.self', path, meta)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    renderMeta()
    await openEditorAndDeleteContract()
    await new Promise((r) => setTimeout(r, 0))

    expect(
      useStore.getState().getMeta('vessels.self', path)?.updateContract
    ).to.equal(undefined)
  })
})
