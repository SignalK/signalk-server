import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RecencyBadge from './RecencyBadge'

describe('RecencyBadge', () => {
  it('renders nothing when recent is false or undefined', () => {
    render(<RecencyBadge />)
    expect(screen.queryByText('RECENT')).toBeNull()
  })

  it('renders RECENT when the package is recently published', () => {
    render(<RecencyBadge recent />)
    expect(screen.getByText('RECENT')).toBeInTheDocument()
  })
})
