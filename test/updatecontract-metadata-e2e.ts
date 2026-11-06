import { expect } from 'chai'
import { getMetadata } from '@signalk/path-metadata'
import { awaitPutSuccess, freeport } from './ts-servertestutilities'
import { startServerP, sendDelta, WsPromiser } from './servertestutilities'

// Update contracts live in the path metadata registry, inherited by every
// path under a declaring subtree. These assertions run against a real server
// so both transports are covered: a client reading metadata over REST and one
// receiving it over the websocket must see the same contract, without either
// reimplementing the classification.

const SERVER_START_TIMEOUT_MS = 90000
const TEST_TIMEOUT_MS = 30000
const SETTLE_MS = 1500
const POLL_INTERVAL_MS = 100
// Leaves room for the assertions and teardown after polling stops.
const POST_POLL_MARGIN_MS = 1000

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('update contracts in path metadata', function () {
  let server: Awaited<ReturnType<typeof startServerP>> | undefined
  let port: number

  const runningServer = () => {
    if (!server) throw new Error('server was not started')
    return server
  }

  before(async function () {
    this.timeout(SERVER_START_TIMEOUT_MS)
    port = await freeport()
    server = await startServerP(port, false, {
      settings: { interfaces: { plugins: false } }
    })
  })

  after(async function () {
    await server?.stop()
  })

  const metaOverRest = async (path: string) => {
    const url =
      `http://localhost:${port}/signalk/v1/api/vessels/self/` +
      `${path.split('.').join('/')}/meta`
    const res = await fetch(url)
    expect(res.ok, `GET ${path}/meta returned ${res.status}`).to.equal(true)
    const body: unknown = await res.json()
    expect(body).to.be.an('object')
    return body as { updateContract?: unknown }
  }

  const putMeta = async (path: string, value: Record<string, unknown>) => {
    const url =
      `http://localhost:${port}/signalk/v1/api/vessels/self/` +
      `${path.split('.').join('/')}/meta`
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    })
    await awaitPutSuccess(port, res)
  }

  const savedMeta = (path: string) =>
    (
      runningServer().app as unknown as {
        config: {
          baseDeltaEditor: {
            getMeta: (
              context: string,
              path: string
            ) => Record<string, unknown> | undefined
          }
        }
      }
    ).config.baseDeltaEditor.getMeta('vessels.self', path)

  it('does not save an inherited contract sent back with other metadata', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    await putMeta('navigation.anchor.maxRadius', {
      description: 'Swing radius',
      updateContract: 'event'
    })

    expect(savedMeta('navigation.anchor.maxRadius')).to.deep.equal({
      description: 'Swing radius'
    })
    expect(
      (await metaOverRest('navigation.anchor.maxRadius')).updateContract
    ).to.equal('event')
  })

  it('saves a contract that differs from the inherited one', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    await putMeta('navigation.anchor.currentRadius', {
      updateContract: 'periodic'
    })

    expect(savedMeta('navigation.anchor.currentRadius')).to.deep.equal({
      updateContract: 'periodic'
    })
    expect(
      (await metaOverRest('navigation.anchor.currentRadius')).updateContract
    ).to.equal('periodic')
  })

  it('keeps a contract set on its own even when it matches the inherited one', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    const url =
      `http://localhost:${port}/signalk/v1/api/vessels/self/` +
      'navigation/anchor/position/meta/updateContract'
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'event' })
    })
    await awaitPutSuccess(port, res)

    expect(savedMeta('navigation.anchor.position')).to.deep.equal({
      updateContract: 'event'
    })
  })

  it('deletes metadata saved for a path the registry does not know', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    const editor = (
      runningServer().app as unknown as {
        config: {
          baseDeltaEditor: {
            setMeta: (context: string, path: string, value: object) => void
          }
        }
      }
    ).config.baseDeltaEditor
    editor.setMeta('vessels.self', 'zzzUnregistered.first', {
      timeout: 5,
      description: 'x'
    })
    editor.setMeta('vessels.self', 'zzzUnregistered.second', { timeout: 5 })
    const base = `http://localhost:${port}/signalk/v1/api/vessels/self/zzzUnregistered`

    const field = await fetch(`${base}/first/meta/timeout`, {
      method: 'DELETE'
    })
    await awaitPutSuccess(port, field)
    expect(savedMeta('zzzUnregistered.first')).to.deep.equal({
      description: 'x'
    })

    const whole = await fetch(`${base}/second/meta`, { method: 'DELETE' })
    await awaitPutSuccess(port, whole)
    expect(savedMeta('zzzUnregistered.second')).to.equal(undefined)
  })

  it('rejects a contract other than periodic or event', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    const base =
      `http://localhost:${port}/signalk/v1/api/vessels/self/` +
      'navigation/anchor/bearingTrue/meta'
    const field = await fetch(`${base}/updateContract`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'manual' })
    })
    expect(field.status).to.equal(400)
    const whole = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: { updateContract: 'manual' } })
    })
    expect(whole.status).to.equal(400)
    expect(savedMeta('navigation.anchor.bearingTrue')).to.equal(undefined)
  })

  it('restores the shipped contract when an override is deleted', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    await putMeta('sensors.gps.fromBow', { updateContract: 'periodic' })
    expect(
      getMetadata('vessels.self.sensors.gps.fromBow')?.updateContract
    ).to.equal('periodic')

    const res = await fetch(
      `http://localhost:${port}/signalk/v1/api/vessels/self/` +
        'sensors/gps/fromBow/meta/updateContract',
      { method: 'DELETE' }
    )
    await awaitPutSuccess(port, res)

    const restored = getMetadata('vessels.self.sensors.gps.fromBow')
    expect(restored?.updateContract).to.equal('event')
    expect(restored?.units).to.equal('m')
    expect((await metaOverRest('sensors.gps.fromBow')).updateContract).to.equal(
      'event'
    )
  })

  it('reports an inherited contract over the REST metadata API', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    await sendDelta(
      {
        context: `vessels.${runningServer().app.selfId}`,
        updates: [
          {
            source: { label: 'contract-e2e' },
            timestamp: new Date().toISOString(),
            values: [
              {
                path: 'navigation.anchor.position',
                value: { latitude: 1, longitude: 2 }
              },
              { path: 'navigation.speedOverGround', value: 1.2 }
            ]
          }
        ]
      },
      `http://localhost:${port}/signalk/v1/api/_test/delta`
    )
    await delay(SETTLE_MS)

    // navigation.anchor is declared event-driven; the position under it has
    // its own registry entry but no contract, so it inherits one.
    expect(
      (await metaOverRest('navigation.anchor.position')).updateContract
    ).to.equal('event')
    // Nothing declares speedOverGround, so it stays periodic by default and
    // carries no contract of its own.
    expect(
      (await metaOverRest('navigation.speedOverGround')).updateContract
    ).to.equal(undefined)
  })

  it('carries the same contract in metadata sent over the websocket', async function () {
    this.timeout(TEST_TIMEOUT_MS)

    const promiser = new WsPromiser(
      `ws://localhost:${port}/signalk/v1/stream?subscribe=all&sendMeta=all`
    )
    await promiser.nextMsg() // hello

    await sendDelta(
      {
        context: `vessels.${runningServer().app.selfId}`,
        updates: [
          {
            source: { label: 'contract-ws' },
            timestamp: new Date().toISOString(),
            values: [
              {
                path: 'navigation.anchor.position',
                value: { latitude: 3, longitude: 4 }
              }
            ]
          }
        ]
      },
      `http://localhost:${port}/signalk/v1/api/_test/delta`
    )
    // A fixed delay races the delta under CI load, so wait for the message
    // itself and let the test timeout bound it.
    interface MetaEntry {
      path?: string
      value?: { updateContract?: unknown }
    }
    interface DeltaMessage {
      updates?: Array<{ meta?: MetaEntry[] }>
    }

    const contractsSoFar = (): Record<string, unknown> => {
      const found: Record<string, unknown> = {}
      for (const msg of promiser.parsedMessages() as DeltaMessage[]) {
        for (const update of msg?.updates ?? []) {
          for (const entry of update?.meta ?? []) {
            if (entry?.path && entry.value?.updateContract !== undefined) {
              found[entry.path] = entry.value.updateContract
            }
          }
        }
      }
      return found
    }

    let contracts = contractsSoFar()
    const deadline = Date.now() + TEST_TIMEOUT_MS - POST_POLL_MARGIN_MS
    while (
      contracts['navigation.anchor.position'] === undefined &&
      Date.now() < deadline
    ) {
      await delay(POLL_INTERVAL_MS)
      contracts = contractsSoFar()
    }
    promiser.close()

    expect(contracts['navigation.anchor.position']).to.equal('event')
  })
})
