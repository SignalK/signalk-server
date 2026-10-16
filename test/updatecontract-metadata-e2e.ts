import { expect } from 'chai'
import { freeport } from './ts-servertestutilities'
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
