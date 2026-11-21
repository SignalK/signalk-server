import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import UnitPreferencesLoadNotice from './UnitPreferencesLoadNotice'
import { useStore } from '../store'

const LOAD_FAILED_NOTICE = "The unit preferences didn't load. Trying again."

describe('UnitPreferencesLoadNotice', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('retries a failed load less and less often until it succeeds', async () => {
    vi.useFakeTimers()
    const definitions = { m: { conversions: {} } }
    let serverUp = false
    const fetch = vi.fn(async (url: string) => ({
      ok: serverUp,
      status: 500,
      json: async () =>
        url.endsWith('/default-categories') ? { categories: {} } : definitions
    }))
    const loads = () =>
      fetch.mock.calls.filter(([url]) => url.endsWith('/definitions')).length
    vi.stubGlobal('fetch', fetch)
    useStore.setState({ unitPrefsLoaded: false, unitPrefsFailedLoads: 0 })

    render(<UnitPreferencesLoadNotice />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByText(LOAD_FAILED_NOTICE)).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(loads()).toBe(2)
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(loads()).toBe(2)

    serverUp = true
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(screen.queryByText(LOAD_FAILED_NOTICE)).toBeNull()
    expect(useStore.getState().unitDefinitions).toEqual(definitions)
  })

  it('leaves the unit preferences alone when the server has none', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async () => ({ ok: false, status: 404 }))
    vi.stubGlobal('fetch', fetch)
    useStore.setState({ unitPrefsLoaded: false, unitPrefsFailedLoads: 0 })

    render(<UnitPreferencesLoadNotice />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    const requests = fetch.mock.calls.length
    await act(() => vi.advanceTimersByTimeAsync(60000))
    expect(screen.queryByText(LOAD_FAILED_NOTICE)).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(requests)
  })
})
