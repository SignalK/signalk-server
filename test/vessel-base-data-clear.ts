import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

/** The slice of the server's delta cache this test reads. */
interface DeltaCache {
  getSourcesForPath(path: string): string[]
}

const OTHER_SOURCE = 'othersensor.XX'
const NO_VALUE_KEYS = ['value', '$source', 'timestamp', 'values']

/** Resolves once `ready()` holds; deltas from a provider are handled asynchronously. */
const until = async (ready: () => boolean) => {
  for (let i = 0; i < 50 && !ready(); i++) {
    await new Promise((r) => setTimeout(r, 20))
  }
}

const putVessel = (host: string, body: object) =>
  fetch(`${host}/skServer/vessel`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  })

describe('Vessel base data: a cleared field leaves the data model', () => {
  it('drops cleared fields from the REST tree and the delta cache, and keeps the others', async function () {
    const { host, server, selfGetJsonV1, sendADelta, stop } =
      await startServer()
    const { deltaCache } = (
      server as unknown as { app: { deltaCache: DeltaCache } }
    ).app
    try {
      expect(
        (
          await putVessel(host, {
            name: 'Test',
            length: 12,
            beam: 4,
            aisShipType: 36
          })
        ).status
      ).to.equal(200)
      await sendADelta({
        context: 'vessels.self',
        updates: [
          {
            source: { label: 'othersensor', type: 'test' },
            values: [{ path: 'design.airHeight', value: 15 }]
          }
        ]
      })
      await until(
        () => deltaCache.getSourcesForPath('design.airHeight').length > 0
      )
      expect(deltaCache.getSourcesForPath('design.airHeight')).to.deep.equal([
        OTHER_SOURCE
      ])

      expect(
        (await putVessel(host, { name: 'Test', length: 12, beam: '' })).status
      ).to.equal(200)
      const after = (await selfGetJsonV1('design')) as Record<
        string,
        Record<string, unknown> | undefined
      >
      expect(after.beam).to.not.have.any.keys(...NO_VALUE_KEYS)
      expect(deltaCache.getSourcesForPath('design.beam')).to.deep.equal([])
      expect(after.aisShipType).to.not.have.any.keys(...NO_VALUE_KEYS)
      expect(deltaCache.getSourcesForPath('design.aisShipType')).to.deep.equal(
        []
      )
      expect(after.airHeight).to.include({ value: 15, $source: OTHER_SOURCE })
      expect(deltaCache.getSourcesForPath('design.airHeight')).to.deep.equal([
        OTHER_SOURCE
      ])
      expect(after.length?.value).to.deep.equal({ overall: 12 })
      expect(deltaCache.getSourcesForPath('design.length')).to.deep.equal([
        'defaults'
      ])
      expect(await selfGetJsonV1('name')).to.equal('Test')

      expect((await putVessel(host, { length: 12 })).status).to.equal(200)
      expect(
        (await fetch(`${host}/signalk/v1/api/vessels/self/name`)).status
      ).to.equal(404)
    } finally {
      await stop()
    }
  })
})
