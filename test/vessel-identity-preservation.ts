import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freeport, SERVER_START_TIMEOUT } from './ts-servertestutilities'
import { startServerFromConfigP } from './servertestutilities'

const UUID = 'urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d'
const MMSI = '244123456'
interface ServerHandle {
  stop(): Promise<void>
}
interface VesselInfo {
  name?: string
  uuid?: string
  mmsi?: string
  length?: number
}

describe('Vessel identity: retaining the UUID alongside MMSI', function () {
  this.timeout(SERVER_START_TIMEOUT)
  for (const legacy of [false, true]) {
    it(`retains and restores the UUID with ${legacy ? 'defaults.json' : 'baseDeltas.json'}`, async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-vessel-identity-'))
      const previousConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
      const previousDisableUpdates = process.env.SIGNALK_DISABLE_SERVER_UPDATES
      let host = ''
      const usedPorts = new Set<number>()
      const start = async (): Promise<ServerHandle> => {
        let port = await freeport()
        while (usedPorts.has(port)) port = await freeport()
        usedPorts.add(port)
        host = `http://localhost:${port}`
        fs.writeFileSync(
          path.join(dir, 'settings.json'),
          JSON.stringify({
            port,
            interfaces: { plugins: false },
            mdns: false,
            useBaseDeltas: !legacy,
            pipedProviders: []
          })
        )
        delete require.cache[path.join(dir, 'settings.json')]
        return startServerFromConfigP(dir)
      }
      fs.writeFileSync(
        path.join(dir, 'defaults.json'),
        JSON.stringify({
          vessels: { self: { name: 'Identity test', uuid: UUID } }
        })
      )
      let server: ServerHandle | undefined
      const info = async (): Promise<VesselInfo> =>
        (await fetch(`${host}/skServer/vessel`).then((r) =>
          r.json()
        )) as VesselInfo
      const save = (body: VesselInfo) =>
        fetch(`${host}/skServer/vessel`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
      const file = path.join(dir, legacy ? 'defaults.json' : 'baseDeltas.json')
      try {
        server = await start()
        expect((await info()).uuid).to.equal(UUID)
        expect(
          (
            await save({
              name: 'Identity test',
              uuid: UUID,
              mmsi: MMSI,
              length: 12
            })
          ).status
        ).to.equal(200)
        expect(await info()).to.include({ uuid: UUID, mmsi: MMSI })
        expect(fs.readFileSync(file, 'utf8')).to.include(UUID)
        await server.stop()
        server = undefined
        server = await start()
        expect(
          await fetch(`${host}/signalk/v1/api/self`).then((r) => r.json())
        ).to.equal(`vessels.urn:mrn:imo:mmsi:${MMSI}`)
        expect(await info()).to.include({ uuid: UUID, mmsi: MMSI })
        expect((await save({ ...(await info()), mmsi: '' })).status).to.equal(
          200
        )
        expect((await info()).uuid).to.equal(UUID)
        expect(fs.readFileSync(file, 'utf8')).to.include(UUID)
        await server.stop()
        server = undefined
        server = await start()
        expect(
          await fetch(`${host}/signalk/v1/api/self`).then((r) => r.json())
        ).to.equal(`vessels.${UUID}`)
      } finally {
        await server?.stop()
        delete require.cache[path.join(dir, 'settings.json')]
        fs.rmSync(dir, { recursive: true, force: true })
        if (previousConfigDir === undefined)
          delete process.env.SIGNALK_NODE_CONFIG_DIR
        else process.env.SIGNALK_NODE_CONFIG_DIR = previousConfigDir
        if (previousDisableUpdates === undefined)
          delete process.env.SIGNALK_DISABLE_SERVER_UPDATES
        else process.env.SIGNALK_DISABLE_SERVER_UPDATES = previousDisableUpdates
      }
    })
  }
})
