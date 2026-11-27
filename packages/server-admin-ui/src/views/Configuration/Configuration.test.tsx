import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PluginConfigurationList from './Configuration'
import { useStore } from '../../store'

const schema = {
  type: 'object',
  properties: { host: { type: 'string', title: 'Host' } }
}

function plugin(id: string, data: Record<string, unknown>) {
  return {
    id,
    name: `Name ${id}`,
    packageName: `pkg-${id}`,
    schema,
    data,
    bundled: true
  }
}

async function openCard(p: ReturnType<typeof plugin>, message: string) {
  ;(window as unknown as { serverRoutesPrefix: string }).serverRoutesPrefix =
    '/skServer'
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const body = String(url).endsWith('/plugins') ? [p] : {}
    return new Response(JSON.stringify(body), { status: 200 })
  })
  useStore.setState({
    providerStatus: [{ id: p.id, message, type: 'error', statusType: 'plugin' }]
  } as never)
  render(
    <MemoryRouter>
      <PluginConfigurationList />
    </MemoryRouter>
  )
  fireEvent.click(await screen.findByText(p.name))
  await screen.findByText(p.packageName)
  return document.querySelector('.plugin-config-card') as HTMLElement
}

describe('plugin configuration card status', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({ plugins: [], providerStatus: [] } as never)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the status of a default-enabled plugin that has no saved configuration', async () => {
    const card = await openCard(
      plugin('a', { enabled: true }),
      'Connection refused'
    )
    expect(within(card).getAllByText(/Connection refused/)).toHaveLength(1)
    expect(
      within(card).getByText('Save configuration to enable this plugin')
    ).toBeTruthy()
  })

  it('shows the status once for a plugin with a saved configuration', async () => {
    const card = await openCard(
      plugin('b', { enabled: true, configuration: { host: 'h' } }),
      'Connection refused'
    )
    expect(within(card).getAllByText(/Connection refused/)).toHaveLength(1)
    expect(
      within(card).queryByText('Save configuration to enable this plugin')
    ).toBeNull()
  })

  it('shows no status for a plugin that is not enabled', async () => {
    const card = await openCard(
      plugin('c', { enabled: false }),
      'Connection refused'
    )
    expect(within(card).queryByText(/Connection refused/)).toBeNull()
  })
})
