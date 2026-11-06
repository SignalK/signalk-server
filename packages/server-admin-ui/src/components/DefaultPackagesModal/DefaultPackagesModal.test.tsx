import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useStore } from '../../store'
import type { LoginStatus } from '../../store/types'
import DefaultPackagesModal from './DefaultPackagesModal'

const ADMIN: LoginStatus = {
  status: 'loggedIn',
  authenticationRequired: true,
  userLevel: 'admin'
}

describe('DefaultPackagesModal', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    window.serverRoutesPrefix = '/skServer'
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    useStore.setState({
      defaultPackages: null,
      installedPackagesNeedingRestart: [],
      loginStatus: {},
      restarting: false,
      restartRequired: false
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('shows nothing when there is nothing to report', () => {
    render(<DefaultPackagesModal />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lets an administrator restart the server', async () => {
    useStore.setState({
      installedPackagesNeedingRestart: ['@mxtommy/kip'],
      loginStatus: ADMIN
    })
    render(<DefaultPackagesModal />)
    expect(screen.getByText('@mxtommy/kip')).toBeDefined()
    await act(async () => {
      fireEvent.click(screen.getByText('Restart now'))
    })
    expect(fetchMock).toHaveBeenCalledWith('/skServer/restart', {
      credentials: 'include',
      method: 'PUT'
    })
    expect(useStore.getState().restarting).toBe(true)
    expect(useStore.getState().restartRequired).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows why a restart failed', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 })
    useStore.setState({
      installedPackagesNeedingRestart: ['@mxtommy/kip'],
      loginStatus: ADMIN
    })
    render(<DefaultPackagesModal />)
    await act(async () => {
      fireEvent.click(screen.getByText('Restart now'))
    })
    expect(screen.getByRole('alert').textContent).toBe('Restart failed (401).')
    expect(useStore.getState().restarting).toBe(false)
  })

  it('shows no other dialog while the server restarts', async () => {
    useStore.setState({
      installedPackagesNeedingRestart: ['@mxtommy/kip'],
      loginStatus: ADMIN,
      defaultPackages: {
        status: 'failed',
        packages: { '@signalk/freeboard-sk': '^3.2.1' }
      }
    })
    render(<DefaultPackagesModal />)
    await act(async () => {
      fireEvent.click(screen.getByText('Restart now'))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('tells how to restart when security is not enabled', () => {
    useStore.setState({
      installedPackagesNeedingRestart: ['@mxtommy/kip'],
      loginStatus: { authenticationRequired: false }
    })
    render(<DefaultPackagesModal />)
    expect(screen.queryByText('Restart now')).toBeNull()
    expect(
      screen.getByText(/Restart the Signal K service on the computer/)
    ).toBeDefined()
  })

  it('tells a user who may not restart how to do it', () => {
    useStore.setState({
      installedPackagesNeedingRestart: ['@mxtommy/kip'],
      loginStatus: { authenticationRequired: true, userLevel: 'readonly' }
    })
    render(<DefaultPackagesModal />)
    expect(screen.getByText('Restart required')).toBeDefined()
    expect(screen.queryByText('Restart now')).toBeNull()
    expect(screen.getByText(/Log in as an administrator/)).toBeDefined()
  })

  it('keeps the restart reminder after the modal is closed', () => {
    useStore.setState({
      installedPackagesNeedingRestart: ['@mxtommy/kip'],
      loginStatus: { authenticationRequired: false }
    })
    render(<DefaultPackagesModal />)
    fireEvent.click(screen.getByText('Later'))
    expect(useStore.getState().restartRequired).toBe(true)
  })

  it('installs only the offered packages the user picks', async () => {
    useStore.setState({
      loginStatus: ADMIN,
      defaultPackages: {
        status: 'offer',
        packages: {
          '@mxtommy/kip': '^4.8.0',
          '@signalk/freeboard-sk': '^3.2.1'
        }
      }
    })
    render(<DefaultPackagesModal />)
    expect(screen.getByText('Install selected')).toHaveProperty(
      'disabled',
      true
    )
    fireEvent.click(screen.getByLabelText('@signalk/freeboard-sk'))
    await act(async () => {
      fireEvent.click(screen.getByText('Install selected'))
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/skServer/appstore/defaultPackages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ install: ['@signalk/freeboard-sk'] })
      })
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('declines every offered package', async () => {
    useStore.setState({
      loginStatus: { authenticationRequired: false },
      defaultPackages: {
        status: 'offer',
        packages: { '@mxtommy/kip': '^4.8.0' }
      }
    })
    render(<DefaultPackagesModal />)
    await act(async () => {
      fireEvent.click(screen.getByText('Install none'))
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/skServer/appstore/defaultPackages',
      expect.objectContaining({ body: JSON.stringify({ install: [] }) })
    )
  })

  it('sends one choice however often it is clicked', async () => {
    let respond: (value: unknown) => void = () => {}
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        respond = resolve
      })
    )
    useStore.setState({
      loginStatus: { authenticationRequired: false },
      defaultPackages: {
        status: 'offer',
        packages: { '@mxtommy/kip': '^4.8.0' }
      }
    })
    render(<DefaultPackagesModal />)
    fireEvent.click(screen.getByText('Install none'))
    fireEvent.click(screen.getByText('Install none'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      respond({ ok: true, status: 200 })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays open while the choice is saved so that an error can be shown', async () => {
    let respond: (value: unknown) => void = () => {}
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        respond = resolve
      })
    )
    useStore.setState({
      loginStatus: { authenticationRequired: false },
      defaultPackages: {
        status: 'offer',
        packages: { '@mxtommy/kip': '^4.8.0' }
      }
    })
    render(<DefaultPackagesModal />)
    fireEvent.click(screen.getByText('Install none'))
    expect(screen.queryByLabelText('Close')).toBeNull()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await act(async () => {
      respond({ ok: false, status: 500 })
    })
    expect(screen.getByRole('alert').textContent).toContain('500')
  })

  it('shows a failed install together with the offer', () => {
    useStore.setState({
      loginStatus: ADMIN,
      defaultPackages: {
        status: 'offer',
        packages: { '@signalk/freeboard-sk': '^3.2.1' },
        failed: { '@mxtommy/kip': '^4.8.0' }
      }
    })
    render(<DefaultPackagesModal />)
    expect(screen.getByRole('alert').textContent).toContain(
      'Installing @mxtommy/kip failed'
    )
    expect(screen.getByLabelText('@signalk/freeboard-sk')).toBeDefined()
  })

  it('shows why saving the choice failed and lets the user try again', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    useStore.setState({
      loginStatus: { authenticationRequired: false },
      defaultPackages: {
        status: 'offer',
        packages: { '@mxtommy/kip': '^4.8.0' }
      }
    })
    render(<DefaultPackagesModal />)
    await act(async () => {
      fireEvent.click(screen.getByText('Install none'))
    })
    expect(screen.getByRole('alert').textContent).toContain('500')
    expect(screen.getByText('Install none')).toHaveProperty('disabled', false)
  })

  it('asks again later without recording a choice', () => {
    useStore.setState({
      loginStatus: { authenticationRequired: false },
      defaultPackages: {
        status: 'offer',
        packages: { '@mxtommy/kip': '^4.8.0' }
      }
    })
    render(<DefaultPackagesModal />)
    fireEvent.click(screen.getByText('Ask me later'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the install in progress', () => {
    useStore.setState({
      loginStatus: ADMIN,
      defaultPackages: {
        status: 'installing',
        packages: { '@mxtommy/kip': '^4.8.0' }
      }
    })
    render(<DefaultPackagesModal />)
    expect(screen.getByText('Installing apps')).toBeDefined()
    expect(screen.getByText(/Installing @mxtommy\/kip/)).toBeDefined()
  })

  it('hides the offer from a user who may not configure the server', () => {
    useStore.setState({
      loginStatus: { authenticationRequired: true, userLevel: 'readonly' },
      defaultPackages: {
        status: 'offer',
        packages: { '@mxtommy/kip': '^4.8.0' }
      }
    })
    render(<DefaultPackagesModal />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reports a failed install', () => {
    useStore.setState({
      loginStatus: { authenticationRequired: false },
      defaultPackages: {
        status: 'failed',
        packages: { '@mxtommy/kip': '^4.8.0' }
      }
    })
    render(<DefaultPackagesModal />)
    expect(screen.getByText('Installing apps failed')).toBeDefined()
  })

  it('keeps closed modals closed when a reconnect replays the same events', () => {
    const failed = {
      status: 'failed' as const,
      packages: { '@mxtommy/kip': '^4.8.0' }
    }
    useStore.setState({
      loginStatus: { authenticationRequired: false },
      installedPackagesNeedingRestart: ['@mxtommy/kip'],
      defaultPackages: failed
    })
    render(<DefaultPackagesModal />)
    fireEvent.click(screen.getByText('Later'))
    fireEvent.click(screen.getByText('Close'))
    act(() => {
      useStore.setState({
        installedPackagesNeedingRestart: ['@mxtommy/kip'],
        defaultPackages: structuredClone(failed)
      })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the same restart prompt again after the server restarted', () => {
    useStore.setState({
      loginStatus: ADMIN,
      installedPackagesNeedingRestart: ['@mxtommy/kip']
    })
    render(<DefaultPackagesModal />)
    fireEvent.click(screen.getByText('Later'))
    act(() => {
      useStore.setState({ installedPackagesNeedingRestart: [] })
    })
    act(() => {
      useStore.setState({ installedPackagesNeedingRestart: ['@mxtommy/kip'] })
    })
    expect(screen.getByText('Restart required')).toBeDefined()
  })
})
