import { expect } from 'chai'
import {
  serverTestConfigDirectory,
  startServerP,
  WsPromiser
} from './servertestutilities'
import { freeport } from './ts-servertestutilities'
import path from 'path'
import { rimraf } from 'rimraf'
import { SERVERSTATEDIRNAME } from '../src/serverstate/store'
import DeltaEditor from '../src/deltaeditor'

const TEST_PATH_DOTS = 'a.test.path'
const TEST_PATH_SLASHES = 'a/test/path'

const emptyConfigDirectory = () =>
  Promise.all(
    [SERVERSTATEDIRNAME, 'resources', 'plugin-config-data', 'baseDeltas.json']
      .map((subDir) => path.join(serverTestConfigDirectory(), subDir))
      .map((dir) => rimraf(dir))
  )

describe('Metadata end to end', function () {
  this.timeout(10000)

  let port: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let v1Api: string

  const getV1 = (p: string) => fetch(`${v1Api}${p}`)
  const selfGetMetaJson = () =>
    getV1(`/vessels/self/${TEST_PATH_SLASHES}/meta`).then((r) => r.json())
  const selfPutV1 = (p: string, body: object) =>
    fetch(`${v1Api}/vessels/self/${p}`, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    })
  const createMetaWsPromiser = () =>
    new WsPromiser(
      `ws://localhost:${port}/signalk/v1/stream?subscribe=self&sendMeta=all&sendCachedValues=false`,
      500
    )

  before(async () => {
    port = await freeport()
    v1Api = `http://localhost:${port}/signalk/v1/api`
    await emptyConfigDirectory()
    server = await startServerP(port, false, {
      settings: {
        interfaces: {
          plugins: false
        }
      }
    })
  })

  after(async () => {
    await server.stop()
  })

  it('sends metadata via websocket, retrieves it over HTTP, adds zones via PUT, receives zones update via websocket, persists across restart, and merges additional metadata', async () => {
    // 1. Send metadata for a.test.path with units=V via websocket
    const sender = new WsPromiser(
      `ws://localhost:${port}/signalk/v1/stream?subscribe=none&metaDeltas=none&sendCachedValues=false`
    )
    await sender.nextMsg() // hello

    await sender.send({
      context: 'vessels.self',
      updates: [
        {
          meta: [
            {
              path: TEST_PATH_DOTS,
              value: { units: 'V' }
            }
          ]
        }
      ]
    })

    // 2. Assert that retrieving metadata over HTTP includes the unit
    const meta1 = await selfGetMetaJson()
    expect(meta1).to.have.property('units', 'V')
    console.log(JSON.stringify(meta1, null, 2))

    // 3. Connect a websocket client that receives meta updates
    const metaReceiver = createMetaWsPromiser()
    await metaReceiver.nextMsg() // hello

    // 4. Simulate a user specifying a zone for high voltage above 14.4V
    const zones = [
      {
        lower: 14.4,
        state: 'alarm',
        message: 'High voltage'
      }
    ]
    // Set up the message promise before triggering the PUT
    const metaMsgPromise = metaReceiver.nextMsg()
    const putResult = await selfPutV1(`${TEST_PATH_SLASHES}/meta/zones`, {
      value: zones
    })
    expect(putResult.status).to.equal(202)

    // 5. Assert that the connected websocket client receives metadata update with zones and unit
    const metaMsg = await metaMsgPromise
    expect(metaMsg).to.not.equal('timeout')
    const metaDelta = JSON.parse(metaMsg)
    expect(metaDelta).to.have.property('updates')
    const metaUpdate = metaDelta.updates[0].meta[0]
    expect(metaUpdate.path).to.equal(TEST_PATH_DOTS)
    expect(metaUpdate.value).to.have.property('units', 'V')
    expect(metaUpdate.value).to.have.property('zones').that.is.an('array')
    expect(metaUpdate.value.zones[0]).to.deep.include({
      lower: 14.4,
      state: 'alarm',
      message: 'High voltage'
    })

    // 6. Restart the server and assert metadata persists
    await server.stop()
    server = await startServerP(port, false, {
      settings: {
        interfaces: {
          plugins: false
        }
      }
    })

    const meta2 = await selfGetMetaJson()
    expect(meta2).to.have.property('units', 'V')
    expect(meta2).to.have.property('zones').that.is.an('array')
    expect(meta2.zones[0]).to.deep.include({
      lower: 14.4,
      state: 'alarm',
      message: 'High voltage'
    })

    // 7. Send additional metadata (description) via websocket
    const sender2 = new WsPromiser(
      `ws://localhost:${port}/signalk/v1/stream?subscribe=none&metaDeltas=none&sendCachedValues=false`
    )
    await sender2.nextMsg() // hello

    await sender2.send({
      context: 'vessels.self',
      updates: [
        {
          meta: [
            {
              path: TEST_PATH_DOTS,
              value: { description: 'A test path' }
            }
          ]
        }
      ]
    })

    // 8. Assert that retrieving metadata over HTTP includes unit, zones, and description
    const meta3 = await selfGetMetaJson()
    expect(meta3).to.have.property('units', 'V')
    expect(meta3).to.have.property('zones').that.is.an('array')
    expect(meta3.zones[0]).to.deep.include({
      lower: 14.4,
      state: 'alarm',
      message: 'High voltage'
    })
    expect(meta3).to.have.property('description', 'A test path')
  })

  it('deletes a metadata field and it does not reappear', async () => {
    const zones = [{ lower: 14.4, state: 'alarm', message: 'High voltage' }]
    const setupResult = await selfPutV1(`${TEST_PATH_SLASHES}/meta/zones`, {
      value: zones
    })
    expect(setupResult.status).to.equal(202)
    await new Promise((resolve) => setTimeout(resolve, 200))

    const metaBefore = await selfGetMetaJson()
    expect(metaBefore).to.have.property('zones')

    const deleteResult = await fetch(
      `${v1Api}/vessels/self/${TEST_PATH_SLASHES}/meta/zones`,
      { method: 'DELETE' }
    )
    expect(deleteResult.status).to.equal(202)

    const metaAfterDelete = await selfGetMetaJson()
    expect(metaAfterDelete).to.not.have.property('zones')

    const putResult = await selfPutV1(`${TEST_PATH_SLASHES}/meta/description`, {
      value: 'Updated description'
    })
    expect(putResult.status).to.equal(202)

    const metaAfterPut = await selfGetMetaJson()
    expect(metaAfterPut).to.not.have.property('zones')
    expect(metaAfterPut).to.have.property('description', 'Updated description')

    await server.stop()
    server = await startServerP(port, false, {
      settings: {
        interfaces: {
          plugins: false
        }
      }
    })

    const metaAfterRestart = await selfGetMetaJson()
    expect(metaAfterRestart).to.not.have.property('zones')
    expect(metaAfterRestart).to.have.property(
      'description',
      'Updated description'
    )
  })
})

