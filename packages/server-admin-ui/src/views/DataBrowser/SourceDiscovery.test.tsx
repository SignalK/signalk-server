import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { PgnInstanceField } from './SourceDiscovery'
import { useStore } from '../../store'
import type { N2kDeviceEntry } from '../../utils/sourceLabels'
import { deviceKeyFromCanName } from '../../utils/n2kDeviceKey'

const DEVICE: N2kDeviceEntry = {
  sourceRef: 'can0.c0788c00112a04d6',
  connection: 'can0',
  srcAddr: '50',
  src: '50',
  pgns: { '127508': 'Battery Status' }
}

// Longer than the field's verify timeout, in poll-interval steps.
const VERIFY_STEPS = 10
const VERIFY_STEP_MS = 1000

function renderField() {
  return render(
    <PgnInstanceField
      device={DEVICE}
      field="batteryInstance"
      label="Battery Instance (PGN 127508)"
      max={252}
    />
  )
}

// n2kConfigDevice accepts the write; n2kDeviceStatus reports `instances`.
function stubServer(instances: number[]) {
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.endsWith('/n2kDeviceStatus')
        ? { pgnDataInstances: { [DEVICE.sourceRef]: { '127508': instances } } }
        : {}
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function saveInstance(value: string) {
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  for (let step = 0; step < VERIFY_STEPS; step++) {
    await act(() => vi.advanceTimersByTimeAsync(VERIFY_STEP_MS))
  }
}

describe('PgnInstanceField', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows the instances the device status reports for the device', () => {
    // A mapped battery 3 writes electrical.batteries.house; the server still
    // reports it as instance 3.
    useStore.setState({
      pgnDataInstances: { [DEVICE.sourceRef]: { '127508': [3] } },
      n2kDeviceStatusLoaded: true
    })
    renderField()
    expect(screen.getByText(/^3/)).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('notes a path mapping on a mapped instance', () => {
    const canName = 'c0788c00112a04d6'
    useStore.setState({
      pgnDataInstances: { [DEVICE.sourceRef]: { '127508': [3, 4] } },
      n2kDeviceStatusLoaded: true,
      n2kInstanceMappings: {
        [deviceKeyFromCanName(canName) as string]: [
          {
            group: 'battery',
            instance: 3,
            target: 'electrical.batteries.house'
          }
        ]
      }
    })
    render(
      <PgnInstanceField
        device={{ ...DEVICE, canName }}
        field="batteryInstance"
        label="Battery Instance (PGN 127508)"
        max={252}
      />
    )
    expect(
      screen.getAllByText(/path mapping exists for this instance/)
    ).toHaveLength(1)
  })

  it('waits for the device status to load', () => {
    useStore.setState({ pgnDataInstances: {}, n2kDeviceStatusLoaded: false })
    renderField()
    expect(screen.getByText('...', { exact: false })).toBeTruthy()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('offers an unset instance when the device reports none', () => {
    useStore.setState({ pgnDataInstances: {}, n2kDeviceStatusLoaded: true })
    renderField()
    expect(screen.getByRole('spinbutton')).toBeTruthy()
    expect(screen.queryByText(/→/)).toBeNull()
  })

  describe('verifying an instance change', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      useStore.setState({
        pgnDataInstances: { [DEVICE.sourceRef]: { '127508': [3] } },
        n2kDeviceStatusLoaded: true
      })
    })

    it('confirms once the device status shows the new instance and not the old', async () => {
      const fetchMock = stubServer([4])
      renderField()
      await saveInstance('4')
      expect(
        fetchMock.mock.calls.some(([url]) => url.endsWith('/n2kDeviceStatus'))
      ).toBe(true)
      expect(
        fetchMock.mock.calls.some(([url]) => url.includes('/signalk/v1/api/'))
      ).toBe(false)
      // The confirmed status replaces the displayed instances.
      expect(useStore.getState().pgnDataInstances).toEqual({
        [DEVICE.sourceRef]: { '127508': [4] }
      })
      expect(screen.getByText(/^4/)).toBeTruthy()
      expect(screen.queryByText(/^3/)).toBeNull()
    })

    it('fails when the old instance never goes away', async () => {
      stubServer([3, 4])
      renderField()
      await saveInstance('4')
      expect(
        screen.getByTitle('Device did not confirm the change within timeout')
      ).toBeTruthy()
      expect(useStore.getState().pgnDataInstances).toEqual({
        [DEVICE.sourceRef]: { '127508': [3] }
      })
    })
  })
})
