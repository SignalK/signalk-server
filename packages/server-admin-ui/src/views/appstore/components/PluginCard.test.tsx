import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PluginCard from './PluginCard'
import type { AppInfo } from '../../../store/types'

function renderCard(app: Partial<AppInfo>) {
  const merged: AppInfo = {
    name: 'signalk-example',
    version: '1.0.0',
    description: 'A plugin',
    author: 'Jane',
    ...app
  }
  return render(
    <MemoryRouter>
      <PluginCard app={merged} />
    </MemoryRouter>
  )
}

describe('PluginCard', () => {
  it('renders plugin name when displayName missing', () => {
    renderCard({})
    expect(screen.getByText('signalk-example')).toBeDefined()
  })

  it('prefers displayName when present', () => {
    renderCard({ displayName: 'Example Plugin' })
    expect(screen.getByText('Example Plugin')).toBeDefined()
  })

  it('renders OFFICIAL badge when official', () => {
    renderCard({ official: true })
    expect(screen.getByText('OFFICIAL')).toBeDefined()
  })

  it('hides DEPRECATED badge on non-installed deprecated plugins', () => {
    renderCard({ deprecated: true })
    expect(screen.queryByText('DEPRECATED')).toBeNull()
  })

  it('shows DEPRECATED badge when deprecated and installed', () => {
    renderCard({ deprecated: true, installedVersion: '1.0.0' })
    expect(screen.getByText('DEPRECATED')).toBeDefined()
  })

  it('links to detail page', () => {
    renderCard({})
    // Pick the title link by its accessible name so a future markup
    // tweak (e.g. moving the icon link before/after the title) doesn't
    // silently make the assertion target the wrong link.
    const link = screen.getByRole('link', { name: 'signalk-example' })
    expect(link.getAttribute('href')).toContain(
      '/apps/store/plugin/signalk-example'
    )
  })

  it('renders without crashing when every optional field is missing', () => {
    renderCard({ description: undefined, author: undefined })
    expect(screen.getByText('signalk-example')).toBeDefined()
  })

  it('renders categories as badges', () => {
    renderCard({ categories: ['Weather', 'Utility'] })
    expect(screen.getByText('Weather')).toBeDefined()
    expect(screen.getByText('Utility')).toBeDefined()
  })
})
