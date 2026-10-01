import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GnssPositionSettings from './GnssPositionSettings'
import { useStore } from '../../store'
import type { GnssSensorConfig } from '../../store/types'

const SOURCE = 'nmea0183.GP'

function setSensor(sensor: Partial<GnssSensorConfig>) {
  useStore.setState({
    gnssSensorsData: {
      correction: 'off',
      sensors: [
        {
          sensorId: 'gnss1',
          $source: SOURCE,
          fromBow: 5,
          fromCenter: null,
          ...sensor
        }
      ],
      saveState: { dirty: false, timeoutsOk: true }
    },
    positionSources: [SOURCE]
  })
}

const storedFromCenter = () =>
  useStore.getState().gnssSensorsData.sensors[0].fromCenter

const distanceInput = () =>
  screen.getByLabelText(`From center in meters for ${SOURCE}`)
const sideSelect = () =>
  screen.getByLabelText(`Side of the centerline for ${SOURCE}`)

describe('GnssPositionSettings From Center', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    )
    setSensor({})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Keyboards without a minus key can still type digits and the decimal
  // point, so both sides must be reachable with those alone.
  it('enters a port offset without typing a minus sign', async () => {
    const user = userEvent.setup()
    render(<GnssPositionSettings />)

    await user.selectOptions(sideSelect(), 'port')
    await user.type(distanceInput(), '1.5')

    expect(storedFromCenter()).toBe(-1.5)
  })

  it('enters a starboard offset', async () => {
    const user = userEvent.setup()
    render(<GnssPositionSettings />)

    await user.selectOptions(sideSelect(), 'starboard')
    await user.type(distanceInput(), '1.5')

    expect(storedFromCenter()).toBe(1.5)
  })

  it('moves an entered distance to the side picked afterwards', async () => {
    const user = userEvent.setup()
    render(<GnssPositionSettings />)

    await user.type(distanceInput(), '1.5')
    expect(storedFromCenter()).toBe(1.5)

    await user.selectOptions(sideSelect(), 'port')
    expect(storedFromCenter()).toBe(-1.5)

    await user.selectOptions(sideSelect(), 'starboard')
    expect(storedFromCenter()).toBe(1.5)
  })

  it('shows a stored offset as a distance and a side', () => {
    setSensor({ fromCenter: -2 })
    render(<GnssPositionSettings />)

    expect(distanceInput()).toHaveValue(2)
    expect(sideSelect()).toHaveValue('port')
  })

  it('follows the side of an offset set elsewhere, such as the schematic', () => {
    setSensor({ fromCenter: 1 })
    render(<GnssPositionSettings />)
    expect(sideSelect()).toHaveValue('starboard')

    act(() => {
      useStore.getState().updateGnssSensor(0, { fromCenter: -0.8 })
    })
    expect(distanceInput()).toHaveValue(0.8)
    expect(sideSelect()).toHaveValue('port')
  })

  it('keeps the picked side while the antenna is on the centerline', async () => {
    const user = userEvent.setup()
    render(<GnssPositionSettings />)

    await user.selectOptions(sideSelect(), 'port')
    await user.type(distanceInput(), '0')

    expect(Object.is(storedFromCenter(), 0)).toBe(true)
    expect(sideSelect()).toHaveValue('port')
  })

  it('keeps the side when a stored distance is cleared and retyped', async () => {
    const user = userEvent.setup()
    setSensor({ fromCenter: -2 })
    render(<GnssPositionSettings />)

    await user.clear(distanceInput())
    expect(sideSelect()).toHaveValue('port')
    await user.type(distanceInput(), '3')

    expect(storedFromCenter()).toBe(-3)
  })

  it('does not commit a negative distance and says why', async () => {
    const user = userEvent.setup()
    setSensor({ fromCenter: 2 })
    render(<GnssPositionSettings />)

    await user.clear(distanceInput())
    await user.type(distanceInput(), '-1')

    expect(storedFromCenter()).toBeNull()
    expect(distanceInput()).toHaveClass('is-invalid')
    expect(distanceInput()).toHaveAttribute('aria-invalid', 'true')
    expect(distanceInput()).toHaveAccessibleDescription(
      'Enter the distance without a sign and pick the side.'
    )
  })
})
