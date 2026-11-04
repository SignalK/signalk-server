import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { getValueRenderer } from './ValueRenderers'
import type { MetaData } from '../../store'

const ratioRenderer = () => {
  const Renderer = getValueRenderer('tanks.fuel.main.currentLevel', {
    units: 'ratio'
  } as MetaData)
  if (!Renderer) {
    throw new Error('expected a renderer for ratio units')
  }
  return Renderer
}

describe('ratio value renderer', () => {
  it('renders a number as a percentage', () => {
    const Renderer = ratioRenderer()
    render(<Renderer value={0.42} />)
    expect(screen.getByText('42.00%')).toBeTruthy()
  })

  it('renders null as null, not 0.00%', () => {
    const Renderer = ratioRenderer()
    const { container } = render(<Renderer value={null} />)
    expect(container.textContent).toBe('null')
    expect(container.querySelector('meter')).toBeNull()
  })
})
