import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useHistoryProviderUnavailable,
  UNAVAILABLE_GRACE_MS,
  UNAVAILABLE_POLL_INTERVAL_MS
} from './useHistoryProviderStatus'

let registeredIds: string[]
const CONFIGURED = 'signalk-to-questdb'

function stubProviderFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      const body = url.endsWith('/_default')
        ? {
            id: registeredIds[0],
            configured: CONFIGURED
          }
        : Object.fromEntries(
            registeredIds.map((id) => [
              id,
              { isDefault: id === registeredIds[0] }
            ])
          )
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body)
      } as Response)
    })
  )
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useHistoryProviderUnavailable', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stubProviderFetch()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not warn while the configured provider is registered', async () => {
    registeredIds = [CONFIGURED]
    const { result } = renderHook(() => useHistoryProviderUnavailable())
    await advance(UNAVAILABLE_GRACE_MS * 2)
    expect(result.current).toBe(false)
  })

  it('warns only after unavailability persists past the grace period', async () => {
    registeredIds = []
    const { result } = renderHook(() => useHistoryProviderUnavailable())
    await advance(0)
    expect(result.current).toBe(false)

    await advance(UNAVAILABLE_GRACE_MS - 1000)
    expect(result.current).toBe(false)

    await advance(2000)
    expect(result.current).toBe(true)
  })

  it('does not warn when the provider registers within the grace period', async () => {
    registeredIds = []
    const { result } = renderHook(() => useHistoryProviderUnavailable())
    await advance(UNAVAILABLE_POLL_INTERVAL_MS + 100)
    expect(result.current).toBe(false)

    registeredIds = [CONFIGURED]
    await advance(UNAVAILABLE_GRACE_MS)
    expect(result.current).toBe(false)
  })

  it('clears the warning when the provider registers later', async () => {
    registeredIds = []
    const { result } = renderHook(() => useHistoryProviderUnavailable())
    await advance(0)
    await advance(UNAVAILABLE_GRACE_MS + 1000)
    expect(result.current).toBe(true)

    registeredIds = [CONFIGURED]
    await advance(UNAVAILABLE_POLL_INTERVAL_MS + 100)
    expect(result.current).toBe(false)
  })
})
