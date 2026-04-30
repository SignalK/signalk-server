import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ScoreRing from './ScoreRing'

describe('ScoreRing', () => {
  it('renders nothing when score is undefined', () => {
    const { container } = render(<ScoreRing />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('renders an svg with the score text', () => {
    const { container } = render(<ScoreRing score={78} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.textContent).toContain('78')
  })

  it('exposes an aria label with the score', () => {
    const { container } = render(<ScoreRing score={42} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-label')).toContain('42 of 100')
  })

  it('clamps scores above 100', () => {
    const { container } = render(<ScoreRing score={150} />)
    const svg = container.querySelector('svg')
    expect(svg?.textContent).toContain('100')
  })

  it('clamps negative scores to 0', () => {
    const { container } = render(<ScoreRing score={-10} />)
    const svg = container.querySelector('svg')
    expect(svg?.textContent).toContain('0')
  })
})
