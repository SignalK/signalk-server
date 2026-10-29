import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import WebSocketClients from './WebSocketClients'

vi.mock('../../store', () => ({
  useLoginStatus: () => ({ status: 'loggedIn', userLevel: 'admin' })
}))

function mockFetch(response: Partial<Response>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

describe('WebSocketClients', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists each client with its User-Agent', async () => {
    mockFetch({
      ok: true,
      json: async () => [
        {
          id: 'spark-1',
          ip: '10.0.0.7',
          userAgent: 'ESP32 Websocket Client',
          connectedAt: '2026-10-29T18:00:00.000Z'
        }
      ]
    })
    render(<WebSocketClients clientCount={1} />)
    expect(await screen.findByText('ESP32 Websocket Client')).toBeDefined()
    expect(screen.getByText('10.0.0.7')).toBeDefined()
  })

  it('shows nothing when the list is not available to the user', async () => {
    mockFetch({ ok: false })
    const { container } = render(<WebSocketClients clientCount={1} />)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
