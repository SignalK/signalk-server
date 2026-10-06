import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BasicProvider from './BasicProvider'

const ALL = 'All sentences'
const INDIVIDUAL = 'Individual sentences'
const SENTENCES = 'Sentences to suppress'

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

describe('BasicProvider NMEA 0183 suppress nmea0183 event', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(false))
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('selects individual sentences and shows the saved list', () => {
    renderNmea0183({ suppress0183eventSentences: ['RMC', 'GGA'] })
    expect(screen.getByLabelText(INDIVIDUAL)).toHaveProperty('checked', true)
    expect(screen.getByLabelText(ALL)).toHaveProperty('checked', false)
    const list = screen.getByLabelText(SENTENCES)
    expect(list).toHaveProperty('value', 'RMC,GGA')
    expect(list).toHaveProperty('disabled', false)
  })

  it('reports the edited list as an array of sentence IDs', () => {
    const onChange = renderNmea0183({})
    fireEvent.change(screen.getByLabelText(SENTENCES), {
      target: { value: 'RMC,HDT' }
    })
    expect(onChange).toHaveBeenCalledWith(
      changedTarget('options.suppress0183eventSentences', ['RMC', 'HDT'])
    )
  })

  it('switches to all sentences', () => {
    const onChange = renderNmea0183({})
    fireEvent.click(screen.getByLabelText(ALL))
    expect(onChange).toHaveBeenLastCalledWith(
      changedTarget('options.suppress0183event', true)
    )
  })

  it('switches back to individual sentences', () => {
    const onChange = renderNmea0183({ suppress0183event: true })
    fireEvent.click(screen.getByLabelText(INDIVIDUAL))
    expect(onChange).toHaveBeenLastCalledWith(
      changedTarget('options.suppress0183event', false)
    )
  })

  it('keeps the list visible but disabled while all sentences are suppressed', () => {
    renderNmea0183({
      suppress0183event: true,
      suppress0183eventSentences: ['RMC']
    })
    expect(screen.getByLabelText(ALL)).toHaveProperty('checked', true)
    const list = screen.getByLabelText(SENTENCES)
    expect(list).toHaveProperty('value', 'RMC')
    expect(list).toHaveProperty('disabled', true)
  })
})
