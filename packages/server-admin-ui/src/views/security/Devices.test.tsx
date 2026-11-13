import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Devices from './Devices'
import { useStore } from '../../store'

vi.mock('../../hooks/useWebSocket', () => ({
  useServerEvent: vi.fn()
}))

const LOGGED_IN = {
  status: 'loggedIn',
  authenticationRequired: true,
  username: 'admin',
  userLevel: 'admin'
}

describe('Devices', () => {
  let alertSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    window.serverRoutesPrefix = '/skServer'
    useStore.setState({
      loginStatus: { ...useStore.getState().loginStatus, ...LOGGED_IN }
    })
    alertSpy = vi.fn()
    vi.stubGlobal('alert', alertSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends one create request while the first is pending', async () => {
    let finishCreate: (value: unknown) => void = () => {}
    const posts: RequestInit[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          posts.push(init)
          return new Promise((resolve) => {
            finishCreate = resolve
          })
        }
        return { ok: true, json: async () => [] }
      })
    )
    render(<Devices />)
    fireEvent.click(screen.getByRole('button', { name: /add device/i }))
    fireEvent.change(screen.getByPlaceholderText(/iPad Helm/), {
      target: { value: 'Helm display' }
    })
    const create = screen.getByRole('button', { name: 'Create Device' })
    fireEvent.click(create)
    fireEvent.click(create)
    await waitFor(() => expect(create).toBeDisabled())
    expect(posts).toHaveLength(1)

    finishCreate({
      ok: true,
      json: async () => ({ clientId: 'c1', token: 't1' })
    })
    await waitFor(() =>
      expect(screen.getByText('Device Created')).toBeInTheDocument()
    )
  })

  it('tells the administrator when the device list cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    render(<Devices />)
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Loading the devices failed: Failed to fetch'
      )
    )
  })
})
