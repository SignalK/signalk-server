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

const RADAR_ID = 'radar-0'

/**
 * A RadarProviderMethods carrying only the two members the interface requires,
 * plus whatever the test under discussion needs. Object.assign rather than a
 * spread so the required members stay non-optional and no cast is needed.
 */
function methods(
  overrides: Partial<radar.RadarProviderMethods> = {}
): radar.RadarProviderMethods {
  const base: radar.RadarProviderMethods = {
    getRadars: async () => [RADAR_ID],
    getRadarInfo: async () => null
  }
  return Object.assign(base, overrides)
}

/** The provider wrapper, built from a real RadarProviderMethods. */
function provider(
  overrides: Partial<radar.RadarProviderMethods> = {}
): radar.RadarProvider {
  return { name: 'Test Radar Provider', methods: methods(overrides) }
}

/** One nautical mile in metres — a range every marine radar supports. */
const ONE_NM_METRES = 1852

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
    const result = await applyControl(provider, RADAR_ID, 'gain', payload)

    expect(result.success).to.equal(true)
    expect(seen).to.deep.equal([[RADAR_ID, 'gain', payload]])
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

    await applyControl(
      provider,
      'radar-0',
      'range',
      ONE_NM_METRES,
      async () => {
        usedLegacy = true
        return true
      }
    )
    expect(usedLegacy).to.equal(false)
  })

  it('falls back to the typed method when setControl is absent', async () => {
    let usedLegacy = false
    const provider = methods({})

    const result = await applyControl(
      provider,
      'radar-0',
      'range',
      ONE_NM_METRES,
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
      ONE_NM_METRES,
      async () => false
    )
    expect(result.success).to.equal(false)
  })

  it('surfaces the error a provider returns from setControl', async () => {
    const provider = methods({
      setControl: async () => ({ success: false, error: 'range not settable' })
    })
    const result = await applyControl(
      provider,
      'radar-0',
      'range',
      ONE_NM_METRES
    )
    expect(result).to.deep.equal({
      success: false,
      error: 'range not settable'
    })
  })

  it('fails clearly when the provider supports neither path', async () => {
    const result = await applyControl(methods({}), RADAR_ID, 'gain', {
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
  const root = `/signalk/v2/api/vessels/self/radars/${RADAR_ID}`

  // A failed assertion skips any cleanup at the end of a test body, and a
  // still-listening server keeps the mocha process alive. Close them here
  // instead, so a failure reports as a failure rather than as a hang.
  const started: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (started.length) await started.pop()!()
  })

  async function startRadarApi(overrides: Partial<radar.RadarProviderMethods>) {
    const app = Object.assign(express(), {
      securityStrategy: { shouldAllowPut: () => true }
    })
    app.use(express.json())

    // The one unavoidable seam: RadarApi's application type also extends
    // SignalKMessageHub, which express cannot satisfy and which the radar
    // routes never touch — they use only the router methods and
    // securityStrategy, both of which `app` really does provide.
    const api = new RadarApi(
      app as unknown as ConstructorParameters<typeof RadarApi>[0]
    )
    await api.start()
    api.register(
      'test-provider',
      provider({
        getRadarInfo: async () => ({
          name: 'Test',
          brand: 'Test',
          radarIpAddress: '10.0.0.1'
        }),
        ...overrides
      })
    )

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
        })
    }
  }

  it('forwards each shortcut to setControl with its control id', async () => {
    const seen: Array<[string, unknown]> = []
    const { put } = await startRadarApi({
      setControl: async (_id, controlId, value) => {
        seen.push([controlId, value])
        return { success: true }
      }
    })

    expect((await put(`${root}/power`, { value: 'transmit' })).status).to.equal(
      200
    )
    expect(
      (await put(`${root}/range`, { value: ONE_NM_METRES })).status
    ).to.equal(200)
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
      ['range', ONE_NM_METRES],
      ['gain', { auto: false, value: 75 }],
      ['sea', { auto: true, autoValue: -20 }],
      ['rain', { auto: false, value: 30 }]
    ])
  })

  it('works for a provider that implements only the typed methods', async () => {
    let gain: unknown
    const { put } = await startRadarApi({
      setGain: async (_id, value) => {
        gain = value
        return true
      }
    })

    const res = await put(`${root}/gain`, { auto: false, value: 75 })
    expect(res.status).to.equal(200)
    expect(gain).to.deep.equal({ auto: false, value: 75 })
  })

  it('returns 501 when the provider supports neither path', async () => {
    const { put } = await startRadarApi({})
    const res = await put(`${root}/gain`, { auto: false, value: 75 })
    expect(res.status).to.equal(501)
  })

  it("reports the provider's own error rather than a generic message", async () => {
    const { put } = await startRadarApi({
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
  })

  it('still validates before reaching the provider', async () => {
    let called = false
    const { put } = await startRadarApi({
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
  })
})
