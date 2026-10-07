import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import ServerLog from './ServerLog'
import { useStore } from '../../store'

const deltaHandlers = new Set<(message: unknown) => void>()
const sendMock = vi.fn()

const fakeSocket = { send: sendMock, readyState: 1 }

vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({ ws: fakeSocket, isConnected: true }),
  useDeltaMessages: (handler: (message: unknown) => void) => {
    deltaHandlers.add(handler)
  }
}))

vi.mock('./Logging', () => ({ default: () => null }))

const emit = (message: unknown) =>
  act(() => {
    deltaHandlers.forEach((handler) => handler(message))
  })

describe('ServerLog access denial', () => {
  beforeEach(() => {
    deltaHandlers.clear()
    sendMock.mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve([]),
          text: () => Promise.resolve('')
        })
      )
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('waits for entries when no error has arrived', () => {
    render(<ServerLog />)
    expect(screen.getByText('Waiting for log entries...')).toBeInTheDocument()
  })

  it('shows the server error instead of waiting forever', () => {
    render(<ServerLog />)
    emit({ errorMessage: 'Server log access requires admin permissions' })
    expect(
      screen.getByText('Server log access requires admin permissions')
    ).toBeInTheDocument()
    expect(screen.queryByText('Waiting for log entries...')).toBeNull()
  })

  it('ignores messages that carry no error', () => {
    render(<ServerLog />)
    emit({ updates: [] })
    expect(screen.getByText('Waiting for log entries...')).toBeInTheDocument()
  })

  it('keeps the error while the socket stays up', () => {
    const { rerender } = render(<ServerLog />)
    emit({ errorMessage: 'Server log access requires admin permissions' })
    rerender(<ServerLog />)
    expect(
      screen.getByText('Server log access requires admin permissions')
    ).toBeInTheDocument()
  })
})

describe('ServerLog clear button', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    deltaHandlers.clear()
    fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'DELETE'
          ? { ok: true, status: 204, statusText: 'No Content' }
          : {
              json: () => Promise.resolve([]),
              text: () => Promise.resolve('')
            }
      )
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const deleteCalls = () =>
    fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')

  const addEntry = (row: string) =>
    act(() => {
      useStore.getState().addLogEntry({ ts: 'Oct 07 00:00:00', row })
    })

  const clickClear = () =>
    act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /clear server log/i }))
    })

  const togglePause = (container: HTMLElement) =>
    act(() => {
      fireEvent.click(container.querySelector('#Pause') as HTMLElement)
    })

  it('asks the server to clear the log after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ServerLog />)
    addEntry('old line')
    await clickClear()
    expect(deleteCalls()).toHaveLength(1)
    expect(deleteCalls()[0][0]).toMatch(/\/log$/)
    // A live window empties on the server's LOG_CLEARED broadcast instead.
    expect(screen.getByText('old line')).toBeInTheDocument()
  })

  it('empties a paused window once the server has cleared', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { container } = render(<ServerLog />)
    togglePause(container)
    addEntry('old line')
    await clickClear()
    expect(screen.queryByText('old line')).toBeNull()
  })

  it('drops stale lines when resuming, before the server replays', () => {
    const { container } = render(<ServerLog />)
    addEntry('stale line')
    togglePause(container)
    togglePause(container)
    expect(screen.queryByText('stale line')).toBeNull()
  })

  it('does nothing when the confirmation is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ServerLog />)
    fireEvent.click(screen.getByRole('button', { name: /clear server log/i }))
    expect(deleteCalls()).toHaveLength(0)
  })

  it('allows one clear at a time', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let finishDelete: () => void = () => {}
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? new Promise((resolve) => {
            finishDelete = () =>
              resolve({ ok: true, status: 204, statusText: 'No Content' })
          })
        : Promise.resolve({ json: () => Promise.resolve([]) })
    )
    render(<ServerLog />)
    const button = screen.getByRole('button', { name: /clear server log/i })

    await clickClear()
    expect(button).toBeDisabled()
    await clickClear()
    expect(deleteCalls()).toHaveLength(1)

    await act(async () => {
      finishDelete()
    })
    expect(button).toBeEnabled()
  })

  it('empties a window paused while the clear was pending', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let finishDelete: () => void = () => {}
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? new Promise((resolve) => {
            finishDelete = () =>
              resolve({ ok: true, status: 204, statusText: 'No Content' })
          })
        : Promise.resolve({ json: () => Promise.resolve([]) })
    )
    const { container } = render(<ServerLog />)
    addEntry('old line')
    await clickClear()
    togglePause(container)
    await act(async () => {
      finishDelete()
    })
    expect(screen.queryByText('old line')).toBeNull()
  })

  it('reports a failed clear', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'DELETE'
          ? { ok: false, status: 401, statusText: 'Unauthorized' }
          : { json: () => Promise.resolve([]) }
      )
    )
    render(<ServerLog />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /clear server log/i }))
    })
    expect(
      screen.getByText('Failed to clear the server log: 401 Unauthorized')
    ).toBeInTheDocument()
  })
})
