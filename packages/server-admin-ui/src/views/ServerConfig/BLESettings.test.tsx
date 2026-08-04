import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import BLESettings from './BLESettings'
import { useStore } from '../../store'
import type { BleSettings } from '../../store/slices/bleSlice'

const SETTINGS: BleSettings = {
  localBluetoothManaged: true,
  localAdapters: [],
  localMaxGATTSlots: 3,
  localBLESupported: true,
  activeAdapters: [],
  adapterErrors: {}
}

interface FetchCall {
  url: string
  init?: RequestInit
}

function stubFetch(status = 404, body: unknown = undefined): FetchCall[] {
  const calls: FetchCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: `status ${status}`,
        json: async () => body
      }
    })
  )
  return calls
}

const setBleSettings = (settings: BleSettings | null) =>
  act(() => useStore.setState({ bleSettings: settings }))

describe('BLESettings', () => {
  beforeEach(() => {
    useStore.setState({
      bleSettings: null,
      bleSettingsSaving: false,
      bleSettingsSaveError: null
    })
    stubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing before the settings have loaded', () => {
    const { container } = render(<BLESettings />)
    expect(container.firstChild).toBeNull()
  })

  it('disables the controls when local BLE is unsupported', () => {
    render(<BLESettings />)
    setBleSettings({ ...SETTINGS, localBLESupported: false })

    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    expect(screen.getByText(/requires Linux/)).toBeInTheDocument()
  })

  it('clamps the GATT slot input to the allowed range', () => {
    render(<BLESettings />)
    setBleSettings(SETTINGS)

    const input = screen.getByLabelText('Max GATT Connections')
    fireEvent.change(input, { target: { value: '15' } })
    expect(input).toHaveValue(10)

    fireEvent.change(input, { target: { value: '0' } })
    expect(input).toHaveValue(1)
  })

  it('saves only the persistable fields', async () => {
    const calls = stubFetch(200, {})
    render(<BLESettings />)
    setBleSettings(SETTINGS)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
    })

    const put = calls.find((c) => c.init?.method === 'PUT')
    expect(put).toBeDefined()
    expect(JSON.parse(put!.init!.body as string)).toEqual({
      localBluetoothManaged: true,
      localMaxGATTSlots: 3
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a rejected save as a dismissible error', async () => {
    stubFetch(400, { message: 'out of range' })
    render(<BLESettings />)
    setBleSettings(SETTINGS)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
    })
    expect(screen.getByText('out of range')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText('out of range')).not.toBeInTheDocument()
  })
})
