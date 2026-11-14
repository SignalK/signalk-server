import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ROUTER_FUTURE_FLAGS } from '../../routerFuture'
import type { LoginStatus } from '../../store/types'
import Login from './Login'

const store = vi.hoisted(() => ({ loginStatus: {} as LoginStatus }))

vi.mock('../../store', () => ({
  useLoginStatus: () => store.loginStatus
}))
vi.mock('./EnableSecurity', () => ({
  default: () => <p>EnableSecurity</p>
}))

function renderLogin(loginStatus: LoginStatus) {
  store.loginStatus = loginStatus
  render(
    <MemoryRouter future={ROUTER_FUTURE_FLAGS}>
      <Login />
    </MemoryRouter>
  )
}

describe('Login', () => {
  it('shows the account setup when security is off', () => {
    renderLogin({ status: 'notLoggedIn', authenticationRequired: false })
    expect(screen.getByText('EnableSecurity')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Password')).toBeNull()
  })

  it('shows the sign-in form when security is on', () => {
    renderLogin({ status: 'notLoggedIn', authenticationRequired: true })
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    expect(screen.queryByText('EnableSecurity')).toBeNull()
  })
})
