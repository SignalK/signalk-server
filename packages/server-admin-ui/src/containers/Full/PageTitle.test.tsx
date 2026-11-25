import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router-dom'
import PageTitle from './PageTitle'
import { useStore } from '../../store'

function renderTitle(route = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <PageTitle />
      <Link to="/dashboard">Dashboard</Link>
      <Link to="/e/other_app">Other app</Link>
    </MemoryRouter>
  )
}

describe('Browser tab title', () => {
  beforeEach(() => {
    useStore.setState({
      vesselInfo: { name: 'Test Vessel' },
      webapps: [
        { name: '@signalk/logbook', signalk: { displayName: 'Logbook' } },
        { name: 'other-app' }
      ]
    })
  })
  afterEach(cleanup)

  it('names an embedded app and restores the vessel on leaving it', () => {
    const view = renderTitle('/e/_signalk_logbook')
    expect(document.title).toBe('Logbook')
    fireEvent.click(view.getByText('Other app'))
    expect(document.title).toBe('other-app')
    fireEvent.click(view.getByText('Dashboard'))
    expect(document.title).toBe('Test Vessel')
  })

  it('keeps the app title when vessel information arrives again', () => {
    renderTitle('/e/_signalk_logbook')
    act(() => useStore.getState().setVesselInfo({ name: 'Updated Vessel' }))
    expect(document.title).toBe('Logbook')
  })

  it('uses the module id until its manifest arrives', () => {
    useStore.setState({ webapps: [] })
    renderTitle('/e/_signalk_logbook')
    expect(document.title).toBe('_signalk_logbook')
    act(() =>
      useStore
        .getState()
        .setWebapps([
          { name: '@signalk/logbook', signalk: { displayName: 'Logbook' } }
        ])
    )
    expect(document.title).toBe('Logbook')
  })

  it('updates the vessel title on ordinary pages', () => {
    renderTitle()
    expect(document.title).toBe('Test Vessel')
    act(() => useStore.getState().setVesselInfo({ name: 'Updated Vessel' }))
    expect(document.title).toBe('Updated Vessel')
    act(() => useStore.getState().setVesselInfo({}))
    expect(document.title).toBe('Signal K Server')
  })
})
