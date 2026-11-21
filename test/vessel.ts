import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { rimraf } from 'rimraf'
import { getMetadata } from '@signalk/path-metadata'
import { HullTypeSchema } from '@signalk/server-api/typebox'
import { startServerFromConfigP } from './servertestutilities'
import { freeport, startServer } from './ts-servertestutilities'

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
    aisShipType?: number
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

describe('Vessel base data: ship type (design.aisShipType)', () => {
  it('clears the ship type when empty', async function () {
    const { host, stop } = await startServer()
    try {
      expect(
        (await putVessel(host, { name: 'Cat', aisShipType: '36' })).status
      ).to.equal(200)
      expect((await getVessel(host)).aisShipType).to.equal(36)

      expect(
        (await putVessel(host, { name: 'Cat', aisShipType: '' })).status
      ).to.equal(200)
      expect((await getVessel(host)).aisShipType).to.equal(undefined)
    } finally {
      await stop()
    }
  })

  it('stores the name with the ship type', async function () {
    const { host, selfGetJsonV1, stop } = await startServer()
    try {
      expect(
        (await putVessel(host, { name: 'Cat', aisShipType: '36' })).status
      ).to.equal(200)
      expect(await selfGetJsonV1('design/aisShipType/value')).to.deep.equal({
        name: 'Sailing',
        id: 36
      })
    } finally {
      await stop()
    }
  })

  it('saves an empty ship type to a legacy defaults file without design data', async function () {
    const port = await freeport()
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-vessel-'))
    fs.writeFileSync(
      path.join(configDir, 'settings.json'),
      JSON.stringify({
        port,
        interfaces: { plugins: false },
        useBaseDeltas: false,
        pipedProviders: []
      })
    )
    fs.writeFileSync(
      path.join(configDir, 'defaults.json'),
      JSON.stringify({ vessels: { self: { name: 'Cat' } } })
    )
    let server: { stop: () => Promise<void> } | undefined
    try {
      server = await startServerFromConfigP(configDir)
      const put = await putVessel(`http://localhost:${port}`, {
        name: 'Cat',
        aisShipType: ''
      })
      expect(put.status).to.equal(200)
    } finally {
      await server?.stop()
      await rimraf(configDir)
    }
  })
})
