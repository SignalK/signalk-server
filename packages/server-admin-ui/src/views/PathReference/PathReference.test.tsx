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

const renderReference = () => {
  vi.stubGlobal('serverRoutesPrefix', '/skServer')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => PATHS })
  )
  return render(<PathReference />)
}

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

  it('labels a path with no declared contract as periodic', async () => {
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
