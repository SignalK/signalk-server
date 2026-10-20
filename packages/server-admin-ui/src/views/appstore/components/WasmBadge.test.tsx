import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WasmBadge from './WasmBadge'

describe('WasmBadge', () => {
  it('renders nothing for a non-WASM package', () => {
    render(<WasmBadge />)
    expect(screen.queryByText('WASM')).toBeNull()
  })

  it('renders WASM for a WASM plugin', () => {
    render(<WasmBadge isWasm />)
    expect(screen.getByText('WASM')).toBeInTheDocument()
  })
})
