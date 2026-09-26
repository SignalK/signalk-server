import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BasicProvider from './BasicProvider'

const SUPPRESS_FOR = 'Suppress nmea0183 event for'

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

describe('BasicProvider NMEA 0183 suppress0183eventSentences', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(false))
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the saved sentence list', () => {
    renderNmea0183({ suppress0183eventSentences: ['RMC', 'GGA'] })
    expect(screen.getByLabelText(SUPPRESS_FOR)).toHaveProperty(
      'value',
      'RMC,GGA'
    )
  })

  it('reports the edited list as an array of sentence IDs', () => {
    const onChange = renderNmea0183({})
    fireEvent.change(screen.getByLabelText(SUPPRESS_FOR), {
      target: { value: 'RMC,HDT' }
    })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          name: 'options.suppress0183eventSentences',
          value: ['RMC', 'HDT']
        })
      })
    )
  })

  it('hides the list while every sentence is suppressed', () => {
    renderNmea0183({
      suppress0183event: true,
      suppress0183eventSentences: ['RMC']
    })
    expect(screen.queryByLabelText(SUPPRESS_FOR)).toBeNull()
  })
})
