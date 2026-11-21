import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import UnitPreferencesSettings from './UnitPreferencesSettings'
import { useStore } from '../../store'

const SERVER_DEFAULT = 'imperial-us'
const LOAD_FAILED_NOTICE = "The unit preferences didn't load. Trying again."

describe('UnitPreferencesSettings without admin rights', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/signalk/v1/unitpreferences/config'
          ? { ok: true, json: async () => ({ activePreset: SERVER_DEFAULT }) }
          : { ok: false, status: 401, json: async () => ({}) }
      )
    )
    useStore.setState({
      unitPrefsLoaded: false,
      loginStatus: {
        authenticationRequired: true,
        status: 'notLoggedIn',
        readOnlyAccess: true
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the server default units without letting them be changed', async () => {
    render(<UnitPreferencesSettings />)

    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    expect(select.value).toBe(SERVER_DEFAULT)
    expect(select.disabled).toBe(true)
    expect(
      screen.getByText('Log in to choose your own display units.')
    ).toBeTruthy()
    expect(screen.queryByText('Upload')).toBeNull()
    expect(screen.queryByText(LOAD_FAILED_NOTICE)).toBeNull()
  })

  it('lets a logged-in user who is not an admin choose units', async () => {
    useStore.setState({
      loginStatus: {
        status: 'loggedIn',
        authenticationRequired: true,
        readOnlyAccess: true,
        userLevel: 'readwrite'
      }
    })
    render(<UnitPreferencesSettings />)
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    expect(select.disabled).toBe(false)
  })

  it('keeps the choice locked for a logged-in read-only user', async () => {
    useStore.setState({
      loginStatus: {
        status: 'loggedIn',
        authenticationRequired: true,
        readOnlyAccess: true,
        userLevel: 'readonly'
      }
    })
    render(<UnitPreferencesSettings />)
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(
      screen.getByText(
        'Only users with write access can choose their own display units.'
      )
    ).toBeTruthy()
  })

  it('shows the units to a logged-in read-only user on a closed server', async () => {
    useStore.setState({
      loginStatus: {
        status: 'loggedIn',
        authenticationRequired: true,
        readOnlyAccess: false,
        userLevel: 'readonly'
      }
    })
    render(<UnitPreferencesSettings />)
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    expect(select.value).toBe(SERVER_DEFAULT)
    expect(select.disabled).toBe(true)
  })
})

describe('UnitPreferencesSettings', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows an active preset that no longer exists as missing', () => {
    useStore.setState({
      unitPrefsLoaded: true,
      unitPrefsFailedLoads: 0,
      activePreset: 'deleted-preset',
      loginStatus: { status: 'notLoggedIn', authenticationRequired: true }
    })
    render(<UnitPreferencesSettings />)
    expect(
      screen.getByDisplayValue('deleted-preset (missing)')
    ).toBeInTheDocument()
  })

  it('stays visible and retries when the preset list fails to load', async () => {
    vi.useFakeTimers()
    let serverUp = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/signalk/v1/unitpreferences/presets'
          ? {
              ok: serverUp,
              status: 500,
              json: async () => ({ custom: ['my-units'] })
            }
          : {
              ok: true,
              json: async () => ({ activePreset: 'my-units', categories: {} })
            }
      )
    )
    useStore.setState({
      unitPrefsLoaded: false,
      unitPrefsFailedLoads: 0,
      activePreset: 'nautical-metric',
      loginStatus: { status: 'notLoggedIn', authenticationRequired: false }
    })

    render(<UnitPreferencesSettings />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByDisplayValue('Nautical (Metric)')).toBeInTheDocument()
    expect(screen.getByText(LOAD_FAILED_NOTICE)).toBeInTheDocument()

    serverUp = true
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(screen.queryByText(LOAD_FAILED_NOTICE)).toBeNull()
    expect(screen.getByDisplayValue('my-units')).toBeInTheDocument()
  })

  it("says so when the user's preset fails to load", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/signalk/v1/applicationData/')
          ? { ok: false, status: 500 }
          : { ok: true, json: async () => ({}) }
      )
    )
    useStore.setState({
      unitPrefsLoaded: false,
      unitPrefsFailedLoads: 0,
      loginStatus: { status: 'notLoggedIn', authenticationRequired: false }
    })

    render(<UnitPreferencesSettings />)
    expect(await screen.findByText(LOAD_FAILED_NOTICE)).toBeInTheDocument()
  })
})
