import { expect } from 'chai'
import express from 'express'
import { RadarApi, unwrapControlPayload } from '../../src/api/radar'

// Every shape in the "Setting a Control Value" section of radar_api.md.
//
// A Signal K PUT carries its payload as `{ "value": x }`, but a compound radar
// control has its own `value` field alongside siblings — a zone's `value` is
// its start bearing. Unwrapping whenever `value` is present therefore threw
// away `enabled`, `endValue`, `startDistance` and `endDistance` on every zone
// and sector PUT, while still answering 200.

describe('Radar API: control PUT payload', () => {
  it('unwraps the envelope for a simple numeric control', () => {
    expect(unwrapControlPayload({ value: 75 })).to.equal(75)
  })

  it('keeps siblings when a control carries auto alongside value', () => {
    const body = { auto: false, value: 75 }
    expect(unwrapControlPayload(body)).to.deep.equal(body)
  })

  it('passes an auto-only payload through', () => {
    const body = { auto: true }
    expect(unwrapControlPayload(body)).to.deep.equal(body)
  })

  it('passes an auto adjustment payload through', () => {
    const body = { auto: true, autoValue: -20 }
    expect(unwrapControlPayload(body)).to.deep.equal(body)
  })

  it('keeps every field of a sector control', () => {
    const body = { enabled: true, value: -1.5533, endValue: -1.2217 }
    expect(unwrapControlPayload(body)).to.deep.equal(body)
  })

  it('keeps every field of a zone control', () => {
    const body = {
      enabled: true,
      value: -0.5585,
      endValue: 1.7104,
      startDistance: 100.0,
      endDistance: 500.0
    }
    expect(unwrapControlPayload(body)).to.deep.equal(body)
  })

  it('passes an empty button payload through', () => {
    expect(unwrapControlPayload({})).to.deep.equal({})
  })

  it('does not unwrap a value that is itself the whole payload', () => {
    // A single `value` key is the envelope even when its content is an object,
    // which is how a compound payload may be sent explicitly wrapped.
    expect(
      unwrapControlPayload({ value: { auto: true, value: 50 } })
    ).to.deep.equal({
      auto: true,
      value: 50
    })
  })

  it('leaves non-object bodies alone', () => {
    expect(unwrapControlPayload(75)).to.equal(75)
    expect(unwrapControlPayload(null)).to.equal(null)
    expect(unwrapControlPayload(undefined)).to.equal(undefined)
  })
})

// Route-level coverage: the unit tests above prove the helper, this proves the
// PUT handler actually uses it and hands the provider every field.

describe('Radar API: PUT /controls/{controlId} route', () => {
  const RADAR = 'radar-0'
  const base = `/signalk/v2/api/vessels/self/radars/${RADAR}/controls`

  async function startRadarApi(
    onSetControl: (radarId: string, controlId: string, value: unknown) => void
  ) {
    const app: any = express()
    app.use(express.json())
    app.securityStrategy = { shouldAllowPut: () => true }

    const api = new RadarApi(app)
    await api.start()
    api.register('test-provider', {
      name: 'Test Radar Provider',
      methods: {
        getRadars: async () => [RADAR],
        getRadarInfo: async () => ({
          name: 'Test',
          brand: 'Test',
          radarIpAddress: '10.0.0.1'
        }),
        setControl: async (
          radarId: string,
          controlId: string,
          value: unknown
        ) => {
          onSetControl(radarId, controlId, value)
          return { success: true }
        }
      }
    } as any)

    const server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address()
    return {
      put: (path: string, body: unknown) =>
        fetch(`http://127.0.0.1:${port}${path}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }),
      stop: () => new Promise((resolve) => server.close(resolve))
    }
  }

  it('hands the provider every field of a guard zone body', async () => {
    const seen: Array<[string, string, unknown]> = []
    const { put, stop } = await startRadarApi((...args) => seen.push(args))

    const zone = {
      enabled: true,
      value: -0.5585,
      endValue: 1.7104,
      startDistance: 100.0,
      endDistance: 500.0
    }
    const res = await put(`${base}/guardZone1`, zone)

    expect(res.status).to.equal(200)
    expect(seen).to.deep.equal([[RADAR, 'guardZone1', zone]])
    await stop()
  })

  it('still unwraps a bare envelope for a scalar control', async () => {
    const seen: Array<[string, string, unknown]> = []
    const { put, stop } = await startRadarApi((...args) => seen.push(args))

    const res = await put(`${base}/range`, { value: 1852 })

    expect(res.status).to.equal(200)
    expect(seen).to.deep.equal([[RADAR, 'range', 1852]])
    await stop()
  })
})
