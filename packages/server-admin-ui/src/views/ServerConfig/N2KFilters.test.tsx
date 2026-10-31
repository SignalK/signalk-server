import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import N2KFilters from './N2KFilters'

const APPLY = 'Drop filtered PGNs before decoding'

function renderFilters(
  canDropBeforeDecoding: boolean,
  options: Record<string, unknown> = {},
  onChange = vi.fn(),
  dropsInKernel = false
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
      canDropBeforeDecoding={canDropBeforeDecoding}
      dropsInKernel={dropsInKernel}
    />
  )
  return onChange
}

function changedTarget(name: string, value: unknown) {
  return expect.objectContaining({
    target: expect.objectContaining({ name, value })
  })
}

describe('N2KFilters drop before decoding', () => {
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
    renderFilters(true, { filtersBeforeDecoding: true })
    expect(screen.getByRole('checkbox', { name: APPLY })).toHaveProperty(
      'checked',
      true
    )
  })

  it('reports filtersBeforeDecoding when switched on', () => {
    const onChange = renderFilters(true)
    fireEvent.click(screen.getByRole('checkbox', { name: APPLY }))
    expect(onChange).toHaveBeenLastCalledWith(
      changedTarget('options.filtersBeforeDecoding', true)
    )
  })

  it('reports filtersBeforeDecoding when switched off', () => {
    const onChange = renderFilters(true, { filtersBeforeDecoding: true })
    fireEvent.click(screen.getByRole('checkbox', { name: APPLY }))
    expect(onChange).toHaveBeenLastCalledWith(
      changedTarget('options.filtersBeforeDecoding', false)
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
    expect(help().textContent).toMatch(/before Signal K decodes the message\./)
    expect(help().textContent).not.toMatch(/kernel/)
  })

  it('says the kernel drops them on a SocketCAN connection', () => {
    renderFilters(true, {}, vi.fn(), true)
    expect(help().textContent).toMatch(
      /at Linux kernel level, so Signal K never reads those messages/
    )
  })
})

function help() {
  const input = screen.getByRole('checkbox', { name: APPLY })
  const el = document.getElementById(
    input.getAttribute('aria-describedby') ?? ''
  )
  if (!el) {
    throw new Error('no help text')
  }
  return el
}
