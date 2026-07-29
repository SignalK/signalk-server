import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import HistoryProviderSettings from './HistoryProviderSettings'
import { useStore } from '../../store'

const setProviders = (
  data: Parameters<
    ReturnType<typeof useStore.getState>['setHistoryProviders']
  >[0]
) => act(() => useStore.getState().setHistoryProviders(data))

describe('HistoryProviderSettings', () => {
  beforeEach(() => {
    useStore.setState({ historyProviders: null })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing before the first server snapshot arrives', () => {
    const { container } = render(<HistoryProviderSettings />)
    expect(container.firstChild).toBeNull()
  })

  it('stays hidden with a single available provider', () => {
    const { container } = render(<HistoryProviderSettings />)
    setProviders({
      ids: ['questdb'],
      defaultId: 'questdb',
      configuredId: 'questdb',
      configuredUnavailable: false
    })
    expect(container.firstChild).toBeNull()
  })

  it('shows the selector when there is a choice to make', () => {
    render(<HistoryProviderSettings />)
    setProviders({
      ids: ['questdb', 'influx'],
      defaultId: 'questdb',
      configuredId: 'questdb',
      configuredUnavailable: false
    })
    expect(screen.getByText('Default History Provider')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('questdb')
  })

  it('warns with the fallback name when the configured provider is unavailable', () => {
    render(<HistoryProviderSettings />)
    setProviders({
      ids: ['influx'],
      defaultId: 'influx',
      configuredId: 'questdb',
      configuredUnavailable: true
    })
    expect(
      screen.getByText(/"questdb" is not currently available/)
    ).toBeInTheDocument()
    expect(screen.getByText(/using "influx" as fallback/)).toBeInTheDocument()
  })

  it('clears the warning when a new snapshot reports the provider back', () => {
    render(<HistoryProviderSettings />)
    setProviders({
      ids: ['influx'],
      defaultId: 'influx',
      configuredId: 'questdb',
      configuredUnavailable: true
    })
    expect(screen.getByText(/is not currently available/)).toBeInTheDocument()

    setProviders({
      ids: ['influx', 'questdb'],
      defaultId: 'questdb',
      configuredId: 'questdb',
      configuredUnavailable: false
    })
    expect(
      screen.queryByText(/is not currently available/)
    ).not.toBeInTheDocument()
  })

  it('POSTs the selection and reports success without re-fetching state', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }))
    render(<HistoryProviderSettings />)
    setProviders({
      ids: ['questdb', 'influx'],
      defaultId: 'questdb',
      configuredId: 'questdb',
      configuredUnavailable: false
    })

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: 'influx' }
      })
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/signalk/v2/api/history/_providers/_default/influx',
      expect.objectContaining({ method: 'POST' })
    )
    expect(
      screen.getByText('Default history provider saved.')
    ).toBeInTheDocument()
  })

  it('surfaces the server error message on a failed save', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'no can do' }), { status: 500 })
    )
    render(<HistoryProviderSettings />)
    setProviders({
      ids: ['questdb', 'influx'],
      defaultId: 'questdb',
      configuredId: 'questdb',
      configuredUnavailable: false
    })

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: 'influx' }
      })
    })

    expect(screen.getByText('no can do')).toBeInTheDocument()
  })
})
