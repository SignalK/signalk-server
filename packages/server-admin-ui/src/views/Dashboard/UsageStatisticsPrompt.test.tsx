import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import UsageStatisticsPrompt from './UsageStatisticsPrompt'
import { useStore } from '../../store'

const TITLE = 'Help us help you'
const unanswered = () => Response.json({ enabled: false, answered: false })

function mockFetch(...responses: (() => Response | Promise<Response>)[]) {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
  for (const response of responses) {
    fetchMock.mockImplementationOnce(async () => response())
  }
  return fetchMock
}

async function renderPrompt() {
  await act(async () => {
    render(<UsageStatisticsPrompt />)
  })
}

describe('UsageStatisticsPrompt', () => {
  beforeEach(() => {
    useStore.setState({ loginStatus: { authenticationRequired: false } })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    { choice: 'unanswered', response: unanswered, shown: true },
    {
      choice: 'answered',
      response: () => Response.json({ enabled: false, answered: true }),
      shown: false
    }
  ])(
    'shown: $shown when the choice is $choice',
    async ({ response, shown }) => {
      mockFetch(response)
      await renderPrompt()
      expect(screen.queryByText(TITLE) !== null).toBe(shown)
    }
  )

  it('does not ask a user who is not an admin', async () => {
    useStore.setState({
      loginStatus: { authenticationRequired: true, userLevel: 'readonly' }
    })
    const fetchMock = mockFetch(unanswered)
    await renderPrompt()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(TITLE)).toBeNull()
  })

  it('goes once the server confirms the answer', async () => {
    const fetchMock = mockFetch(unanswered, () =>
      Response.json({ enabled: true, answered: true })
    )
    await renderPrompt()
    await act(async () => fireEvent.click(screen.getByText('Share')))
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'PUT', body: '{"enabled":true}' })
    )
    expect(screen.queryByText(TITLE)).toBeNull()
  })

  it('stays with the error when saving fails, buttons disabled while saving', async () => {
    let fail: (response: Response) => void = () => {}
    mockFetch(
      unanswered,
      () =>
        new Promise((resolve) => {
          fail = resolve
        })
    )
    await renderPrompt()
    fireEvent.click(screen.getByText("Don't share"))
    expect(screen.getByText('Share')).toBeDisabled()
    await act(async () => fail(new Response('Disk full', { status: 500 })))
    expect(screen.getByText(TITLE)).toBeInTheDocument()
    expect(screen.getByText('Disk full')).toBeInTheDocument()
    expect(screen.getByText('Share')).toBeEnabled()
  })
})
