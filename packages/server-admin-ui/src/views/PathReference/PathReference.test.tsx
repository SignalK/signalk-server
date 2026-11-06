import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import PathReference from './PathReference'

const PATHS = {
  '/vessels/*/navigation/anchor/position': {
    description: 'Anchor position',
    updateContract: 'event'
  },
  '/vessels/*/navigation/speedOverGround': {
    description: 'Speed over ground',
    units: 'm/s',
    updateContract: 'periodic'
  },
  '/vessels/*/electrical/batteries/RegExp': {
    description: 'Battery shape'
  }
}

const renderReference = (
  staleness?: Record<string, unknown>,
  paths: Record<string, unknown> = PATHS
) => {
  vi.stubGlobal('serverRoutesPrefix', '/skServer')
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith('/settings')
          ? staleness
            ? { ok: true, json: async () => ({ staleness }) }
            : { ok: false, status: 401, json: async () => ({}) }
          : { ok: true, json: async () => paths }
      )
    )
  )
  return render(<PathReference />)
}

const timeoutCell = (description: string) =>
  screen.getByText(description).closest('tr')!.querySelectorAll('td')[3]!

describe('PathReference update contracts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('marks an event-driven path so its absence of updates reads as intended', async () => {
    renderReference()
    await waitFor(() => {
      expect(screen.getByText('Anchor position')).to.not.equal(null)
    })

    const badge = screen.getByText('event')
    expect(badge).to.not.equal(null)
    expect(badge.getAttribute('title')).to.contain('never marked stale')
  })

  it('labels a path declared periodic as periodic', async () => {
    renderReference()
    await waitFor(() => {
      expect(screen.getByText('Speed over ground')).to.not.equal(null)
    })

    expect(screen.queryAllByText('event')).to.have.lengthOf(1)
    expect(screen.queryAllByText('periodic')).to.have.lengthOf(1)
  })

  it('marks an entry with no contract as not applicable', async () => {
    // Container shapes and registry scaffolding are not paths that update,
    // so they must not be shown as periodic.
    renderReference()
    await waitFor(() => {
      expect(screen.getByText('Battery shape')).to.not.equal(null)
    })

    expect(screen.queryAllByText('periodic')).to.have.lengthOf(1)
    expect(screen.queryAllByTitle(/Not a path that updates/)).to.have.lengthOf(
      1
    )
  })

  it('links to the stale data detection documentation', async () => {
    renderReference()
    await waitFor(() => {
      expect(screen.getByText('Anchor position')).to.not.equal(null)
    })

    const link = screen.getByRole('link', { name: 'About update contracts' })
    expect(link.getAttribute('href')).to.contain('Stale_Data_Detection')
  })
})

describe('PathReference timeouts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the configured global fallback for a periodic path', async () => {
    renderReference({
      enforceDataTimeouts: true,
      useDefaultTimeouts: true,
      defaultTimeout: 120
    })
    await waitFor(() => {
      expect(timeoutCell('Speed over ground').textContent).to.equal(
        '120 s (global fallback)'
      )
    })
  })

  it('uses the server default when no fallback is configured', async () => {
    renderReference({ enforceDataTimeouts: true })
    await waitFor(() => {
      expect(timeoutCell('Speed over ground').textContent).to.equal(
        '60 s (global fallback)'
      )
    })
  })

  it('shows a timeout defined for the path instead of the fallback', async () => {
    renderReference(
      { enforceDataTimeouts: true, defaultTimeout: 120 },
      {
        '/vessels/*/navigation/state': {
          description: 'Navigation state',
          updateContract: 'periodic',
          timeout: 900
        }
      }
    )
    await waitFor(() => {
      expect(timeoutCell('Navigation state').textContent).to.equal('900 s')
    })
  })

  it('shows no fallback when default timeouts are off', async () => {
    renderReference({ enforceDataTimeouts: true, useDefaultTimeouts: false })
    await waitFor(() => {
      expect(timeoutCell('Speed over ground').textContent).to.equal('none')
    })
  })

  it('never times out an event-driven path', async () => {
    renderReference({ enforceDataTimeouts: true })
    await waitFor(() => {
      expect(timeoutCell('Anchor position').textContent).to.equal('never')
    })
  })

  it('names the fallback without a value when settings are not readable', async () => {
    renderReference()
    await waitFor(() => {
      expect(timeoutCell('Speed over ground').textContent).to.equal(
        'global fallback'
      )
    })
  })

  it('says when stale data detection is off', async () => {
    renderReference({ enforceDataTimeouts: false })
    await waitFor(() => {
      expect(screen.getByText(/Stale data detection is off/)).to.not.equal(null)
    })
  })
})
