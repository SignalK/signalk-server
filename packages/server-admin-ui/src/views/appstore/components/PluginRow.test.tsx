import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PluginRow from './PluginRow'
import type { AppInfo } from '../../../store/types'

function renderRow(app: Partial<AppInfo>) {
  const merged: AppInfo = {
    name: 'signalk-example',
    version: '1.0.0',
    description: 'A plugin',
    ...app
  }
  return render(
    <MemoryRouter>
      <PluginRow app={merged} />
    </MemoryRouter>
  )
}

describe('PluginRow version label', () => {
  it('shows the just-installed version while a restart is pending', () => {
    renderRow({
      installedVersion: '1.0.0',
      pendingVersion: '2.0.0',
      installing: true
    })
    expect(screen.getByText('v2.0.0')).toBeDefined()
    expect(screen.queryByText('v1.0.0')).toBeNull()
  })

  it('keeps the running version while the install is still in flight', () => {
    renderRow({
      installedVersion: '1.0.0',
      pendingVersion: '2.0.0',
      installing: true,
      isInstalling: true
    })
    expect(screen.getByText('v1.0.0')).toBeDefined()
    expect(screen.queryByText('v2.0.0')).toBeNull()
  })

  it('keeps the running version while the install is queued', () => {
    renderRow({
      installedVersion: '1.0.0',
      pendingVersion: '2.0.0',
      installing: true,
      isWaiting: true
    })
    expect(screen.getByText('v1.0.0')).toBeDefined()
    expect(screen.queryByText('v2.0.0')).toBeNull()
  })

  it('does not present a failed install as the current version', () => {
    renderRow({
      installedVersion: '1.0.0',
      pendingVersion: '2.0.0',
      installing: true,
      installFailed: true
    })
    expect(screen.getByText('v1.0.0')).toBeDefined()
    expect(screen.queryByText('v2.0.0')).toBeNull()
  })

  it('shows the removed version rather than a pending one', () => {
    renderRow({
      installedVersion: '1.0.0',
      pendingVersion: '1.0.0',
      installing: true,
      isRemove: true
    })
    expect(screen.getByText('v1.0.0')).toBeDefined()
  })

  it('shows the upgrade arrow when an update is merely available', () => {
    renderRow({ installedVersion: '1.0.0', newVersion: '2.0.0' })
    expect(screen.getByText('v1.0.0 → v2.0.0')).toBeDefined()
  })

  it('falls back to the available version when nothing is installed', () => {
    renderRow({})
    expect(screen.getByText('v1.0.0')).toBeDefined()
  })
})
