import { expect } from 'chai'
import { applyControl } from '../../src/api/radar'
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
