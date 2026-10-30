import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import WebSocketClients from './WebSocketClients'

vi.mock('../../store', () => ({
  useLoginStatus: () => ({ status: 'loggedIn', userLevel: 'admin' })
}))

const spark = {
  id: 'spark-1',
  ip: '10.0.0.7',
  userAgent: 'ESP32 Websocket Client',
  connectedAt: '2026-10-29T18:00:00.000Z'
}

function listResponse(clients: object[]): Partial<Response> {
  return { ok: true, json: async () => clients }
}

function mockFetch(response: Partial<Response>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

describe('WebSocketClients', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('lists each client with its User-Agent', async () => {
    mockFetch(listResponse([spark]))
    render(<WebSocketClients clientCount={1} />)
    expect(await screen.findByText('ESP32 Websocket Client')).toBeDefined()
    expect(screen.getByText('10.0.0.7')).toBeDefined()
  })

  it('hides the list once it is no longer available to the user', async () => {
    mockFetch(listResponse([spark]))
    const { container, rerender } = render(<WebSocketClients clientCount={1} />)
    await screen.findByText('ESP32 Websocket Client')

    mockFetch({ ok: false })
    rerender(<WebSocketClients clientCount={2} />)
    await vi.waitFor(() => expect(container.textContent).toBe(''))
  })

  it('keeps the newer list when an older request answers last', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let answerFirst: (response: Partial<Response>) => void = () => {}
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Partial<Response>>((resolve) => {
          answerFirst = resolve
        })
      )
      .mockResolvedValue(listResponse([spark]))
    vi.stubGlobal('fetch', fetchMock)
    render(<WebSocketClients clientCount={1} />)

    await act(() => vi.advanceTimersByTimeAsync(10000))
    await screen.findByText('ESP32 Websocket Client')

    await act(async () => answerFirst(listResponse([])))
    expect(screen.getByText('ESP32 Websocket Client')).toBeDefined()
  })

  it('shows the list when every request outlasts the polling interval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const answers: ((response: Partial<Response>) => void)[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Partial<Response>>((resolve) => {
            answers.push(resolve)
          })
      )
    )
    render(<WebSocketClients clientCount={1} />)

    await act(() => vi.advanceTimersByTimeAsync(10000))
    expect(answers).toHaveLength(2)
    await act(async () => answers[0](listResponse([spark])))
    expect(screen.getByText('ESP32 Websocket Client')).toBeDefined()
  })
})
