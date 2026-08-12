import { expect } from 'chai'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { radar } from '@signalk/server-api'
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

  // A failed assertion skips any cleanup at the end of a test body, and a
  // still-listening server keeps the mocha process alive. Close them here
  // instead, so a failure reports as a failure rather than as a hang.
  const started: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (started.length) await started.pop()!()
  })

  async function startRadarApi(
    onSetControl: (radarId: string, controlId: string, value: unknown) => void
  ) {
    const app = express() as unknown as express.Express & {
      securityStrategy: { shouldAllowPut: () => boolean }
    }
    app.use(express.json())
    app.securityStrategy = { shouldAllowPut: () => true }

    const api = new RadarApi(
      app as unknown as ConstructorParameters<typeof RadarApi>[0]
    )
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
        },
        getControl: async (_radarId: string, controlId: string) =>
          controlId === 'gain'
            ? { auto: false, value: 50 }
            : { auto: true, autoValue: -20, value: 28 }
      }
    } as unknown as radar.RadarProvider)

    const server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo
    started.push(
      () => new Promise<void>((resolve) => server.close(() => resolve()))
    )
    return {
      put: (path: string, body: unknown) =>
        fetch(`http://127.0.0.1:${port}${path}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }),
      get: (path: string) => fetch(`http://127.0.0.1:${port}${path}`)
    }
  }

  it('hands the provider every field of a guard zone body', async () => {
    const seen: Array<[string, string, unknown]> = []
    const { put } = await startRadarApi((...args) => seen.push(args))

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
  })

  it('still unwraps a bare envelope for a scalar control', async () => {
    const seen: Array<[string, string, unknown]> = []
    const { put } = await startRadarApi((...args) => seen.push(args))

    const res = await put(`${base}/range`, { value: 1852 })

    expect(res.status).to.equal(200)
    expect(seen).to.deep.equal([[RADAR, 'range', 1852]])
  })
})

// radar_api.md, "Getting a Single Control Value", documents the response as
// `{ "auto": false, "value": 50 }`. Wrapping that in a Signal K value envelope
// put the documented object one level down, so `body.value` was the whole
// control rather than the control's value — and a compound control ended up
// with a `value` inside a `value`.

describe('Radar API: GET /controls/{controlId} route', () => {
  const RADAR = 'radar-0'
  const base = `/signalk/v2/api/vessels/self/radars/${RADAR}/controls`

  const started: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (started.length) await started.pop()!()
  })

  async function startRadarApi() {
    const app = express() as unknown as express.Express & {
      securityStrategy: { shouldAllowPut: () => boolean }
    }
    app.use(express.json())
    app.securityStrategy = { shouldAllowPut: () => true }

    const api = new RadarApi(
      app as unknown as ConstructorParameters<typeof RadarApi>[0]
    )
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
        getControl: async (_radarId: string, controlId: string) =>
          controlId === 'gain'
            ? { auto: false, value: 50 }
            : { auto: true, autoValue: -20, value: 28 }
      }
    } as unknown as radar.RadarProvider)

    const server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo
    started.push(
      () => new Promise<void>((resolve) => server.close(() => resolve()))
    )
    return { get: (path: string) => fetch(`http://127.0.0.1:${port}${path}`) }
  }

  it('answers with the control as documented, not wrapped', async () => {
    const { get } = await startRadarApi()

    const res = await get(`${base}/gain`)

    expect(res.status).to.equal(200)
    expect(await res.json()).to.deep.equal({ auto: false, value: 50 })
  })

  it('keeps an auto adjustment beside the value it belongs to', async () => {
    const { get } = await startRadarApi()

    const res = await get(`${base}/sea`)

    expect(await res.json()).to.deep.equal({
      auto: true,
      autoValue: -20,
      value: 28
    })
  })
})

// A client cannot read one thing to find out how its request went while the
// API answers `{success}` from one route, `{state,statusCode,message}` from
// the next and `{error}` from a third. `{success}` is the shape a provider
// hands back internally; it has no business on the wire.

