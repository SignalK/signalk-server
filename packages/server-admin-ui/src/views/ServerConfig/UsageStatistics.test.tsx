import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import UsageStatistics from './UsageStatistics'

function mockServer(enabled: boolean) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) =>
      String(input).endsWith('/report')
        ? Response.json({
            ...(enabled && { installationId: 'an-id' }),
            nodeVersion: '22.0.0'
          })
        : Response.json({
            enabled: init?.body
              ? JSON.parse(String(init.body)).enabled
              : enabled,
            answered: true
          })
    )
}

describe('UsageStatistics', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('saves the choice when the switch is turned', async () => {
    const fetchMock = mockServer(false)
    render(<UsageStatistics />)
    const toggle = await screen.findByLabelText(
      'Share which plugins this server uses'
    )
    expect(toggle).not.toBeChecked()
    await act(async () => fireEvent.click(toggle))
    expect(toggle).toBeChecked()
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/settings\/usageStatistics$/),
      expect.objectContaining({ method: 'PUT', body: '{"enabled":true}' })
    )
  })

  it.each([
    { enabled: false, note: true },
    { enabled: true, note: false }
  ])(
    'previews the report; enabled: $enabled, id note: $note',
    async ({ enabled, note }) => {
      mockServer(enabled)
      render(<UsageStatistics />)
      await screen.findByLabelText('Share which plugins this server uses')
      const details = screen.getByText('Details').closest('details')!
      details.open = true
      fireEvent(details, new Event('toggle'))
      expect(await screen.findByText(/"nodeVersion": "22.0.0"/)).toBeVisible()
      expect(
        screen.queryByText(
          'When this is on, a random installation ID is added.'
        )
      ).toEqual(note ? expect.anything() : null)
    }
  )
})
