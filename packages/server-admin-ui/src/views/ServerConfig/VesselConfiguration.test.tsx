import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VesselConfiguration from './VesselConfiguration'

describe('VesselConfiguration hull type', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? { ok: true, text: async () => 'Vessel changed' }
        : {
            ok: true,
            json: async () => ({ name: 'Test', hullType: 'catamaran' })
          }
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('alert', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const hullType = () => screen.getByLabelText('Hull Type') as HTMLSelectElement

  it('shows the stored hull type', async () => {
    render(<VesselConfiguration />)
    expect(
      (await screen.findByLabelText('Hull Type')) as HTMLSelectElement
    ).toBeTruthy()
    expect(hullType().value).toBe('catamaran')
  })

  it('sends the chosen hull type, or an empty one for Not set, on Save', async () => {
    const user = userEvent.setup()
    render(<VesselConfiguration />)
    await screen.findByLabelText('Hull Type')

    await user.selectOptions(hullType(), 'trimaran')
    await user.click(screen.getByRole('button', { name: /Save/ }))
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(put![1].body as string).hullType).toBe('trimaran')

    fetchMock.mockClear()
    await user.selectOptions(hullType(), '')
    await user.click(screen.getByRole('button', { name: /Save/ }))
    const cleared = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'PUT'
    )
    expect(JSON.parse(cleared![1].body as string).hullType).toBe('')
  })
})
