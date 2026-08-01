import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { useStore } from '../../store'
import PathDisplayName from './PathDisplayName'

const PATH = 'tanks.freshWater.2.currentLevel'

function setMeta(meta: Record<string, Record<string, unknown>>) {
  useStore.setState({ signalkMeta: { self: meta } })
}

function asAdmin() {
  useStore.setState({
    loginStatus: {
      authenticationRequired: true,
      status: 'loggedIn',
      userLevel: 'admin'
    }
  })
}

function asReadonlyUser() {
  useStore.setState({
    loginStatus: {
      authenticationRequired: true,
      status: 'loggedIn',
      userLevel: 'readonly'
    }
  })
}

describe('PathDisplayName', () => {
  beforeEach(() => {
    useStore.setState({ signalkMeta: {}, loginStatus: {} })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the displayName stored at the exact path', () => {
    setMeta({ [PATH]: { displayName: 'Freshwater STB' } })
    const { getByText } = render(<PathDisplayName context="self" path={PATH} />)
    expect(getByText('Freshwater STB')).toBeInTheDocument()
  })

  it('shows the mapped data-path name on a notifications row without a pencil', () => {
    asAdmin()
    setMeta({ [PATH]: { displayName: 'Freshwater STB' } })
    const { getByText, queryByRole } = render(
      <PathDisplayName context="self" path={`notifications.${PATH}`} />
    )
    expect(getByText('Freshwater STB')).toBeInTheDocument()
    expect(queryByRole('button')).toBeNull()
  })

  it('renders nothing without a name for a non-editing user', () => {
    asReadonlyUser()
    const { container } = render(<PathDisplayName context="self" path={PATH} />)
    expect(container.firstChild).toBeNull()
  })

  it('hides the pencil on non-self contexts', () => {
    setMeta({})
    useStore.setState({
      signalkMeta: {
        'vessels.urn:mrn:imo:mmsi:230099999': {
          [PATH]: { displayName: 'Other boat tank' }
        }
      }
    })
    const { getByText, queryByRole } = render(
      <PathDisplayName
        context="vessels.urn:mrn:imo:mmsi:230099999"
        path={PATH}
      />
    )
    expect(getByText('Other boat tank')).toBeInTheDocument()
    expect(queryByRole('button')).toBeNull()
  })

  it('saves an edit via PUT and updates the store optimistically', async () => {
    asAdmin()
    setMeta({})
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { getByRole } = render(<PathDisplayName context="self" path={PATH} />)
    fireEvent.click(getByRole('button'))
    const input = getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Freshwater STB' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/signalk/v1/api/vessels/self/tanks/freshWater/2/currentLevel/meta/displayName',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ value: 'Freshwater STB' })
      })
    )
    expect(useStore.getState().signalkMeta['self'][PATH].displayName).toBe(
      'Freshwater STB'
    )
  })

  it('reverts the optimistic update when the PUT is rejected', async () => {
    asAdmin()
    setMeta({ [PATH]: { displayName: 'Old name' } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401 }))
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { getByRole } = render(<PathDisplayName context="self" path={PATH} />)
    fireEvent.click(getByRole('button'))
    const input = getByRole('textbox')
    fireEvent.change(input, { target: { value: 'New name' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(useStore.getState().signalkMeta['self'][PATH].displayName).toBe(
        'Old name'
      )
    )
    warn.mockRestore()
  })

  it('cancels with Escape without saving', () => {
    asAdmin()
    setMeta({ [PATH]: { displayName: 'Freshwater STB' } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { getByRole, getByText } = render(
      <PathDisplayName context="self" path={PATH} />
    )
    fireEvent.click(getByRole('button'))
    const input = getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Changed' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(getByText('Freshwater STB')).toBeInTheDocument()
  })

  it('clears the name when saving an empty value', () => {
    asAdmin()
    setMeta({ [PATH]: { displayName: 'Freshwater STB' } })
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { getByRole } = render(<PathDisplayName context="self" path={PATH} />)
    fireEvent.click(getByRole('button'))
    const input = getByRole('textbox')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ value: null }) })
    )
    expect(useStore.getState().signalkMeta['self'][PATH].displayName).toBeNull()
  })
})