describe('setDefaultMetadata per-field merge logic', function () {
  it('sets all fields when no existing metadata', () => {
    const editor = new DeltaEditor()
    const context = 'vessels.self'
    const skPath = 'electrical.batteries.house.energy'

    const existing = editor.getMeta(context, skPath)
    expect(existing).to.be.null

    const value = { units: 'J', description: 'Battery energy' }
    const { hasNewFields, merged } = DeltaEditor.computeDefaultFields(
      existing,
      value
    )
    expect(hasNewFields).to.be.true
    editor.setMeta(context, skPath, merged)

    const result = editor.getMeta(context, skPath)
    expect(result).to.deep.equal({ units: 'J', description: 'Battery energy' })
  })

  it('skips fields already set by the user', () => {
    const editor = new DeltaEditor()
    const context = 'vessels.self'
    const skPath = 'electrical.batteries.house.energy'

    editor.setMeta(context, skPath, { units: 'J', displayName: 'My Energy' })

    const existing = editor.getMeta(context, skPath) as Record<string, unknown>
    const value = {
      units: 'C',
      displayName: 'Default Name',
      description: 'Battery energy'
    }

    const { hasNewFields, fieldsToSet, merged } =
      DeltaEditor.computeDefaultFields(existing, value)

    expect(hasNewFields).to.be.true
    expect(fieldsToSet).to.deep.equal({ description: 'Battery energy' })
    expect(fieldsToSet).to.not.have.property('units')
    expect(fieldsToSet).to.not.have.property('displayName')

    editor.setMeta(context, skPath, merged)

    const result = editor.getMeta(context, skPath)
    expect(result).to.deep.equal({
      units: 'J',
      displayName: 'My Energy',
      description: 'Battery energy'
    })
  })

  it('returns no new fields when all fields already exist', () => {
    const editor = new DeltaEditor()
    const context = 'vessels.self'
    const skPath = 'electrical.batteries.house.energy'

    editor.setMeta(context, skPath, { units: 'J', description: 'Existing' })

    const existing = editor.getMeta(context, skPath) as Record<string, unknown>
    const value = { units: 'C', description: 'New description' }

    const { hasNewFields } = DeltaEditor.computeDefaultFields(existing, value)
    expect(hasNewFields).to.be.false
  })
})
