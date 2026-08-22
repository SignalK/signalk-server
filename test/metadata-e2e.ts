import { expect } from 'chai'
import {
  serverTestConfigDirectory,
  startServerFromConfigP,
  startServerP,
  WsPromiser
} from './servertestutilities'
import { freeport, SERVER_START_TIMEOUT } from './ts-servertestutilities'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { rimraf } from 'rimraf'
import { SERVERSTATEDIRNAME } from '../src/serverstate/store'
import DeltaEditor from '../src/deltaeditor'
import { DisplayUnitsMetadata } from '../src/unitpreferences/types'

const TEST_PATH_DOTS = 'a.test.path'
const TEST_PATH_SLASHES = 'a/test/path'
// A speed path no other suite reads: meta deltas land in a process-wide
// registry that outlives the server they were sent to.
const SPEED_PATH_DOTS = 'performance.velocityMadeGoodToWaypoint'
const SPEED_PATH_SLASHES = 'performance/velocityMadeGoodToWaypoint'

// A metadata PUT answers 202 before it persists anything; the write is done
// once the request the response links to leaves PENDING.
const REQUEST_DEADLINE_MS = 5000
const REQUEST_POLL_MS = 10
// WsPromiser resolves 'timeout' after this much silence.
const WS_MESSAGE_TIMEOUT_MS = 500

type ServerHandle = { stop: () => Promise<unknown> }

const awaitPutSuccess = async (port: number, response: Response) => {
  expect(response.status).to.equal(202)
  const { href } = (await response.json()) as { href: string }
  const until = Date.now() + REQUEST_DEADLINE_MS
  let request = { state: 'PENDING', statusCode: 202 }
  while (Date.now() < until) {
    request = (await fetch(`http://localhost:${port}${href}`).then((r) =>
      r.json()
    )) as { state: string; statusCode: number }
    if (request.state !== 'PENDING') {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, REQUEST_POLL_MS))
  }
  // A finished handler reports COMPLETED either way; the status code says
  // whether the write succeeded.
  expect(request.state).to.equal('COMPLETED')
  expect(request.statusCode).to.equal(200)
}

const emptyConfigDirectory = () =>
  Promise.all(
    [SERVERSTATEDIRNAME, 'resources', 'plugin-config-data', 'baseDeltas.json']
      .map((subDir) => path.join(serverTestConfigDirectory(), subDir))
      .map((dir) => rimraf(dir))
  )

