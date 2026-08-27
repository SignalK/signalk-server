import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ActionCellRenderer, {
  formatBytes,
  type AppData
} from './ActionCellRenderer'

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(10240)).toBe('10.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB')
    expect(formatBytes(2621440)).toBe('2.5 MB')
    expect(formatBytes(10485760)).toBe('10.0 MB')
  })

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB')
    expect(formatBytes(2684354560)).toBe('2.5 GB')
  })
})

describe('ActionCellRenderer terminal install status', () => {
  function renderAction(data: Omit<AppData, 'name'>) {
    return render(
      <MemoryRouter>
        <ActionCellRenderer data={{ name: 'signalk-example', ...data }} />
      </MemoryRouter>
    )
  }

  it('names the version an update landed on', () => {
    renderAction({
      installing: true,
      installedVersion: '1.0.0',
      pendingVersion: '2.0.0'
    })
    expect(screen.getByText('Updated v2.0.0')).toBeDefined()
  })

  it('names the version a first install landed on', () => {
    renderAction({ installing: true, pendingVersion: '2.0.0' })
    expect(screen.getByText('Installed v2.0.0')).toBeDefined()
  })

  it('falls back to a bare verb when no version is known', () => {
    renderAction({ installing: true, installedVersion: '1.0.0' })
    expect(screen.getByText('Updated')).toBeDefined()
  })

  it('reports a failure rather than a version', () => {
    renderAction({
      installing: true,
      installedVersion: '1.0.0',
      pendingVersion: '2.0.0',
      installFailed: true
    })
    expect(screen.getByText(/Failed/)).toBeDefined()
    expect(screen.queryByText(/Updated v/)).toBeNull()
  })
})
