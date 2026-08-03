import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, type Location } from 'react-router-dom'
import Sidebar from './Sidebar'

vi.mock('../../store', () => ({
  useAppStore: () => ({
    updates: [],
    storeAvailable: true,
    serverUpdate: undefined
  }),
  useAccessRequests: () => [],
  useDevices: () => [],
  useLoginStatus: () => ({ authenticationRequired: false }),
  usePlugins: () => [],
  useMultiSourcePaths: () => ({}),
  useReconciledGroups: () => [],
  useSourcePriorities: () => ({ sourcePriorities: [] }),
  usePriorityOverrides: () => ({ paths: [] }),
  usePriorityGroups: () => ({ groups: [] }),
  useActiveConflictCount: () => 0,
  useUnconfiguredGnssSources: () => [],
  useHistoryProviderUnavailable: () => false
}))

const MOBILE_SHOWN = 'sidebar-mobile-show'

function renderSidebar(pathname = '/dashboard') {
  const location = {
    pathname,
    search: '',
    hash: '',
    state: null,
    key: 'test'
  } as Location
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Sidebar location={location} />
    </MemoryRouter>
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    document.body.classList.add(MOBILE_SHOWN)
  })

  afterEach(() => {
    document.body.classList.remove(MOBILE_SHOWN)
  })

  it('closes the mobile sidebar when a page is picked', () => {
    // NavLink navigates via pushState, which fires no popstate, so nothing
    // else takes the overlay down and it covers the page just opened.
    renderSidebar()
    fireEvent.click(screen.getByText('Webapps'))
    expect(document.body.classList.contains(MOBILE_SHOWN)).toBe(false)
  })

  it('closes the mobile sidebar when a submenu entry is picked', () => {
    renderSidebar()
    fireEvent.click(screen.getByText('Data'))
    fireEvent.click(screen.getByText('Metadata'))
    expect(document.body.classList.contains(MOBILE_SHOWN)).toBe(false)
  })

  it('keeps the mobile sidebar open when a dropdown is expanded', () => {
    // Expanding also navigates (to the group's remembered page), but the
    // user is about to pick from the children that just appeared.
    renderSidebar()
    fireEvent.click(screen.getByText('Data'))
    expect(document.body.classList.contains(MOBILE_SHOWN)).toBe(true)
  })

  it('keeps the mobile sidebar open when a dropdown is collapsed', () => {
    // Rendering under /data/browser auto-opens the group, so a single click
    // collapses it.
    renderSidebar('/data/browser')
    fireEvent.click(screen.getByText('Data'))
    expect(document.body.classList.contains(MOBILE_SHOWN)).toBe(true)
  })

  it('closes the mobile sidebar when an external link is picked', () => {
    // The new tab leaves the current page untouched, but the menu entry was
    // acted on — leaving the overlay up means finding it on return.
    renderSidebar()
    fireEvent.click(screen.getByText('OpenApi'))
    expect(document.body.classList.contains(MOBILE_SHOWN)).toBe(false)
  })
})
