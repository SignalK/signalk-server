import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useStore } from '../../store'
import { restartAction } from '../../actions'
import RestartDialog from './RestartDialog'

function mockServer(restoreOwnData: boolean) {
  const fetchMock = vi.fn((url: string, _init?: RequestInit) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          url.endsWith('/settings')
            ? { options: { restoreOwnData } }
            : 'Restarting...'
        ),
        { status: 200 }
      )
    )
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function restartRequests(fetchMock: ReturnType<typeof mockServer>) {
  return fetchMock.mock.calls
    .filter(([url]) => url.endsWith('/restart'))
    .map(([, init]) => JSON.parse(init?.body as string))
}

describe('RestartDialog', () => {
  beforeEach(() => {
    window.serverRoutesPrefix = '/skServer'
    useStore.setState({ restartDialog: null, restarting: false })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers to restart with or without data when data is kept', async () => {
    const fetchMock = mockServer(true)
    render(<RestartDialog />)
    await restartAction()

    fireEvent.click(await screen.findByText('Restart with no data'))
    await waitFor(() => expect(useStore.getState().restarting).toBe(true))
    expect(restartRequests(fetchMock)).toEqual([{ keepData: false }])
    expect(useStore.getState().restartDialog).toBeNull()
  })

  it('keeps data with the default choice', async () => {
    const fetchMock = mockServer(true)
    render(<RestartDialog />)
    await restartAction()

    fireEvent.click(await screen.findByText('Restart, keep data'))
    await waitFor(() =>
      expect(restartRequests(fetchMock)).toEqual([{ keepData: true }])
    )
  })

  it('offers both choices when the setting cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 })))
    )
    render(<RestartDialog />)
    await restartAction()

    expect(
      await screen.findByRole('button', { name: 'Restart with no data' })
    ).toBeDefined()
    expect(
      screen.getByRole('button', { name: 'Restart, keep data' })
    ).toBeDefined()
  })

  it('names the dialog by its title', async () => {
    mockServer(true)
    render(<RestartDialog />)
    await restartAction()

    expect(
      await screen.findByRole('dialog', { name: 'Restart server' })
    ).toBeDefined()
  })

  it('asks a plain question when data is not kept', async () => {
    const fetchMock = mockServer(false)
    render(<RestartDialog />)
    await restartAction()

    expect(
      await screen.findByText('Are you sure you want to restart?')
    ).toBeDefined()
    expect(screen.queryByText('Restart with no data')).toBeNull()
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => expect(useStore.getState().restartDialog).toBeNull())
    expect(restartRequests(fetchMock)).toEqual([])
  })
})
