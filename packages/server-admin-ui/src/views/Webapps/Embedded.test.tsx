import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ROUTER_FUTURE_FLAGS } from '../../routerFuture'
import Embedded from './Embedded'

vi.mock('../../store', () => ({
  useLoginStatus: () => ({})
}))

vi.mock('./dynamicutilities', () => ({
  APP_PANEL: './AppPanel',
  toLazyDynamicComponent: () =>
    function TallWebapp() {
      return <div data-testid="webapp">webapp content</div>
    }
}))

function renderEmbedded() {
  return render(
    <MemoryRouter
      initialEntries={['/e/tall-webapp']}
      future={ROUTER_FUTURE_FLAGS}
    >
      <Routes>
        <Route path="/e/:moduleId" element={<Embedded />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Embedded', () => {
  it('lets the webapp wrapper grow with a webapp taller than the window', () => {
    renderEmbedded()
    const wrapper = screen.getByTestId('webapp').parentElement as HTMLElement

    expect(wrapper.style.height).toBe('')
    expect(wrapper.style.minHeight).toBe('calc(100vh - 105px)')
  })
})
