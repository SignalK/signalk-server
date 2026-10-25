import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ROUTER_FUTURE_FLAGS } from '../../routerFuture'
import Footer from './Footer'

const nodeInfo = vi.hoisted(() => ({
  nodeVersion: 'v24.11.0',
  npmVersion: '11.6.0',
  recommendedNodeVersion: '24',
  testedNodeVersions: [24, 26]
}))

vi.mock('../../store', () => ({
  useLoginStatus: () => ({}),
  useAppStore: () => ({}),
  useVesselInfo: () => ({}),
  useServerSpecification: () => ({}),
  useNodeInfo: () => nodeInfo
}))

function renderFooter(nodeVersion: string) {
  nodeInfo.nodeVersion = nodeVersion
  return render(
    <MemoryRouter future={ROUTER_FUTURE_FLAGS}>
      <Footer />
    </MemoryRouter>
  )
}

describe('Footer', () => {
  it('shows no warning on a tested Node version newer than the recommended one', () => {
    renderFooter('v26.12.1')
    expect(screen.queryByText(/recommended/)).toBeNull()
  })

  it('warns on an untested Node version', () => {
    renderFooter('v27.0.0')
    expect(screen.getByText('node 24 recommended')).toBeDefined()
  })
})