describe('Radar API: mutation response shape', () => {
  const RADAR = 'radar-0'
  const base = `/signalk/v2/api/vessels/self/radars/${RADAR}`

  const started: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (started.length) await started.pop()!()
  })

  async function start(overrides: Record<string, unknown>) {
    const app = express() as unknown as express.Express & {
      securityStrategy: { shouldAllowPut: () => boolean }
    }
    app.use(express.json())
    app.securityStrategy = { shouldAllowPut: () => true }

    const api = new RadarApi(
      app as unknown as ConstructorParameters<typeof RadarApi>[0]
    )
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
        ...overrides
      }
    } as unknown as radar.RadarProvider)

    const server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo
    started.push(
      () => new Promise<void>((resolve) => server.close(() => resolve()))
    )
    const call = (method: string) => (path: string, body?: unknown) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    return { put: call('PUT'), post: call('POST'), get: call('GET') }
  }

  it('answers a set control with the request response', async () => {
    const { put } = await start({
      setControl: async () => ({ success: true })
    })

    const res = await put(`${base}/controls/gain`, { value: 50 })

    expect(res.status).to.equal(200)
    expect(await res.json()).to.deep.equal({
      state: 'COMPLETED',
      statusCode: 200,
      message: 'OK'
    })
  })

  it('reports a control the provider refused in the same shape', async () => {
    const { put } = await start({
      setControl: async () => ({ success: false, error: 'Radar said no' })
    })

    const res = await put(`${base}/controls/gain`, { value: 50 })

    expect(res.status).to.equal(400)
    expect(await res.json()).to.deep.equal({
      state: 'FAILED',
      statusCode: 400,
      message: 'Radar said no'
    })
  })

  it('keeps the target id beside the request response on acquisition', async () => {
    const { post } = await start({
      acquireTarget: async () => ({ success: true, targetId: 5 })
    })

    const res = await post(`${base}/targets`, {
      bearing: 0.785,
      distance: 2000
    })

    expect(res.status).to.equal(201)
    expect(await res.json()).to.deep.equal({
      state: 'COMPLETED',
      statusCode: 201,
      message: 'OK',
      targetId: 5
    })
  })

  // Reads answer failure in the same shape as writes. They used to answer
  // `{error: 'Radar not found', id}`, so a client had to know whether it had
  // read or written to know which field carried the reason.
  const reads = [
    ['capabilities', `${base}/capabilities`],
    ['controls', `${base}/controls`],
    ['a single control', `${base}/controls/gain`],
    ['targets', `${base}/targets`]
  ] as const

  for (const [what, path] of reads) {
    it(`reports a missing radar the same way when reading ${what}`, async () => {
      const { get } = await start({})

      const res = await get(path.replace(RADAR, 'nosuchradar'))

      expect(res.status).to.equal(404)
      const body = await res.json()
      expect(body.state).to.equal('FAILED')
      expect(body.statusCode).to.equal(404)
      expect(body.message).to.be.a('string')
      expect(body.error, 'the old error field must be gone').to.equal(undefined)
      expect(body.id, 'the old id field must be gone').to.equal(undefined)
    })
  }

  it('reports an unknown control in the same shape', async () => {
    const { get } = await start({
      getControl: async () => null
    })

    const res = await get(`${base}/controls/nosuchcontrol`)

    expect(res.status).to.equal(404)
    const body = await res.json()
    expect(body.state).to.equal('FAILED')
    expect(body.statusCode).to.equal(404)
    expect(body.error, 'the old error field must be gone').to.equal(undefined)
    expect(body.controlId, 'the old controlId field must be gone').to.equal(
      undefined
    )
  })

  it('reports an unknown radar in the same shape', async () => {
    const { put } = await start({ setControl: async () => ({ success: true }) })

    const res = await put(
      '/signalk/v2/api/vessels/self/radars/nosuchradar/controls/gain',
      { value: 50 }
    )

    expect(res.status).to.equal(404)
    const body = await res.json()
    expect(body.state).to.equal('FAILED')
    expect(body.statusCode).to.equal(404)
    expect(body.message).to.be.a('string')
  })
})
