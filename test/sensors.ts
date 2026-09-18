import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { rimraf } from 'rimraf'
import { startServerFromConfigP } from './servertestutilities'
import {
  freeport,
  SERVER_START_TIMEOUT,
  startServer
} from './ts-servertestutilities'

/** The slice of a started server these tests need for teardown. */
interface ServerHandle {
  stop: () => Promise<unknown>
}

/** The slice of the server's base-delta editor these tests read. */
interface BaseDeltaEditor {
  getSelfValue(path: string): unknown
}

describe('Sensors API - gnss', () => {
  it('GET returns the default (off, no sensors) config with status', async function () {
    const { selfGetJson, stop } = await startServer()
    const data = (await selfGetJson('sensors/gnss')) as {
      correction: string
      sensors: unknown[]
      status: { mode: string; active: boolean; blocked?: string }
    }
    expect(data.correction).to.equal('off')
    expect(data.sensors).to.deep.equal([])
    expect(data.status.mode).to.equal('off')
    expect(data.status.active).to.equal(false)
    await stop()
  })

  it('PUT stores the antenna config and GET reflects it', async function () {
    const { selfPut, selfGetJson, stop } = await startServer()
    const payload = {
      correction: 'off',
      sensors: [
        { sensorId: 'gnss1', $source: 'test.1', fromBow: 3, fromCenter: 0 }
      ]
    }
    const put = await selfPut('sensors/gnss', payload)
    expect(put.status).to.equal(200)
    const body = (await put.json()) as { result: string }
    expect(body.result).to.equal('ok')

    const data = (await selfGetJson('sensors/gnss')) as {
      correction: string
      sensors: Array<{ sensorId: string; fromBow: number }>
    }
    expect(data.correction).to.equal('off')
    expect(data.sensors).to.have.length(1)
    expect(data.sensors[0].sensorId).to.equal('gnss1')
    expect(data.sensors[0].fromBow).to.equal(3)
    await stop()
  })

  it('PUT rejects a duplicate sensorId with 400', async function () {
    const { selfPut, stop } = await startServer()
    const put = await selfPut('sensors/gnss', {
      correction: 'off',
      sensors: [
        { sensorId: 'dup', $source: 'test.1', fromBow: 1, fromCenter: 0 },
        { sensorId: 'dup', $source: 'test.2', fromBow: 2, fromCenter: 0 }
      ]
    })
    expect(put.status).to.equal(400)
    const body = (await put.json()) as { state: string; message: string }
    expect(body.state).to.equal('FAILED')
    expect(body.message).to.match(/Duplicate sensorId/)
    await stop()
  })

  it('PUT rejects an unknown correction mode with 400', async function () {
    const { selfPut, stop } = await startServer()
    const put = await selfPut('sensors/gnss', {
      correction: 'nonsense',
      sensors: []
    })
    expect(put.status).to.equal(400)
    await stop()
  })

  it('DELETE clears the config', async function () {
    const { selfPut, selfDelete, selfGetJson, stop } = await startServer()
    const put = await selfPut('sensors/gnss', {
      correction: 'replace',
      sensors: [
        { sensorId: 'gnss1', $source: 'test.1', fromBow: 3, fromCenter: 0 }
      ]
    })
    expect(put.status).to.equal(200)
    const del = await selfDelete('sensors/gnss')
    expect(del.status).to.equal(200)

    const data = (await selfGetJson('sensors/gnss')) as {
      correction: string
      sensors: unknown[]
    }
    expect(data.correction).to.equal('off')
    expect(data.sensors).to.deep.equal([])
    await stop()
  })

  it('PUT rejects an offset outside the configured hull with 400', async function () {
    const { selfPut, host, stop } = await startServer()
    // Configure vessel dimensions so the bounds check has something to
    // check against (skipped otherwise).
    const vesselPut = await fetch(`${host}/skServer/vessel`, {
      method: 'PUT',
      body: JSON.stringify({ length: 20, beam: 6 }),
      headers: { 'Content-Type': 'application/json' }
    })
    expect(vesselPut.status).to.equal(200)

    const put = await selfPut('sensors/gnss', {
      correction: 'off',
      sensors: [
        { sensorId: 'gnss1', $source: 'test.1', fromBow: 99, fromCenter: 0 }
      ]
    })
    expect(put.status).to.equal(400)
    const body = (await put.json()) as { state: string; message: string }
    expect(body.state).to.equal('FAILED')
    expect(body.message).to.match(/fromBow 99 out of range/)
    await stop()
  })

  it('PUT /skServer/vessel accepts null GNSS offsets', async function () {
    const { host, stop } = await startServer()
    const put = await fetch(`${host}/skServer/vessel`, {
      method: 'PUT',
      body: JSON.stringify({
        length: 20,
        beam: 6,
        gpsFromBow: null,
        gpsFromCenter: null
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    expect(put.status).to.equal(200)

    const vessel = (await (await fetch(`${host}/skServer/vessel`)).json()) as {
      gpsFromBow?: number
      gpsFromCenter?: number
    }
    expect(vessel.gpsFromBow).to.equal(undefined)
    expect(vessel.gpsFromCenter).to.equal(undefined)
    await stop()
  })

  it('does not write legacy offsets once a sensor row owns them', async function () {
    const { host, server, selfPut, stop } = await startServer()
    try {
      await selfPut('sensors/gnss', {
        correction: 'off',
        sensors: [
          { sensorId: 'gnss1', $source: 'test.1', fromBow: 3, fromCenter: 1 }
        ]
      })

      const put = await fetch(`${host}/skServer/vessel`, {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Renamed',
          gpsFromBow: 9,
          gpsFromCenter: 9
        }),
        headers: { 'Content-Type': 'application/json' }
      })
      expect(put.status).to.equal(200)

      // The sensor row is the single owner, so the legacy singleton stays
      // empty rather than becoming a second copy that can disagree with it.
      const { baseDeltaEditor } = (
        server as unknown as {
          app: { config: { baseDeltaEditor: BaseDeltaEditor } }
        }
      ).app.config
      expect(baseDeltaEditor.getSelfValue('sensors.gps.fromBow')).to.equal(
        undefined
      )
      expect(baseDeltaEditor.getSelfValue('sensors.gps.fromCenter')).to.equal(
        undefined
      )
    } finally {
      await stop()
    }
  })

  it('PUT /skServer/vessel keeps a zero GNSS offset as zero', async function () {
    const { host, stop } = await startServer()
    const put = await fetch(`${host}/skServer/vessel`, {
      method: 'PUT',
      body: JSON.stringify({
        length: 20,
        beam: 6,
        gpsFromBow: 0,
        gpsFromCenter: 0
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    expect(put.status).to.equal(200)

    const vessel = (await (await fetch(`${host}/skServer/vessel`)).json()) as {
      gpsFromBow?: number
      gpsFromCenter?: number
    }
    expect(vessel.gpsFromBow).to.equal(0)
    expect(vessel.gpsFromCenter).to.equal(0)
    await stop()
  })
})

// An install predating baseDeltas.json keeps a defaults.json and opts out of
// conversion with useBaseDeltas: false, so PUT /skServer/vessel persists
// through writeOldDefaults rather than the base-delta editor. With no GNSS
// sensor row that file is the only place the offsets can live.
describe('Sensors API - gnss with a legacy defaults file', function () {
  this.timeout(SERVER_START_TIMEOUT)

  // PUT /vessel rejects an offset outside the hull, so the payload has to
  // carry a length for a zero offset to be inside it.
  const HULL_LENGTH_M = 20

  let port: number
  let server: ServerHandle | undefined
  let configDir: string | undefined

  const storedOffsets = () => {
    if (configDir === undefined) {
      throw new Error('before hook did not create a configuration directory')
    }
    const defaults = JSON.parse(
      fs.readFileSync(path.join(configDir, 'defaults.json'), 'utf8')
    )
    return defaults?.vessels?.self?.sensors?.gps
  }

  before(async () => {
    port = await freeport()
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-gnss-legacy-'))
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
      JSON.stringify({ vessels: { self: { name: 'legacy' } } })
    )
    server = await startServerFromConfigP(configDir)
  })

  // A rejected `before` still runs this hook, so an unassigned server must
  // not throw here and mask the setup failure, nor strand the temp directory.
  after(async () => {
    try {
      await server?.stop()
    } finally {
      if (configDir !== undefined) {
        await rimraf(configDir)
      }
    }
  })

  it('keeps a zero GNSS offset in the defaults file', async () => {
    const put = await fetch(`http://localhost:${port}/skServer/vessel`, {
      method: 'PUT',
      body: JSON.stringify({
        length: HULL_LENGTH_M,
        gpsFromBow: 0,
        gpsFromCenter: 0
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    expect(put.status).to.equal(200)

    expect(storedOffsets()?.fromBow?.value).to.equal(0)
    expect(storedOffsets()?.fromCenter?.value).to.equal(0)
  })
})

// The same legacy defaults file, but with a GNSS row configured. The row owns
// the offsets, so a vessel save must not copy them into the singleton the
// sensors API does not sweep.
describe('Sensors API - gnss with a legacy defaults file and a sensor row', function () {
  this.timeout(SERVER_START_TIMEOUT)

  const HULL_LENGTH_M = 20

  let port: number
  let server: ServerHandle | undefined
  let configDir: string | undefined

  const storedOffsets = () => {
    if (configDir === undefined) {
      throw new Error('before hook did not create a configuration directory')
    }
    const defaults = JSON.parse(
      fs.readFileSync(path.join(configDir, 'defaults.json'), 'utf8')
    )
    return defaults?.vessels?.self?.sensors?.gps
  }

  before(async () => {
    port = await freeport()
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-gnss-legacy-row-'))
    fs.writeFileSync(
      path.join(configDir, 'settings.json'),
      JSON.stringify({
        port,
        interfaces: { plugins: false },
        useBaseDeltas: false,
        pipedProviders: [],
        gnssSensors: [
          { sensorId: 'gnss1', $source: 'test.1', fromBow: 3, fromCenter: 1 }
        ]
      })
    )
    fs.writeFileSync(
      path.join(configDir, 'defaults.json'),
      JSON.stringify({ vessels: { self: { name: 'legacy' } } })
    )
    server = await startServerFromConfigP(configDir)
  })

  after(async () => {
    try {
      await server?.stop()
    } finally {
      if (configDir !== undefined) {
        await rimraf(configDir)
      }
    }
  })

  it('leaves the defaults file singleton alone', async () => {
    const put = await fetch(`http://localhost:${port}/skServer/vessel`, {
      method: 'PUT',
      body: JSON.stringify({
        length: HULL_LENGTH_M,
        gpsFromBow: 9,
        gpsFromCenter: 9
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    expect(put.status).to.equal(200)

    expect(storedOffsets()?.fromBow?.value).to.equal(undefined)
    expect(storedOffsets()?.fromCenter?.value).to.equal(undefined)
  })
})
