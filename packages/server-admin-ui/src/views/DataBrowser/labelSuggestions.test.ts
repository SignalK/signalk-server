import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useStore } from '../../store'
import { groupLabelSuggestions, useLabelSuggestions } from './labelSuggestions'

const SWITCH = 'electrical.switches.bank.215.1.state'

function respond(body: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 401,
    json: async () => body
  }))
}

describe('groupLabelSuggestions', () => {
  it('groups labels per path', () => {
    expect(
      groupLabelSuggestions([
        { path: 'a', label: 'Galley CO' },
        { path: 'a', label: 'Galley Gas' },
        { path: 'b', label: 'ER Port Highwater' }
      ])
    ).toEqual({
      a: ['Galley CO', 'Galley Gas'],
      b: ['ER Port Highwater']
    })
  })
})

describe('useLabelSuggestions', () => {
  beforeEach(() => {
    useStore.setState({ labelSuggestions: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads suggestions into the store', async () => {
    vi.stubGlobal(
      'fetch',
      respond({ suggestions: [{ path: SWITCH, label: 'ER Port Highwater' }] })
    )
    renderHook(() => useLabelSuggestions(true))
    await waitFor(() =>
      expect(useStore.getState().labelSuggestions).toEqual({
        [SWITCH]: ['ER Port Highwater']
      })
    )
  })

  it('asks nothing when disabled', () => {
    const fetchMock = respond({ suggestions: [] })
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useLabelSuggestions(false))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores a malformed answer', async () => {
    const fetchMock = respond({ suggestions: [{ path: SWITCH }] })
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useLabelSuggestions(true))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await Promise.resolve()
    expect(useStore.getState().labelSuggestions).toEqual({})
  })

  it('refreshes while mounted and stops when unmounted', async () => {
    vi.useFakeTimers()
    const fetchMock = respond({ suggestions: [] })
    vi.stubGlobal('fetch', fetchMock)
    const { unmount } = renderHook(() => useLabelSuggestions(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    unmount()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not start a refresh while a request is still open', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useLabelSuggestions(true))
    await vi.advanceTimersByTimeAsync(90_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
