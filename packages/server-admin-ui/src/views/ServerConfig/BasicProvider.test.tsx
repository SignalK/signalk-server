import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BasicProvider, { isMxpgnBusOrder } from './BasicProvider'

const ALL = 'All sentences'
const NONE = 'No sentences'
const LISTED = 'These sentences'
const SENTENCES = 'Sentences to send'

function renderNmea0183(
  options: Record<string, unknown>,
  onChange = vi.fn(),
  isNew?: boolean
) {
  render(
    <BasicProvider
      value={{
        type: 'NMEA0183',
        id: 'gps',
        enabled: true,
        isNew,
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

describe('isMxpgnBusOrder', () => {
  it('uses mxpgnBusOrder when set', () => {
    expect(isMxpgnBusOrder({ mxpgnBusOrder: true }, true)).toBe(true)
    expect(
      isMxpgnBusOrder({ mxpgnBusOrder: false, littleEndianMXPGN: false })
    ).toBe(false)
  })

  it('defaults new connections to ShipModul order', () => {
    expect(isMxpgnBusOrder({}, true)).toBe(false)
  })

  it('keeps bus order for saved connections without a byte order', () => {
    expect(isMxpgnBusOrder({})).toBe(true)
    expect(isMxpgnBusOrder({ littleEndianMXPGN: false })).toBe(true)
  })

  it('reads littleEndianMXPGN true as ShipModul order', () => {
    expect(isMxpgnBusOrder({ littleEndianMXPGN: true })).toBe(false)
  })
})

describe('BasicProvider NMEA 0183 $MXPGN byte order', () => {
  const BYTE_ORDER = '$MXPGN byte order'

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(false))
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows ShipModul for a new connection', () => {
    renderNmea0183({}, vi.fn(), true)
    expect(screen.getByLabelText(BYTE_ORDER)).toHaveProperty(
      'value',
      'shipmodul'
    )
  })

  it('shows Others for a saved connection without a byte order', () => {
    renderNmea0183({})
    expect(screen.getByLabelText(BYTE_ORDER)).toHaveProperty('value', 'bus')
  })

  it('stores the choice as options.mxpgnBusOrder', () => {
    const onChange = renderNmea0183({}, vi.fn(), true)
    fireEvent.change(screen.getByLabelText(BYTE_ORDER), {
      target: { value: 'bus' }
    })
    expect(onChange).toHaveBeenCalledWith(
      changedTarget('options.mxpgnBusOrder', true)
    )
  })
})

describe('BasicProvider NMEA 2000 send broadcast output', () => {
  const SWITCH = 'Send broadcast N2K output'

  function renderNmea2000(
    options: Record<string, unknown>,
    onChange = vi.fn()
  ) {
    render(
      <BasicProvider
        value={{
          type: 'NMEA2000',
          id: 'bus2',
          enabled: true,
          options: { type: 'ydwg02-canboatjs', ...options }
        }}
        onChange={onChange}
        onPropChange={vi.fn()}
      />
    )
    return onChange
  }

  beforeEach(() => {
    // The form fetches the serial ports and more, and a Response is read
    // only once.
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            String(url).includes('serialports') ? { serialports: [] } : false
          )
        )
      )
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is on for a connection without the setting', () => {
    renderNmea2000({})
    expect(screen.getByLabelText(SWITCH)).toHaveProperty('checked', true)
  })

  it('is off when sendBroadcastOutput is false', () => {
    renderNmea2000({ sendBroadcastOutput: false })
    expect(screen.getByLabelText(SWITCH)).toHaveProperty('checked', false)
  })

  it('reports the switch as options.sendBroadcastOutput', () => {
    // React puts a controlled checkbox back after the event, so the state
    // is read while the handler runs.
    const changes: Array<[string, boolean]> = []
    renderNmea2000(
      {},
      vi.fn((event) => changes.push([event.target.name, event.target.checked]))
    )
    fireEvent.click(screen.getByLabelText(SWITCH))
    expect(changes).toEqual([['options.sendBroadcastOutput', false]])
  })

  it('is not shown for a connection that does not write', () => {
    renderNmea2000({ type: 'ngt-1' })
    expect(screen.queryByLabelText(SWITCH)).toBeNull()
  })
})
