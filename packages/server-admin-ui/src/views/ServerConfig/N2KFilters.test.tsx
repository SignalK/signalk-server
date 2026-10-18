import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import N2KFilters from './N2KFilters'

const APPLY = 'Filter CAN messages at Linux kernel level'

function renderFilters(
  canFilterInKernel: boolean,
  options: Record<string, unknown> = {},
  onChange = vi.fn()
) {
  render(
    <N2KFilters
      value={{
        options: {
          filtersEnabled: true,
          filters: [{ source: '', pgn: '127251' }],
          ...options
        }
      }}
      onChange={onChange}
      canFilterInKernel={canFilterInKernel}
    />
  )
  return onChange
}

function changedTarget(name: string, value: unknown) {
  return expect.objectContaining({
    target: expect.objectContaining({ name, value })
  })
}

describe('N2KFilters drop in the kernel', () => {
  it('is offered, off, on a connection that can do it', () => {
    renderFilters(true)
    expect(screen.getByRole('checkbox', { name: APPLY })).toHaveProperty(
      'checked',
      false
    )
  })

  it('is not offered on other connections', () => {
    renderFilters(false)
    expect(screen.queryByRole('checkbox', { name: APPLY })).toBeNull()
  })

  it('shows the saved setting', () => {
    renderFilters(true, { filtersInKernel: true })
    expect(screen.getByRole('checkbox', { name: APPLY })).toHaveProperty(
      'checked',
      true
    )
  })

  it('reports filtersInKernel when switched on', () => {
    const onChange = renderFilters(true)
    fireEvent.click(screen.getByRole('checkbox', { name: APPLY }))
    expect(onChange).toHaveBeenLastCalledWith(
      changedTarget('options.filtersInKernel', true)
    )
  })

  it('reports filtersInKernel when switched off', () => {
    const onChange = renderFilters(true, { filtersInKernel: true })
    fireEvent.click(screen.getByRole('checkbox', { name: APPLY }))
    expect(onChange).toHaveBeenLastCalledWith(
      changedTarget('options.filtersInKernel', false)
    )
  })

  it('still reports filtersEnabled from its own switch', () => {
    const onChange = renderFilters(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Filters enabled' }))
    expect(onChange).toHaveBeenLastCalledWith(
      changedTarget('options.filtersEnabled', false)
    )
  })

  it('can only be switched while the filters are enabled', () => {
    renderFilters(true, { filtersEnabled: false })
    expect(screen.getByRole('checkbox', { name: APPLY })).toHaveProperty(
      'disabled',
      true
    )
  })

  it('explains the switch to screen readers', () => {
    renderFilters(true)
    const input = screen.getByRole('checkbox', { name: APPLY })
    const help = document.getElementById(
      input.getAttribute('aria-describedby') ?? ''
    )
    expect(help?.textContent).toMatch(/Signal K never reads those messages/)
  })
})
