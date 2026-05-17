import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

/**
 * Regression: /skServer/availablePaths was returning entries for paths that
 * never had a real value published — specifically meta-only deltas (e.g.
 * Weather-provider schema templates) and deltas for other vessels. The UI
 * "Add ungrouped path-level override" dropdown used this list and surfaced
 * paths the vessel was not actually reporting.
 */
describe('availablePaths', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stop: any
  let host: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendADelta: any

  before(async function () {
    const s = await startServer()
    stop = s.stop
    host = s.host
    sendADelta = s.sendADelta
  })

  after(async function () {
    if (stop) await stop()
  })

  it('excludes meta-only paths (plugin registers schema template, no value)', async function () {
    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'test-plugin',
          timestamp: '2026-04-24T00:00:00.000Z',
          meta: [
            {
              path: 'environment.outside.uvIndex',
              value: {
                units: 'UV index',
                description: 'UV Index (1 UVI = 25mW/sqm)'
              }
            }
          ]
        }
      ]
    })
    await new Promise((r) => setTimeout(r, 80))

    const res = await fetch(`${host}/skServer/availablePaths`)
    expect(res.status).to.equal(200)
    const paths = (await res.json()) as string[]
    expect(paths).to.not.include('environment.outside.uvIndex')
  })

  it('excludes paths from non-self contexts', async function () {
    await sendADelta({
      context: 'vessels.urn:mrn:imo:mmsi:123456789',
      updates: [
        {
          $source: 'test-ais',
          timestamp: '2026-04-24T00:00:01.000Z',
          values: [{ path: 'navigation.speedOverGround', value: 5 }]
        }
      ]
    })
    await new Promise((r) => setTimeout(r, 80))

    // The self vessel did not report this path — only the other vessel did.
    // We can't assert 'not included' directly because other tests may have
    // sent navigation.speedOverGround on self. Instead, send a unique AIS-
    // only path and check that.
    await sendADelta({
      context: 'vessels.urn:mrn:imo:mmsi:123456789',
      updates: [
        {
          $source: 'test-ais',
          timestamp: '2026-04-24T00:00:02.000Z',
          values: [
            {
              path: 'design.aisShipType',
              value: { id: 37, name: 'Pleasure craft' }
            }
          ]
        }
      ]
    })
    await new Promise((r) => setTimeout(r, 80))

    const res = await fetch(`${host}/skServer/availablePaths`)
    const paths = (await res.json()) as string[]
    expect(paths).to.not.include('design.aisShipType')
  })

  it('includes paths with a real value published on self', async function () {
    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'test-plugin',
          timestamp: '2026-04-24T00:00:03.000Z',
          values: [{ path: 'environment.real.value.path', value: 1.23 }]
        }
      ]
    })
    await new Promise((r) => setTimeout(r, 80))

    const res = await fetch(`${host}/skServer/availablePaths`)
    const paths = (await res.json()) as string[]
    expect(paths).to.include('environment.real.value.path')
  })
})
