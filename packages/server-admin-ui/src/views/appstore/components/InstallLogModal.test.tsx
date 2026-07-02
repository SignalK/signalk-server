import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InstallLogModal, { logFilename } from './InstallLogModal'

interface InstallLogPayload {
  name: string
  version?: string
  isRemove?: boolean
  code?: number
  log: string
}

function mockFetch(payload: InstallLogPayload | undefined, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(payload)
    } as Response)
  )
}

function renderModal(appName = 'signalk-example') {
  ;(window as unknown as { serverRoutesPrefix: string }).serverRoutesPrefix =
    '/signalk/v1'
  return render(
    <InstallLogModal appName={appName} show={true} onClose={() => undefined} />
  )
}

let originalServerRoutesPrefix: string | undefined

beforeEach(() => {
  vi.restoreAllMocks()
  originalServerRoutesPrefix = (
    window as unknown as { serverRoutesPrefix?: string }
  ).serverRoutesPrefix
})

afterEach(() => {
  vi.unstubAllGlobals()
  ;(window as unknown as { serverRoutesPrefix?: string }).serverRoutesPrefix =
    originalServerRoutesPrefix
})

describe('InstallLogModal', () => {
  it('fetches and renders the log', async () => {
    mockFetch({
      name: 'signalk-example',
      code: 1,
      log: 'npm ERR! gyp failed'
    })
    renderModal()
    await waitFor(() => {
      expect(screen.getByText('npm ERR! gyp failed')).toBeDefined()
    })
    expect(screen.getByText('npm exited with code 1')).toBeDefined()
    expect(fetch).toHaveBeenCalledWith(
      '/signalk/v1/appstore/installLog/signalk-example',
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('titles the modal as a remove log for removals', async () => {
    mockFetch({ name: 'signalk-example', isRemove: true, code: 1, log: 'x' })
    renderModal()
    await waitFor(() => {
      expect(screen.getByText(/Remove log/)).toBeDefined()
    })
  })

  it('explains that logs do not survive a restart on 404', async () => {
    mockFetch(undefined, 404)
    renderModal()
    await waitFor(() => {
      expect(screen.getByText(/lost when the server restarts/)).toBeDefined()
    })
  })

  it('copies the log via the execCommand fallback on http', async () => {
    mockFetch({ name: 'signalk-example', code: 1, log: 'some npm output' })
    // jsdom has neither navigator.clipboard nor a secure context, so
    // this exercises the textarea + execCommand path used on plain http.
    document.execCommand = vi.fn().mockReturnValue(true)
    renderModal()
    await waitFor(() => {
      expect(screen.getByText('some npm output')).toBeDefined()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Copy log' }))
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeDefined()
    })
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('shows a manual-copy hint when copying fails', async () => {
    mockFetch({ name: 'signalk-example', code: 1, log: 'some npm output' })
    document.execCommand = vi.fn().mockReturnValue(false)
    renderModal()
    await waitFor(() => {
      expect(screen.getByText('some npm output')).toBeDefined()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Copy log' }))
    await waitFor(() => {
      expect(
        screen.getByText(/select the text and copy manually/)
      ).toBeDefined()
    })
  })

  it('shows a generic error message for non-404 failures', async () => {
    mockFetch(undefined, 500)
    renderModal()
    await waitFor(() => {
      expect(screen.getByText(/Failed to load the log \(500\)/)).toBeDefined()
    })
  })

  it('calls onClose when the close button is clicked', async () => {
    mockFetch({ name: 'signalk-example', code: 1, log: 'output' })
    ;(window as unknown as { serverRoutesPrefix: string }).serverRoutesPrefix =
      '/signalk/v1'
    const onClose = vi.fn()
    render(
      <InstallLogModal
        appName="signalk-example"
        show={true}
        onClose={onClose}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('output')).toBeDefined()
    })
    // getByText targets the footer button; the header X also has the
    // accessible name "Close" but no text content.
    await userEvent.click(screen.getByText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('downloads the log as a file', async () => {
    mockFetch({ name: 'signalk-example', code: 1, log: 'output' })
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    renderModal()
    await waitFor(() => {
      expect(screen.getByText('output')).toBeDefined()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(createObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('disables copy and download while loading and on empty logs', async () => {
    mockFetch({ name: 'signalk-example', code: 1, log: '' })
    renderModal()
    await waitFor(() => {
      expect(screen.getByText('No output was captured.')).toBeDefined()
    })
    expect(
      (screen.getByRole('button', { name: 'Copy log' }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
  })
})

describe('logFilename', () => {
  it('flattens scoped package names', () => {
    expect(logFilename('@signalk/charts-plugin')).toBe(
      'npm-_signalk_charts-plugin.log'
    )
    expect(logFilename('signalk-example')).toBe('npm-signalk-example.log')
  })
})
