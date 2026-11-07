import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DepthSensorSettings from './DepthSensorSettings'
import { useStore } from '../../store'

const N2K = 'n2k.35'
const NMEA0183 = 'nmea0183.II'

const stored = () => useStore.getState().depthSensorsData.sensors

describe('DepthSensorSettings', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ result: 'ok' })
    }))
    vi.stubGlobal('fetch', fetchMock)
    useStore.setState({
      depthSensorsData: {
        sensors: [],
        saveState: { dirty: false, timeoutsOk: true }
      },
      depthSources: [N2K, NMEA0183]
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists every detected depth source as a row', () => {
    render(<DepthSensorSettings />)

    expect(screen.getByLabelText(`Sensor label for ${N2K}`)).toBeVisible()
    expect(screen.getByLabelText(`Sensor label for ${NMEA0183}`)).toBeVisible()
  })

  it('configures a transducer by typing its position', async () => {
    const user = userEvent.setup()
    render(<DepthSensorSettings />)

    await user.type(
      screen.getByLabelText(`From bow in meters for ${N2K}`),
      '6.5'
    )
    await user.selectOptions(
      screen.getByLabelText(`Side of the centerline for ${N2K}`),
      'port'
    )
    await user.type(
      screen.getByLabelText(`From center in meters for ${N2K}`),
      '0.3'
    )
    await user.type(
      screen.getByLabelText(`Below waterline in meters for ${N2K}`),
      '0.7'
    )

    expect(stored()).toEqual([
      {
        sensorId: 'depth1',
        $source: N2K,
        fromBow: 6.5,
        fromCenter: -0.3,
        fromWaterline: 0.7
      }
    ])
  })

  it('saves the transducers to the sensors API', async () => {
    const user = userEvent.setup()
    render(<DepthSensorSettings />)

    await user.type(
      screen.getByLabelText(`Below waterline in meters for ${NMEA0183}`),
      '0.4'
    )
    await user.click(screen.getByRole('button', { name: /Save/ }))

    const put = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT'
    )
    expect(put?.[0]).toBe('/signalk/v2/api/vessels/self/sensors/depth')
    expect(JSON.parse((put?.[1] as RequestInit).body as string)).toEqual({
      sensors: [
        {
          sensorId: 'depth1',
          $source: NMEA0183,
          fromBow: null,
          fromCenter: null,
          fromWaterline: 0.4
        }
      ]
    })
    expect(useStore.getState().depthSensorsData.saveState.dirty).toBe(false)
  })

  describe('side view', () => {
    const vesselResponse = (vessel: object) =>
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => (url.endsWith('/vessel') ? vessel : { result: 'ok' })
      }))

    beforeEach(() => {
      useStore.setState({
        depthSensorsData: {
          sensors: [
            {
              sensorId: 'keel',
              $source: N2K,
              fromBow: 5.5,
              fromCenter: -0.4,
              fromWaterline: 0.7
            }
          ],
          saveState: { dirty: false, timeoutsOk: true }
        }
      })
    })

    it('shows each transducer at its depth below the waterline', async () => {
      vi.stubGlobal(
        'fetch',
        vesselResponse({ length: 12, beam: 4, draft: 1.7 })
      )
      render(<DepthSensorSettings />)

      expect(
        await screen.findByRole('img', { name: /Side view of the vessel/ })
      ).toBeVisible()
      expect(screen.getByText('keel 0.7 m')).toBeVisible()
      expect(screen.getByText('Draft 1.7 m')).toBeVisible()
    })

    it('asks for the draft when none is set', async () => {
      vi.stubGlobal('fetch', vesselResponse({ length: 12, beam: 4 }))
      render(<DepthSensorSettings />)

      expect(
        await screen.findByText(/to place transducers in the side view/)
      ).toBeVisible()
      expect(
        screen.queryByRole('img', { name: /Side view of the vessel/ })
      ).toBeNull()
    })
  })
})
