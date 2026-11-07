import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import WebSocketClients from './WebSocketClients'

const login = vi.hoisted(() => ({
  current: { status: 'loggedIn', username: 'admin', userLevel: 'admin' }
}))

vi.mock('../../store', () => ({
  useLoginStatus: () => login.current
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
    login.current = {
      status: 'loggedIn',
      username: 'admin',
      userLevel: 'admin'
    }
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

  it('sends one request at a time and refreshes once it answers', async () => {
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

    await act(() => vi.advanceTimersByTimeAsync(30000))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => answerFirst(listResponse([])))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('ESP32 Websocket Client')).toBeDefined()
  })

  it('shows the list when a request outlasts the polling interval', async () => {
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

    await act(() => vi.advanceTimersByTimeAsync(25000))
    await act(async () => answers[0](listResponse([spark])))
    expect(screen.getByText('ESP32 Websocket Client')).toBeDefined()
  })

  it('keeps a pending request when the client count changes', async () => {
    let answerFirst: (response: Partial<Response>) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockReturnValueOnce(
          new Promise<Partial<Response>>((resolve) => {
            answerFirst = resolve
          })
        )
        .mockReturnValue(new Promise(() => {}))
    )
    const { rerender } = render(<WebSocketClients clientCount={1} />)
    rerender(<WebSocketClients clientCount={2} />)

    await act(async () => answerFirst(listResponse([spark])))
    expect(screen.getByText('ESP32 Websocket Client')).toBeDefined()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('gives up on a request that never answers and polls again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            )
          })
      )
      .mockResolvedValue(listResponse([spark]))
    vi.stubGlobal('fetch', fetchMock)
    render(<WebSocketClients clientCount={1} />)

    await act(() => vi.advanceTimersByTimeAsync(59000))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
    expect(await screen.findByText('ESP32 Websocket Client')).toBeDefined()
  })

  it('aborts the pending request when it goes away', () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    const { unmount } = render(<WebSocketClients clientCount={1} />)
    const { signal } = fetchMock.mock.calls[0][1] as RequestInit
    expect(signal?.aborted).toBe(false)

    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('hides the list from the next login before its own answer', async () => {
    mockFetch(listResponse([spark]))
    const { container, rerender } = render(<WebSocketClients clientCount={1} />)
    await screen.findByText('ESP32 Websocket Client')

    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    login.current = {
      status: 'notLoggedIn',
      username: '',
      userLevel: 'readonly'
    }
    rerender(<WebSocketClients clientCount={1} />)
    expect(container.textContent).toBe('')
  })

  it('hides the list when the same user loses admin access', async () => {
    mockFetch(listResponse([spark]))
    const { container, rerender } = render(<WebSocketClients clientCount={1} />)
    await screen.findByText('ESP32 Websocket Client')

    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    login.current = { ...login.current, userLevel: 'readonly' }
    rerender(<WebSocketClients clientCount={1} />)
    expect(container.textContent).toBe('')
  })

  it('ignores the previous login answering after the next one', async () => {
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
    const { rerender } = render(<WebSocketClients clientCount={1} />)
    login.current = { status: 'loggedIn', username: 'bob', userLevel: 'admin' }
    rerender(<WebSocketClients clientCount={1} />)
    expect(answers).toHaveLength(2)

    await act(async () => answers[1](listResponse([spark])))
    await act(async () =>
      answers[0](listResponse([{ ...spark, userAgent: 'Previous login' }]))
    )
    expect(screen.getByText('ESP32 Websocket Client')).toBeDefined()
    expect(screen.queryByText('Previous login')).toBeNull()
  })
})
