import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import ServerLog from './ServerLog'

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
