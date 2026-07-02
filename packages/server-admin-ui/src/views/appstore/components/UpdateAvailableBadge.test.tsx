import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import UpdateAvailableBadge from './UpdateAvailableBadge'

describe('UpdateAvailableBadge', () => {
  it('renders nothing when there is no installed version', () => {
    render(<UpdateAvailableBadge newVersion="1.0.0" />)
    expect(screen.queryByText('UPDATE')).toBeNull()
  })

  it('renders nothing when there is no newer version', () => {
    render(<UpdateAvailableBadge installedVersion="1.0.0" />)
    expect(screen.queryByText('UPDATE')).toBeNull()
  })

  it('renders nothing when installed and latest are equal', () => {
    render(<UpdateAvailableBadge installedVersion="1.0.0" newVersion="1.0.0" />)
    expect(screen.queryByText('UPDATE')).toBeNull()
  })

  it('renders UPDATE when an update is available', () => {
    render(<UpdateAvailableBadge installedVersion="1.0.0" newVersion="1.1.0" />)
    expect(screen.getByText('UPDATE')).toBeInTheDocument()
  })
})
