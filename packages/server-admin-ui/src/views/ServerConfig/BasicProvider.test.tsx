import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BasicProvider from './BasicProvider'

const ALL = 'All sentences'
const NONE = 'No sentences'
const LISTED = 'These sentences'
const SENTENCES = 'Sentences to send'

function renderNmea0183(options: Record<string, unknown>, onChange = vi.fn()) {
  render(
    <BasicProvider
      value={{
        type: 'NMEA0183',
        id: 'gps',
        enabled: true,
        options: { type: 'tcp', ...options }
      }}
      onChange={onChange}
      onPropChange={vi.fn()}
    />
  )
  return onChange
}

function changedTarget(name: string, value: unknown) {
  return expect.objectContaining({
    target: expect.objectContaining({ name, value })
  })
}

describe('BasicProvider NMEA 0183 send nmea0183 event for', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(false))
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('selects all sentences by default with the list disabled', () => {
    renderNmea0183({})
    expect(screen.getByLabelText(ALL)).toHaveProperty('checked', true)
    expect(screen.getByLabelText(SENTENCES)).toHaveProperty('disabled', true)
  })

  it('selects no sentences when suppress0183event is set', () => {
    renderNmea0183({ suppress0183event: true, nmea0183eventSentences: ['VDM'] })
    expect(screen.getByLabelText(NONE)).toHaveProperty('checked', true)
    const list = screen.getByLabelText(SENTENCES)
    expect(list).toHaveProperty('value', 'VDM')
    expect(list).toHaveProperty('disabled', true)
  })

  it('selects these sentences and shows the saved list', () => {
    renderNmea0183({ nmea0183eventSentences: ['VDM', 'VDO'] })
    expect(screen.getByLabelText(LISTED)).toHaveProperty('checked', true)
    const list = screen.getByLabelText(SENTENCES)
    expect(list).toHaveProperty('value', 'VDM,VDO')
    expect(list).toHaveProperty('disabled', false)
  })

  it('reports the edited list as an array of sentence IDs', () => {
    const onChange = renderNmea0183({ nmea0183eventSentences: [] })
    fireEvent.change(screen.getByLabelText(SENTENCES), {
      target: { value: 'VDM,VDO' }
    })
    expect(onChange).toHaveBeenCalledWith(
      changedTarget('options.nmea0183eventSentences', ['VDM', 'VDO'])
    )
  })

  it('switches to no sentences and keeps the list', () => {
    const onChange = renderNmea0183({ nmea0183eventSentences: ['VDM'] })
    fireEvent.click(screen.getByLabelText(NONE))
    expect(onChange).toHaveBeenLastCalledWith(
      changedTarget(
        'options',
        expect.objectContaining({
          suppress0183event: true,
          nmea0183eventSentences: ['VDM']
        })
      )
    )
  })

  it('switches to these sentences with an empty list', () => {
    const onChange = renderNmea0183({})
    fireEvent.click(screen.getByLabelText(LISTED))
    expect(onChange).toHaveBeenLastCalledWith(
      changedTarget(
        'options',
        expect.objectContaining({
          suppress0183event: false,
          nmea0183eventSentences: []
        })
      )
    )
  })

  it('switches to all sentences and drops the list', () => {
    const onChange = renderNmea0183({
      suppress0183event: true,
      nmea0183eventSentences: ['VDM']
    })
    fireEvent.click(screen.getByLabelText(ALL))
    const options = onChange.mock.lastCall?.[0].target.value
    expect(options).toMatchObject({ suppress0183event: false })
    expect(options).not.toHaveProperty('nmea0183eventSentences')
  })
})
