import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useStore } from '../../../store'
import type { AppStoreState } from '../../../store/types'

// fetchAppStore runs on mount and would try to talk to the network; stub
// it so the tests stay deterministic and don't issue real fetches.
vi.mock('../../../dataFetching', () => ({
  fetchAppStore: vi.fn().mockResolvedValue(undefined)
}))

import Apps from './Apps'

const emptyStore: AppStoreState = {
  updates: [],
  installed: [],
  available: [],
  installing: []
}

function setAppStore(state: AppStoreState) {
  act(() => {
    useStore.getState().setAppStore(state)
  })
}

// Bootstrap's active tab variant is "secondary"; light is the inactive
// state. Asserting on the className is the cheapest way to tell which
// tab is selected — aria-pressed isn't set on these buttons.
function tabIsActive(name: RegExp | string): boolean {
  const button = screen.getByRole('button', { name })
  return button.className.includes('btn-secondary')
}

describe('Apps auto-jump on install completion', () => {
  beforeEach(() => {
    setAppStore(emptyStore)
    // View/search now live in the store (singleton across tests), so reset
    // them between cases or a tab switched in one test leaks into the next.
    act(() => {
      useStore.getState().setAppstoreView('All')
      useStore.getState().setAppstoreSearch('')
    })
  })

  function renderApps() {
    return render(
      <MemoryRouter>
        <Apps />
      </MemoryRouter>
    )
  }

  it('auto-jumps to Installed when the install queue drains', async () => {
    const user = userEvent.setup()
    setAppStore({
      ...emptyStore,
      installing: [{ name: 'plugin-a', isInstalling: true }]
    })
    renderApps()

    await user.click(screen.getByRole('button', { name: /Installs & Removes/ }))
    expect(tabIsActive(/Installs & Removes/)).toBe(true)

    setAppStore({
      ...emptyStore,
      installing: [{ name: 'plugin-a' }]
    })

    expect(tabIsActive(/^Installed$/)).toBe(true)
    expect(tabIsActive(/Installs & Removes/)).toBe(false)
  })

  it('lets the user manually return to Installs & Removes after the auto-jump', async () => {
    const user = userEvent.setup()
    setAppStore({
      ...emptyStore,
      installing: [{ name: 'plugin-a', isInstalling: true }]
    })
    renderApps()

    await user.click(screen.getByRole('button', { name: /Installs & Removes/ }))
    setAppStore({
      ...emptyStore,
      installing: [{ name: 'plugin-a' }]
    })
    expect(tabIsActive(/^Installed$/)).toBe(true)

    await user.click(screen.getByRole('button', { name: /Installs & Removes/ }))

    expect(tabIsActive(/Installs & Removes/)).toBe(true)
    expect(tabIsActive(/^Installed$/)).toBe(false)
  })

  it('re-arms after a second install completes', async () => {
    const user = userEvent.setup()
    setAppStore({
      ...emptyStore,
      installing: [{ name: 'plugin-a', isInstalling: true }]
    })
    renderApps()

    await user.click(screen.getByRole('button', { name: /Installs & Removes/ }))
    setAppStore({
      ...emptyStore,
      installing: [{ name: 'plugin-a' }]
    })
    expect(tabIsActive(/^Installed$/)).toBe(true)

    setAppStore({
      ...emptyStore,
      installing: [
        { name: 'plugin-a' },
        { name: 'plugin-b', isInstalling: true }
      ]
    })
    await user.click(screen.getByRole('button', { name: /Installs & Removes/ }))
    expect(tabIsActive(/Installs & Removes/)).toBe(true)

    setAppStore({
      ...emptyStore,
      installing: [{ name: 'plugin-a' }, { name: 'plugin-b' }]
    })

    expect(tabIsActive(/^Installed$/)).toBe(true)
  })

  it('does not auto-jump when an install in the batch failed', async () => {
    const user = userEvent.setup()
    setAppStore({
      ...emptyStore,
      installing: [
        { name: 'plugin-a', isInstalling: true },
        { name: 'plugin-b', isInstalling: true }
      ]
    })
    renderApps()

    await user.click(screen.getByRole('button', { name: /Installs & Removes/ }))

    setAppStore({
      ...emptyStore,
      installing: [
        { name: 'plugin-a' },
        { name: 'plugin-b', installFailed: true }
      ]
    })

    expect(tabIsActive(/Installs & Removes/)).toBe(true)
    expect(tabIsActive(/^Installed$/)).toBe(false)
  })

  it('does not auto-jump on first render with a stale installing array', () => {
    setAppStore({
      ...emptyStore,
      installing: [{ name: 'plugin-a' }]
    })
    renderApps()

    expect(tabIsActive(/^All$/)).toBe(true)
    expect(tabIsActive(/^Installed$/)).toBe(false)
  })
})

describe('Apps view/search state survives the detail round trip', () => {
  beforeEach(() => {
    setAppStore(emptyStore)
    act(() => {
      useStore.getState().setAppstoreView('All')
      useStore.getState().setAppstoreSearch('')
    })
  })

  function renderApps() {
    return render(
      <MemoryRouter>
        <Apps />
      </MemoryRouter>
    )
  }

  it('restores the selected view after an unmount/remount', async () => {
    const user = userEvent.setup()
    setAppStore({
      ...emptyStore,
      installed: [
        { name: 'plugin-a', installedVersion: '1.0.0', version: '1.0.0' }
      ]
    })
    const { unmount } = renderApps()

    await user.click(screen.getByRole('button', { name: /^Installed$/ }))
    expect(tabIsActive(/^Installed$/)).toBe(true)

    // Opening a plugin detail page unmounts Apps; returning remounts it.
    unmount()
    renderApps()

    expect(tabIsActive(/^Installed$/)).toBe(true)
    expect(tabIsActive(/^All$/)).toBe(false)
  })

  it('restores the search term after an unmount/remount', async () => {
    const user = userEvent.setup()
    const { unmount } = renderApps()

    await user.type(screen.getByRole('textbox', { name: /Search/ }), 'anchor')
    expect(screen.getByRole('textbox', { name: /Search/ })).toHaveValue(
      'anchor'
    )

    unmount()
    renderApps()

    expect(screen.getByRole('textbox', { name: /Search/ })).toHaveValue(
      'anchor'
    )
  })
})
