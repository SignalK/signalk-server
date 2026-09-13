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
    units: 'm/s'
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

  it('leaves a periodic path unmarked', async () => {
    renderReference()
    await waitFor(() => {
      expect(screen.getByText('Speed over ground')).to.not.equal(null)
    })

    expect(screen.queryAllByText('event')).to.have.lengthOf(1)
  })
})
