import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStore, useHistoryProviderUnavailable } from './index'
import type { HistoryProvidersState } from './slices/appSlice'

const setProviders = (data: HistoryProvidersState | null) =>
  act(() => useStore.setState({ historyProviders: data }))

describe('useHistoryProviderUnavailable', () => {
  beforeEach(() => {
    useStore.setState({ historyProviders: null })
  })

  it('is false before the first server snapshot arrives', () => {
    const { result } = renderHook(() => useHistoryProviderUnavailable())
    expect(result.current).toBe(false)
  })

  it('is false when no provider is configured', () => {
    const { result } = renderHook(() => useHistoryProviderUnavailable())
    setProviders({
      ids: ['questdb'],
      defaultId: 'questdb',
      configuredId: undefined,
      configuredAvailable: false
    })
    expect(result.current).toBe(false)
  })

  it('is false while the configured provider is available', () => {
    const { result } = renderHook(() => useHistoryProviderUnavailable())
    setProviders({
      ids: ['questdb'],
      defaultId: 'questdb',
      configuredId: 'questdb',
      configuredAvailable: true
    })
    expect(result.current).toBe(false)
  })

  it('is true when the configured provider is unavailable', () => {
    const { result } = renderHook(() => useHistoryProviderUnavailable())
    setProviders({
      ids: ['influx'],
      defaultId: 'influx',
      configuredId: 'questdb',
      configuredAvailable: false
    })
    expect(result.current).toBe(true)
  })
})
