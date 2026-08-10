import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useStore } from '../../store'

// HistoryProviderSettings fetches on mount and is unrelated to the plugin
// list; stub it so this suite only exercises Configuration itself.
vi.mock('../ServerConfig/HistoryProviderSettings', () => ({
  default: () => null
}))

import Configuration from './Configuration'

function samplePlugin(id: string) {
  return {
    id,
    name: `Plugin ${id}`,
    packageName: id,
    description: 'A plugin',
    schema: {},
    data: { enabled: true, configuration: {} }
  }
}

function mockFetch(plugins: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            String(url).endsWith('/plugins')
              ? plugins
              : { interfaces: { wasm: true } }
          )
      } as Response)
    )
  )
}

function renderConfiguration() {
  ;(window as unknown as { serverRoutesPrefix: string }).serverRoutesPrefix =
    '/skServer'
  return render(
    <MemoryRouter initialEntries={['/apps/configuration/-']}>
      <Routes>
        <Route
          path="/apps/configuration/:pluginid"
          element={<Configuration />}
        />
      </Routes>
    </MemoryRouter>
  )
}

let originalServerRoutesPrefix: string | undefined

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  originalServerRoutesPrefix = (
    window as unknown as { serverRoutesPrefix?: string }
  ).serverRoutesPrefix
})

afterEach(() => {
  vi.unstubAllGlobals()
  // The store is a module singleton -- reset it so plugin state cannot leak
  // into unrelated suites sharing the worker.
  act(() => {
    useStore.getState().setPlugins([])
  })
  ;(window as unknown as { serverRoutesPrefix?: string }).serverRoutesPrefix =
    originalServerRoutesPrefix
})

describe('Configuration plugin list', () => {
  it('clears the list and count when the last plugin is removed', async () => {
    mockFetch([samplePlugin('signalk-example')])
    renderConfiguration()

    expect(await screen.findByText('1 plugin')).toBeDefined()
    expect(screen.getByText('Plugin signalk-example')).toBeDefined()

    // A PLUGINS_CHANGED update after uninstalling the only plugin.
    act(() => {
      useStore.getState().setPlugins([])
    })

    await waitFor(() => {
      expect(screen.getByText('No plugins installed')).toBeDefined()
    })
    expect(screen.queryByText('Plugin signalk-example')).toBeNull()
  })

  it('does not claim an empty install before the initial load resolves', () => {
    mockFetch([samplePlugin('signalk-example')])
    renderConfiguration()

    expect(screen.queryByText('No plugins installed')).toBeNull()
  })
})
