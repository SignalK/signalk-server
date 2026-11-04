import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Playground from './Playground'

const SELECT = 'NMEA 2000 connection to send to'
const SEND = /Send as PGN to server/

const nmea2000 = (id: string, type: string, options = {}, enabled = true) => ({
  id,
  type: 'NMEA2000',
  enabled,
  options: { type, ...options }
})

describe('Playground sends a PGN to one NMEA 2000 connection', () => {
  let inputTestBodies: Array<Record<string, unknown>>

  beforeEach(() => {
    inputTestBodies = []
    localStorage.setItem(
      'admin.v1.playground.input',
      JSON.stringify({ pgn: 127508, fields: { instance: 1 } })
    )
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      if (String(url).endsWith('/providers')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              nmea2000('bus1', 'ngt-1-canboatjs'),
              nmea2000('bus2', 'ydwg02-canboatjs', {
                sendBroadcastOutput: false
              }),
              nmea2000('old', 'ydwg02-canboatjs', {}, false),
              nmea2000('reader', 'ngt-1'),
              { id: 'gps', type: 'NMEA0183', enabled: true, options: {} }
            ])
          )
        )
      }
      inputTestBodies.push(JSON.parse(String(init?.body)))
      return Promise.resolve(
        new Response(
          JSON.stringify({
            deltas: [],
            n2kJson: [{ pgn: 127508 }],
            n2kOutAvailable: true
          })
        )
      )
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('lists the enabled connections that write', async () => {
    render(<Playground />)
    const select = await screen.findByLabelText(SELECT)
    const options = Array.from(select.querySelectorAll('option')).map(
      (option) => [option.value, option.textContent]
    )
    expect(options).toEqual([
      ['', 'All NMEA 2000 connections'],
      ['bus1', 'bus1'],
      ['bus2', 'bus2 (no broadcast)']
    ])
  })

  it('sends to every connection, or to the chosen one', async () => {
    render(<Playground />)
    const send = await screen.findByRole('button', { name: SEND })
    await waitFor(() => expect(send).toHaveProperty('disabled', false))

    fireEvent.click(send)
    await waitFor(() => expect(inputTestBodies.length).toBeGreaterThan(1))
    expect(inputTestBodies.at(-1)).not.toHaveProperty('n2kTarget')

    fireEvent.change(screen.getByLabelText(SELECT), {
      target: { value: 'bus2' }
    })
    const sent = inputTestBodies.length
    fireEvent.click(send)
    await waitFor(() => expect(inputTestBodies.length).toBeGreaterThan(sent))
    expect(inputTestBodies.at(-1)).toMatchObject({
      sendToN2K: true,
      n2kTarget: 'bus2'
    })
  })
})
