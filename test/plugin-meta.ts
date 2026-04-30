import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

/**
 * Regression test: meta deltas emitted by plugins must surface in REST
 * responses end-to-end. Two bugs in the @signalk/path-metadata registry
 * once masked plugin meta — see packages/path-metadata/src/index.ts for
 * the fix. This suite locks in the server pipeline behaviour so the
 * regression cannot return silently.
 */
describe('Plugin meta deltas', function () {
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

  it('a plugin-invented meta-only delta is visible via REST', async function () {
    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'test-plugin',
          timestamp: '2026-04-24T00:00:00.000Z',
          meta: [
            {
              path: 'environment.test.plugin.path',
              value: {
                units: 'V',
                description: 'plugin-supplied description'
              }
            }
          ]
        }
      ]
    })
    // The delta pipeline is async; give the server a beat.
    await new Promise((r) => setTimeout(r, 80))

    const res = await fetch(
      `${host}/signalk/v1/api/vessels/self/environment/test/plugin/path/meta`
    )
    expect(res.status).to.equal(200)
    const meta = await res.json()
    expect(meta.units).to.equal('V')
    expect(meta.description).to.equal('plugin-supplied description')
  })

  it('plugin meta merges with, and overrides, a spec entry', async function () {
    // electrical.batteries.0.capacity.stateOfCharge has a spec entry with
    // units: 'ratio' and a generic description. A plugin that supplies a
    // more specific description should win for description while the
    // spec-provided units remain.
    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'test-plugin',
          timestamp: '2026-04-24T00:00:01.000Z',
          meta: [
            {
              path: 'electrical.batteries.0.capacity.stateOfCharge',
              value: { description: 'State of charge from test-plugin' }
            }
          ]
        }
      ]
    })
    await new Promise((r) => setTimeout(r, 80))

    const res = await fetch(
      `${host}/signalk/v1/api/vessels/self/electrical/batteries/0/capacity/stateOfCharge/meta`
    )
    expect(res.status).to.equal(200)
    const meta = await res.json()
    expect(meta.units).to.equal('ratio')
    expect(meta.description).to.equal('State of charge from test-plugin')
  })

  it('a non-spec sibling of a RegExp-shape entry receives no wildcard inheritance', async function () {
    // electrical.ac.* only has RegExp-shape entries (for named buses).
    // electrical.ac.totalCurrent is not in the spec and should not inherit
    // "AC Bus, one or many, within the vessel".
    await sendADelta({
      context: 'vessels.self',
      updates: [
        {
          $source: 'test-plugin',
          timestamp: '2026-04-24T00:00:02.000Z',
          values: [{ path: 'electrical.ac.totalCurrent', value: 0.42 }]
        }
      ]
    })
    await new Promise((r) => setTimeout(r, 80))

    const res = await fetch(
      `${host}/signalk/v1/api/vessels/self/electrical/ac/totalCurrent/meta`
    )
    // Either 404 (no meta at all) or a meta without the container-level
    // description — both are acceptable. The thing we guard against is the
    // bogus wildcard-inherited description.
    if (res.status === 200) {
      const meta = await res.json()
      expect(meta.description ?? '').to.not.match(/one or many/i)
    } else {
      expect(res.status).to.equal(404)
    }
  })
})
