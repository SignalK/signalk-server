import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DetailView from './DetailView'

interface DetailPayload {
  name: string
  version: string
  displayName?: string
  screenshots: string[]
  official: boolean
  deprecated: boolean
  readme: string
  changelog: string
  requires: Array<{ name: string; installed: boolean; displayName?: string }>
  recommends: Array<{ name: string; installed: boolean; displayName?: string }>
  readmeFormat: 'markdown'
  changelogFormat: 'markdown' | 'synthesized'
  fetchedAt: number
  indicators?: {
    score: number
    checks: never[]
    rawMetrics: object
  }
}

function samplePayload(overrides: Partial<DetailPayload> = {}): DetailPayload {
  return {
    name: 'signalk-example',
    version: '1.2.3',
    displayName: 'Example Plugin',
    screenshots: [],
    official: false,
    deprecated: false,
    readme: '# Example\n\nHello.',
    changelog: '',
    requires: [],
    recommends: [],
    readmeFormat: 'markdown',
    changelogFormat: 'markdown',
    fetchedAt: Date.now(),
    ...overrides
  }
}

function mockFetch(payload: DetailPayload, status = 200) {
  // vi.stubGlobal lets vitest restore globalThis.fetch automatically
  // after the test suite, so test files don't leak a fetch mock to
  // unrelated suites that share the worker.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(payload)
    } as Response)
  )
}

function renderDetail(name: string) {
  ;(window as unknown as { serverRoutesPrefix: string }).serverRoutesPrefix =
    '/signalk/v1'
  return render(
    <MemoryRouter
      initialEntries={[`/apps/store/plugin/${encodeURIComponent(name)}`]}
    >
      <Routes>
        <Route path="/apps/store/plugin/:name" element={<DetailView />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  // Restore globalThis.fetch (and any other globals stubbed via
  // vi.stubGlobal) so unrelated tests in the same worker don't see
  // a leftover mock.
  vi.unstubAllGlobals()
})

describe('DetailView', () => {
  it('renders display name when loaded', async () => {
    mockFetch(samplePayload())
    renderDetail('signalk-example')
    await waitFor(() => {
      expect(screen.getByText('Example Plugin')).toBeDefined()
    })
  })

  it('renders OFFICIAL badge when official', async () => {
    mockFetch(samplePayload({ official: true }))
    renderDetail('signalk-example')
    await waitFor(() => {
      expect(screen.getByText('OFFICIAL')).toBeDefined()
    })
  })

  it('renders deprecated banner text when deprecated', async () => {
    mockFetch(samplePayload({ deprecated: true }))
    renderDetail('signalk-example')
    await waitFor(() => {
      expect(screen.getByText(/plugin is deprecated/i)).toBeDefined()
    })
  })

  it('shows Install required plugins CTA when missing deps exist', async () => {
    mockFetch(
      samplePayload({
        requires: [
          { name: 'signalk-charts-plugin', installed: false },
          { name: 'dep2', installed: false }
        ]
      })
    )
    renderDetail('signalk-example')
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Install required plugins/ })
      ).toBeDefined()
    })
  })

  it('does not show bulk CTA when all required deps already installed', async () => {
    mockFetch(
      samplePayload({
        requires: [{ name: 'dep1', installed: true }]
      })
    )
    renderDetail('signalk-example')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Install' })).toBeDefined()
    })
    expect(
      screen.queryByRole('button', { name: /Install required plugins/ })
    ).toBeNull()
  })

  it('renders hero screenshot when screenshots provided', async () => {
    mockFetch(
      samplePayload({
        screenshots: [
          'https://example.com/s1.png',
          'https://example.com/s2.png'
        ]
      })
    )
    renderDetail('signalk-example')
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Open screenshot viewer' })
      ).toBeDefined()
      expect(screen.getByText(/1 more in README tab/)).toBeDefined()
    })
  })

  it('displays an offline error when /plugin/:name returns 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () =>
          Promise.resolve({ error: 'Plugin details not available offline.' })
      } as Response)
    )
    renderDetail('signalk-example')
    await waitFor(() => {
      expect(
        screen.getByText(/Plugin details not available offline/)
      ).toBeDefined()
    })
  })
})
