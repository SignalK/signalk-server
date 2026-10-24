import { expect } from 'chai'
import { getMetadata } from '@signalk/path-metadata'
import { HullTypeSchema } from '@signalk/server-api/typebox'
import { startServer } from './ts-servertestutilities'

const HULL_TYPES = HullTypeSchema.anyOf.map((t) => t.const)

const putVessel = (host: string, body: object) =>
  fetch(`${host}/skServer/vessel`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  })

const getVessel = async (host: string) =>
  (await (await fetch(`${host}/skServer/vessel`)).json()) as {
    name?: string
    hullType?: string
  }

describe('Vessel base data: hull type (design.hullType)', () => {
  it('stores a hull type, serves it on /vessel and in the data model, and clears it when empty', async function () {
    const { host, selfGetJsonV1, stop } = await startServer()
    try {
      const put = await putVessel(host, { name: 'Cat', hullType: 'catamaran' })
      expect(put.status).to.equal(200)
      expect((await getVessel(host)).hullType).to.equal('catamaran')
      const leaf = (await selfGetJsonV1('design/hullType')) as {
        value?: string
        $source?: string
        meta?: { enum?: string[] }
      }
      expect(leaf).to.include({ value: 'catamaran', $source: 'defaults' })
      expect(leaf.meta?.enum).to.deep.equal(HULL_TYPES)

      const cleared = await putVessel(host, { name: 'Cat', hullType: '' })
      expect(cleared.status).to.equal(200)
      expect((await getVessel(host)).hullType).to.equal(undefined)
    } finally {
      await stop()
    }
  })

  it('refuses a value outside the list with 400 and changes nothing', async function () {
    const { host, stop } = await startServer()
    try {
      expect(
        (await putVessel(host, { name: 'Before', hullType: 'trimaran' })).status
      ).to.equal(200)

      const put = await putVessel(host, {
        name: 'After',
        hullType: 'sailing catamaran'
      })
      expect(put.status).to.equal(400)
      expect(await put.text()).to.match(
        /hullType must be one of monohull, catamaran, trimaran/
      )
      const vessel = await getVessel(host)
      expect(vessel.name).to.equal('Before')
      expect(vessel.hullType).to.equal('trimaran')
    } finally {
      await stop()
    }
  })

  it('lists the same hull types in server-api and path-metadata', () => {
    expect(HULL_TYPES).to.deep.equal(['monohull', 'catamaran', 'trimaran'])
    expect(getMetadata('vessels.self.design.hullType')?.enum).to.deep.equal(
      HULL_TYPES
    )
  })
})
