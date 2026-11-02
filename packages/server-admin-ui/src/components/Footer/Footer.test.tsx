import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ROUTER_FUTURE_FLAGS } from '../../routerFuture'
import type { NodeInfo } from '../../store/types'
import Footer from './Footer'

const nodeInfo: { current: NodeInfo } = { current: {} }

vi.mock('../../store', () => ({
  useLoginStatus: () => ({ status: 'notLoggedIn' }),
  useAppStore: () => ({}),
  useVesselInfo: () => ({}),
  useServerSpecification: () => ({}),
  useNodeInfo: () => nodeInfo.current
}))

function renderFooter(info: NodeInfo) {
  nodeInfo.current = info
  return render(
    <MemoryRouter future={ROUTER_FUTURE_FLAGS}>
      <Footer />
    </MemoryRouter>
  )
}

describe('Footer', () => {
  it('shows no warning on a tested Node version newer than the recommended one', () => {
    renderFooter({
      nodeVersion: 'v26.12.1',
      npmVersion: '11.6.0',
      recommendedNodeVersion: '24',
      testedNodeVersions: [24, 26]
    })
    expect(screen.queryByText(/recommended/)).toBeNull()
  })

  it('warns on an untested Node version', () => {
    renderFooter({
      nodeVersion: 'v27.0.0',
      npmVersion: '11.6.0',
      recommendedNodeVersion: '24',
      testedNodeVersions: [24, 26]
    })
    expect(screen.getByText('node 24 recommended')).toBeDefined()
  })

  it('shows the pnpm version next to node and npm', () => {
    const { container } = renderFooter({
      nodeVersion: 'v24.1.0',
      npmVersion: '11.4.0',
      pnpmVersion: '11.28.3'
    })
    expect(container.textContent).toContain(
      'node 24.1.0 · npm 11.4.0 · pnpm 11.28.3'
    )
  })

  it('leaves pnpm out when it is not installed', () => {
    const { container } = renderFooter({
      nodeVersion: 'v24.1.0',
      npmVersion: '11.4.0'
    })
    expect(container.textContent).toContain('npm 11.4.0')
    expect(container.textContent).not.toContain('pnpm')
  })
})
