import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import WebSocketClients from './WebSocketClients'

const adminLogin = {
  status: 'loggedIn',
  authenticationRequired: true,
  username: 'admin',
  userLevel: 'admin'
}

const login = vi.hoisted(() => ({
  current: {} as Record<string, unknown>
}))

vi.mock('../../store', () => ({
  useLoginStatus: () => login.current
}))

const spark = {
  id: 'spark-1',
  ip: '10.0.0.7',
  userAgent: 'ESP32 Websocket Client',
  connectedAt: '2026-10-29T18:00:00.000Z',
  serverEvents: false
}

function listResponse(clients: object[]): Partial<Response> {
  return { ok: true, json: async () => clients }
}

function mockFetch(response: Partial<Response>) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderClients(props: { clientCount?: number; open?: boolean } = {}) {
  const element = (p: typeof props) => (
    <WebSocketClients
      clientCount={p.clientCount ?? 1}
      open={p.open ?? true}
      onToggle={() => {}}
    />
  )
  const result = render(element(props))
  return {
    ...result,
    rerender: (next: typeof props) => result.rerender(element(next))
  }
}

describe('WebSocketClients', () => {
  beforeEach(() => {
    login.current = { ...adminLogin }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks the server nothing while collapsed', () => {
    const fetchMock = mockFetch(listResponse([spark]))
    const { rerender } = renderClients({ open: false })
    rerender({ open: false, clientCount: 2 })

    expect(screen.getByText('WebSocket Clients')).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lists each client with its User-Agent once opened', async () => {
    mockFetch(listResponse([spark]))
    const { rerender } = renderClients({ open: false })
    rerender({ open: true })

    expect(await screen.findByText('ESP32 Websocket Client')).toBeDefined()
    expect(screen.getByText('10.0.0.7')).toBeDefined()
    expect(screen.queryByText('Admin UI')).toBeNull()
  })

  it('marks the connections of the admin UI', async () => {
    mockFetch(listResponse([{ ...spark, serverEvents: true }]))
    renderClients()

    expect(await screen.findByText('Admin UI')).toBeDefined()
  })

  it('reloads the list when the client count changes', async () => {
    const fetchMock = mockFetch(listResponse([spark]))
    const { rerender } = renderClients()
    await screen.findByText('ESP32 Websocket Client')

    mockFetch(listResponse([{ ...spark, id: 'spark-2', userAgent: 'KIP' }]))
    rerender({ clientCount: 2 })

    expect(await screen.findByText('KIP')).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reloads the list from the refresh button', async () => {
    const fetchMock = mockFetch(listResponse([spark]))
    renderClients()
    await screen.findByText('ESP32 Websocket Client')

    fireEvent.click(screen.getByTitle('Refresh'))

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('drops an older request once a newer one is sent', async () => {
    const requests: {
      signal: AbortSignal
      answer: (response: Partial<Response>) => void
    }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Partial<Response>>((resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            )
            requests.push({
              signal: init.signal as AbortSignal,
              answer: resolve
            })
          })
      )
    )
    const { rerender } = renderClients()
    rerender({ clientCount: 2 })

    expect(requests).toHaveLength(2)
    expect(requests[0].signal.aborted).toBe(true)
    await act(async () => requests[1].answer(listResponse([spark])))
    expect(screen.getByText('ESP32 Websocket Client')).toBeDefined()
  })

  it('says so when the server refuses the list', async () => {
    mockFetch(listResponse([spark]))
    const { rerender } = renderClients()
    await screen.findByText('ESP32 Websocket Client')

    mockFetch({ ok: false })
    rerender({ clientCount: 2 })

    expect(
      await screen.findByText('The client list is not available.')
    ).toBeDefined()
    expect(screen.queryByText('ESP32 Websocket Client')).toBeNull()
  })

  it('is not shown to users who are not admins', () => {
    const fetchMock = mockFetch(listResponse([spark]))
    login.current = { ...adminLogin, userLevel: 'readonly' }
    const { container } = renderClients()

    expect(container.textContent).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is shown to everyone when security is off', async () => {
    mockFetch(listResponse([spark]))
    login.current = { status: 'notLoggedIn', authenticationRequired: false }
    renderClients()

    expect(await screen.findByText('ESP32 Websocket Client')).toBeDefined()
  })

  it('hides the list from the next login before its own answer', async () => {
    mockFetch(listResponse([spark]))
    const { rerender } = renderClients()
    await screen.findByText('ESP32 Websocket Client')

    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    login.current = { ...adminLogin, username: 'bob' }
    rerender({})

    expect(screen.queryByText('ESP32 Websocket Client')).toBeNull()
  })

  it('aborts the pending request when it goes away', () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    const { unmount } = renderClients()
    const { signal } = fetchMock.mock.calls[0][1] as RequestInit
    expect(signal?.aborted).toBe(false)

    unmount()
    expect(signal?.aborted).toBe(true)
  })
})
