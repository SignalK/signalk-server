import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DeprecatedToggle from './DeprecatedToggle'

describe('DeprecatedToggle', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(
      <DeprecatedToggle count={0} enabled={false} onChange={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders singular label for count of 1', () => {
    render(<DeprecatedToggle count={1} enabled={false} onChange={() => {}} />)
    expect(screen.getByText(/1 deprecated plugin\b/)).toBeDefined()
  })

  it('renders plural label for counts >1', () => {
    render(<DeprecatedToggle count={3} enabled={false} onChange={() => {}} />)
    expect(screen.getByText(/3 deprecated plugins/)).toBeDefined()
  })

  it('includes the always-shown disclaimer', () => {
    render(<DeprecatedToggle count={2} enabled={false} onChange={() => {}} />)
    expect(
      screen.getByText(/already-installed deprecated plugins are always shown/)
    ).toBeDefined()
  })

  it('calls onChange when toggled', () => {
    const onChange = vi.fn()
    render(<DeprecatedToggle count={2} enabled={false} onChange={onChange} />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
