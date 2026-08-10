import { expect } from 'chai'
import express from 'express'
import type { AddressInfo } from 'node:net'
import { applyControl, RadarApi } from '../../src/api/radar'
import type { radar } from '@signalk/server-api'

// The /power, /range, /gain, /sea and /rain routes predate
// /controls/{controlId} and each called its own typed provider method, which
// bypasses the control abstraction the rest of the API uses. Against
// mayara-server that made /gain, /sea and /rain fail with 400 while /range and
// /power worked, purely because a scalar survives the detour and { auto, value }
// does not. These routes now go through setControl with the control id.

function methods(
  overrides: Partial<radar.RadarProviderMethods>
): radar.RadarProviderMethods {
  return {
    getRadars: async () => ['radar-0'],
    getRadarInfo: async () => null,
    ...overrides
  } as radar.RadarProviderMethods
}

describe('Radar API: shortcut control routes', () => {
  it('routes through setControl with the control id and payload', async () => {
    const seen: Array<[string, string, unknown]> = []
    const provider = methods({
      setControl: async (id, controlId, value) => {
        seen.push([id, controlId, value])
        return { success: true }
      }
    })

    const payload = { auto: false, value: 75 }
    const result = await applyControl(provider, 'radar-0', 'gain', payload)

    expect(result.success).to.equal(true)
    expect(seen).to.deep.equal([['radar-0', 'gain', payload]])
  })

  it('passes a compound payload through untouched', async () => {
    let captured: unknown
    const provider = methods({
      setControl: async (_id, _controlId, value) => {
        captured = value
        return { success: true }
      }
    })

    const sea = { auto: true, autoValue: -20 }
    await applyControl(provider, 'radar-0', 'sea', sea)
    expect(captured).to.deep.equal(sea)
  })

  it('prefers setControl over the typed method when both exist', async () => {
    let usedLegacy = false
    const provider = methods({ setControl: async () => ({ success: true }) })

    await applyControl(provider, 'radar-0', 'range', 1852, async () => {
      usedLegacy = true
      return true
    })
    expect(usedLegacy).to.equal(false)
  })

  it('falls back to the typed method when setControl is absent', async () => {
    let usedLegacy = false
    const provider = methods({})

    const result = await applyControl(
      provider,
      'radar-0',
      'range',
      1852,
      async () => {
        usedLegacy = true
        return true
      }
    )
    expect(usedLegacy).to.equal(true)
    expect(result.success).to.equal(true)
  })

  it('reports a provider failure from the typed fallback', async () => {
    const provider = methods({})
    const result = await applyControl(
      provider,
      'radar-0',
      'range',
      1852,
      async () => false
    )
    expect(result.success).to.equal(false)
  })

  it('surfaces the error a provider returns from setControl', async () => {
    const provider = methods({
      setControl: async () => ({ success: false, error: 'range not settable' })
    })
    const result = await applyControl(provider, 'radar-0', 'range', 1852)
    expect(result).to.deep.equal({
      success: false,
      error: 'range not settable'
    })
  })

  it('fails clearly when the provider supports neither path', async () => {
    const result = await applyControl(methods({}), 'radar-0', 'gain', {
      auto: true
    })
    expect(result.success).to.equal(false)
    expect(result.error).to.match(/neither setControl nor a gain method/)
  })
})

// Route-level coverage. The unit tests above prove the dispatch rule; these
// drive the five shortcut endpoints themselves, so the capability guards and
// the response contract are exercised too.

describe('Radar API: shortcut routes over HTTP', () => {
  const RADAR = 'radar-0'
  const root = `/signalk/v2/api/vessels/self/radars/${RADAR}`

  async function startRadarApi(overrides: Partial<radar.RadarProviderMethods>) {
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

  it('forwards each shortcut to setControl with its control id', async () => {
    const seen: Array<[string, unknown]> = []
    const { put, stop } = await startRadarApi({
      setControl: async (_id, controlId, value) => {
        seen.push([controlId, value])
        return { success: true }
      }
    })

    expect((await put(`${root}/power`, { value: 'transmit' })).status).to.equal(
      200
    )
    expect((await put(`${root}/range`, { value: 1852 })).status).to.equal(200)
    expect(
      (await put(`${root}/gain`, { auto: false, value: 75 })).status
    ).to.equal(200)
    expect(
      (await put(`${root}/sea`, { auto: true, autoValue: -20 })).status
    ).to.equal(200)
    expect(
      (await put(`${root}/rain`, { auto: false, value: 30 })).status
    ).to.equal(200)

    expect(seen).to.deep.equal([
      ['power', 'transmit'],
      ['range', 1852],
      ['gain', { auto: false, value: 75 }],
      ['sea', { auto: true, autoValue: -20 }],
      ['rain', { auto: false, value: 30 }]
    ])
    await stop()
  })

  it('works for a provider that implements only the typed methods', async () => {
    let gain: unknown
    const { put, stop } = await startRadarApi({
      setGain: async (_id, value) => {
        gain = value
        return true
      }
    })

    const res = await put(`${root}/gain`, { auto: false, value: 75 })
    expect(res.status).to.equal(200)
    expect(gain).to.deep.equal({ auto: false, value: 75 })
    await stop()
  })

  it('returns 501 when the provider supports neither path', async () => {
    const { put, stop } = await startRadarApi({})
    const res = await put(`${root}/gain`, { auto: false, value: 75 })
    expect(res.status).to.equal(501)
    await stop()
  })

  it("reports the provider's own error rather than a generic message", async () => {
    const { put, stop } = await startRadarApi({
      setControl: async () => ({
        success: false,
        error: 'gain is read-only in auto mode'
      })
    })

    const res = await put(`${root}/gain`, { auto: false, value: 75 })
    expect(res.status).to.equal(400)
    expect((await res.json()).message).to.equal(
      'gain is read-only in auto mode'
    )
    await stop()
  })

  it('still validates before reaching the provider', async () => {
    let called = false
    const { put, stop } = await startRadarApi({
      setControl: async () => {
        called = true
        return { success: true }
      }
    })

    expect((await put(`${root}/power`, { value: 'nonsense' })).status).to.equal(
      400
    )
    expect((await put(`${root}/range`, { value: -1 })).status).to.equal(400)
    expect(called).to.equal(false)
    await stop()
  })
})
