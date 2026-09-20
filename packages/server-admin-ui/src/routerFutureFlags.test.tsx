import { describe, it, expect, afterEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { ROUTER_FUTURE_FLAGS } from './routerFuture'

const FUTURE_FLAG_WARNING = 'React Router Future Flag Warning'

describe('router future flags', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the app router without v7 upgrade warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <HashRouter future={ROUTER_FUTURE_FLAGS}>
        <Routes>
          <Route path="/*" element={<div />} />
        </Routes>
      </HashRouter>
    )

    const warnings = warn.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .filter((message: string) => message.includes(FUTURE_FLAG_WARNING))

    expect(warnings).toEqual([])
  })
})
