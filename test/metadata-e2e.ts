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
})
