import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Settings from './Settings'

const LOADED_SETTINGS = {
  interfaces: {},
  options: {},
  staleness: {
    enforceDataTimeouts: true,
    useDefaultTimeouts: false,
    defaultTimeout: 120
  }
}

interface FetchCall {
  url: string
  init?: RequestInit
}

function stubFetch(): FetchCall[] {
  const calls: FetchCall[] = []
  vi.stubGlobal('serverRoutesPrefix', '/skServer')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      const body =
        url === '/skServer/settings'
          ? LOADED_SETTINGS
          : url.includes('logfiles')
            ? []
            : {}
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => ''
      }
    })
  )
  return calls
}

describe('Settings save', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('sends only the staleness setting the page edits', async () => {
    const calls = stubFetch()
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    )
    await screen.findAllByRole('button', { name: /save/i })
    await waitFor(() => {
      expect(
        calls.some((c) => c.url === '/skServer/settings' && !c.init?.method)
      ).to.equal(true)
    })
    await new Promise((r) => setTimeout(r, 0))

    // Other sections on the page have Save buttons of their own
    const serverSettings = screen
      .getByText('Server Settings')
      .closest('.card') as HTMLElement
    const saveButtons = within(serverSettings).getAllByRole('button', {
      name: /save/i
    })
    fireEvent.click(saveButtons[saveButtons.length - 1]!)

    await waitFor(() => {
      const put = calls.find(
        (c) => c.url === '/skServer/settings' && c.init?.method === 'PUT'
      )
      expect(put).to.not.equal(undefined)
      const body = JSON.parse(String(put!.init!.body))
      expect(body.staleness).to.deep.equal({ enforceDataTimeouts: true })
    })
  })
})
