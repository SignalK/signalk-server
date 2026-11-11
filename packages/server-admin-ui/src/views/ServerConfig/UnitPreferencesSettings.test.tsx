import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import UnitPreferencesSettings from './UnitPreferencesSettings'
import { useStore } from '../../store'

const SERVER_DEFAULT = 'imperial-us'

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
})