describe('Metadata end to end', function () {
  this.timeout(SERVER_START_TIMEOUT)

  let port: number
  let server: ServerHandle
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
      WS_MESSAGE_TIMEOUT_MS
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
    await awaitPutSuccess(port, setupResult)

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

// The active preset is nautical-metric: speeds in knots, formatted "0.0".
const PRESET_SPEED_UNIT = 'kn'

describe('Display unit metadata', function () {
  this.timeout(SERVER_START_TIMEOUT)

  let port: number
  let server: ServerHandle
  let v1Api: string

  const putSpeedMeta = async (
    displayUnits: DisplayUnitsMetadata,
    description?: string
  ) => {
    const result = await fetch(
      `${v1Api}/vessels/self/${SPEED_PATH_SLASHES}/meta`,
      {
        method: 'PUT',
        body: JSON.stringify({
          value: { units: 'm/s', description, displayUnits }
        }),
        headers: { 'Content-Type': 'application/json' }
      }
    )
    await awaitPutSuccess(port, result)
  }

  const servedDisplayUnits = async (skPath = SPEED_PATH_SLASHES) => {
    const meta = await fetch(`${v1Api}/vessels/self/${skPath}/meta`).then((r) =>
      r.json()
    )
    return meta.displayUnits
  }

  const storedDisplayUnits = (): DisplayUnitsMetadata | undefined => {
    const deltas = JSON.parse(
      fs.readFileSync(
        path.join(serverTestConfigDirectory(), 'baseDeltas.json'),
        'utf8'
      )
    )
    for (const delta of deltas) {
      for (const update of delta.updates || []) {
        for (const meta of update.meta || []) {
          if (meta.path === SPEED_PATH_DOTS) {
            return meta.value.displayUnits
          }
        }
      }
    }
    return undefined
  }

  before(async () => {
    port = await freeport()
    v1Api = `http://localhost:${port}/signalk/v1/api`
    await emptyConfigDirectory()
    server = await startServerP(port, false, {
      settings: { interfaces: { plugins: false } }
    })
  })

  after(async () => {
    await server.stop()
    await rimraf(path.join(serverTestConfigDirectory(), 'baseDeltas.json'))
  })

  it('stores no override when the metadata carries the preset unit', async () => {
    await putSpeedMeta({
      category: 'speed',
      targetUnit: PRESET_SPEED_UNIT,
      formula: 'value * 1.94384',
      inverseFormula: 'value * 0.514444',
      symbol: PRESET_SPEED_UNIT,
      displayFormat: '0.0'
    })
    expect(storedDisplayUnits()).to.deep.equal({ category: 'speed' })
  })

  it('stores a target unit that differs from the preset unit', async () => {
    await putSpeedMeta({
      category: 'speed',
      targetUnit: 'm/s',
      formula: 'value',
      inverseFormula: 'value',
      symbol: 'm/s',
      displayFormat: '0.0'
    })
    expect(storedDisplayUnits()).to.deep.equal({
      category: 'speed',
      targetUnit: 'm/s'
    })
  })

  it('keeps the stored target unit when other metadata changes', async () => {
    await putSpeedMeta(
      {
        category: 'speed',
        targetUnit: 'm/s',
        formula: 'value',
        inverseFormula: 'value',
        symbol: 'm/s',
        displayFormat: '0.0'
      },
      'Apparent wind speed'
    )
    expect(storedDisplayUnits()).to.deep.equal({
      category: 'speed',
      targetUnit: 'm/s'
    })
  })

  it('stores the preset unit when it is stated as an override', async () => {
    await putSpeedMeta({ category: 'speed', targetUnit: PRESET_SPEED_UNIT })
    expect(storedDisplayUnits()).to.deep.equal({
      category: 'speed',
      targetUnit: PRESET_SPEED_UNIT
    })
  })

  it('drops an override the metadata no longer states', async () => {
    await putSpeedMeta({ category: 'speed' })
    expect(storedDisplayUnits()).to.deep.equal({ category: 'speed' })
  })

  it('names the path override in the resolved metadata', async () => {
    await putSpeedMeta({ category: 'speed', targetUnit: 'm/s' })
    expect(await servedDisplayUnits()).to.include({
      targetUnit: 'm/s',
      symbol: 'm/s'
    })
    expect((await servedDisplayUnits()).override).to.deep.equal({
      targetUnit: 'm/s'
    })
  })

  it('leaves the override empty for a path that follows the preset', async () => {
    const displayUnits = await servedDisplayUnits('navigation/speedOverGround')
    expect(displayUnits.targetUnit).to.equal(PRESET_SPEED_UNIT)
    expect(displayUnits.override).to.deep.equal({})
  })

  it('keeps the override a resolved response is saved back with', async () => {
    await putSpeedMeta({
      category: 'speed',
      targetUnit: PRESET_SPEED_UNIT,
      formula: 'value * 1.94384',
      inverseFormula: 'value * 0.514444',
      symbol: PRESET_SPEED_UNIT,
      displayFormat: '0.0',
      override: { targetUnit: PRESET_SPEED_UNIT }
    })
    expect(storedDisplayUnits()).to.deep.equal({
      category: 'speed',
      targetUnit: PRESET_SPEED_UNIT
    })
  })

  it('drops what a resolved response says the path does not own', async () => {
    await putSpeedMeta({
      category: 'speed',
      targetUnit: 'm/s',
      formula: 'value',
      inverseFormula: 'value',
      symbol: 'm/s',
      displayFormat: '0.0',
      override: {}
    })
    expect(storedDisplayUnits()).to.deep.equal({ category: 'speed' })
  })

  it('sends the resolved conversion to connected clients', async () => {
    const receiver = new WsPromiser(
      `ws://localhost:${port}/signalk/v1/stream?subscribe=self&sendMeta=all&sendCachedValues=false`,
      WS_MESSAGE_TIMEOUT_MS
    )
    await receiver.nextMsg() // hello
    const metaMsgPromise = receiver.nextMsg()

    await putSpeedMeta({ category: 'speed', targetUnit: 'm/s' })

    const metaMsg = await metaMsgPromise
    expect(metaMsg).to.not.equal('timeout')
    const metaUpdate = JSON.parse(metaMsg).updates[0].meta[0]
    expect(metaUpdate.path).to.equal(SPEED_PATH_DOTS)
    expect(metaUpdate.value.displayUnits).to.include({
      category: 'speed',
      targetUnit: 'm/s',
      symbol: 'm/s',
      formula: 'value'
    })
  })

  it('stores a custom unit with its conversion', async () => {
    await putSpeedMeta({
      category: 'custom',
      targetUnit: 'Bf',
      formula: '(value / 0.836)^(2/3)',
      inverseFormula: '0.836 * value^1.5',
      symbol: 'Bf'
    })
    expect(storedDisplayUnits()).to.deep.equal({
      category: 'custom',
      targetUnit: 'Bf',
      formula: '(value / 0.836)^(2/3)',
      inverseFormula: '0.836 * value^1.5',
      symbol: 'Bf'
    })
  })
})

// A config directory from before baseDeltas.json holds a defaults.json and
// opts out of conversion with useBaseDeltas: false. Metadata PUTs then
// persist through the defaults-file branch of putMetaHandler, which must
// apply the same displayUnits normalization as the base-deltas branch.
describe('Display unit metadata with a legacy defaults file', function () {
  this.timeout(SERVER_START_TIMEOUT)

  let port: number
  let server: ServerHandle
  let configDir: string

  const storedLegacyMeta = () => {
    const defaults = JSON.parse(
      fs.readFileSync(path.join(configDir, 'defaults.json'), 'utf8')
    )
    return SPEED_PATH_DOTS.split('.').reduce(
      (node, key) => node?.[key],
      defaults?.vessels?.self
    )?.meta
  }

  before(async () => {
    port = await freeport()
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-legacy-'))
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

  after(async () => {
    await server.stop()
    await rimraf(configDir)
  })

  // The single-field form: metaValue is a fresh merge here, so nothing
  // aliases the raw request value into the normalized object.
  it('strips preset-derived fields before writing the defaults file', async () => {
    const result = await fetch(
      `http://localhost:${port}/signalk/v1/api/vessels/self/${SPEED_PATH_SLASHES}/meta/displayUnits`,
      {
        method: 'PUT',
        body: JSON.stringify({
          value: {
            category: 'speed',
            targetUnit: PRESET_SPEED_UNIT,
            formula: 'value * 1.94384',
            inverseFormula: 'value * 0.514444',
            symbol: PRESET_SPEED_UNIT,
            displayFormat: '0.0'
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      }
    )
    await awaitPutSuccess(port, result)

    expect(storedLegacyMeta().displayUnits).to.deep.equal({
      category: 'speed'
    })
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
