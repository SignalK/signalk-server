import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import type { LoginStatus } from '../../store/types'
import Header from './Header'

const store = vi.hoisted(() => ({ loginStatus: {} as LoginStatus }))

vi.mock('../../store', () => ({
  useLoginStatus: () => store.loginStatus,
  useRestarting: () => false,
  useRestartRequired: () => false,
  useBackpressureWarning: () => false
}))

// Opens the mobile dropdown too, so both the desktop and the mobile items
// render; the menu positions itself after the click, hence act
async function renderHeader(loginStatus: LoginStatus) {
  store.loginStatus = loginStatus
  const { container } = render(<Header />)
  await act(async () => {
    fireEvent.click(container.querySelector('.dropdown-toggle')!)
  })
}

describe('Header', () => {
  it('links to the account setup when security is off', async () => {
    await renderHeader({ status: 'notLoggedIn', authenticationRequired: false })
    const items = screen.getAllByText('Enable Security')
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item.closest('a')).toHaveAttribute('href', '#/login')
    }
  })

  it('shows Login when security is on', async () => {
    await renderHeader({ status: 'notLoggedIn', authenticationRequired: true })
    expect(screen.getAllByText('Login')).toHaveLength(2)
    expect(screen.queryByText('Enable Security')).toBeNull()
  })

  it('shows neither while the login status is loading', async () => {
    await renderHeader({})
    expect(screen.queryByText('Enable Security')).toBeNull()
    expect(screen.queryByText('Login')).toBeNull()
  })
})
