import { describe, it, expect, beforeEach } from 'vitest'
import { useUiPrefs } from './uiSlice'

describe('uiSlice', () => {
  beforeEach(() => {
    localStorage.clear()
    useUiPrefs.setState({ expandedNavGroups: {} })
  })

  it('toggleNavGroup flips the named group', () => {
    useUiPrefs.getState().toggleNavGroup('Data')
    expect(useUiPrefs.getState().expandedNavGroups.Data).toBe(true)

    useUiPrefs.getState().toggleNavGroup('Data')
    expect(useUiPrefs.getState().expandedNavGroups.Data).toBe(false)
  })

  it('setNavGroupExpanded sets explicit state', () => {
    useUiPrefs.getState().setNavGroupExpanded('Security', true)
    expect(useUiPrefs.getState().expandedNavGroups.Security).toBe(true)

    useUiPrefs.getState().setNavGroupExpanded('Security', false)
    expect(useUiPrefs.getState().expandedNavGroups.Security).toBe(false)
  })

  it('keeps groups independent', () => {
    useUiPrefs.getState().setNavGroupExpanded('Data', true)
    useUiPrefs.getState().setNavGroupExpanded('Server', true)
    useUiPrefs.getState().toggleNavGroup('Data')

    expect(useUiPrefs.getState().expandedNavGroups).toEqual({
      Data: false,
      Server: true
    })
  })

  it('persists expanded groups to localStorage', () => {
    useUiPrefs.getState().setNavGroupExpanded('Data', true)
    const raw = localStorage.getItem('signalk-admin-ui-prefs')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string)
    expect(parsed.state.expandedNavGroups.Data).toBe(true)
  })
})
