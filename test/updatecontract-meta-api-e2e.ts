import { expect } from 'chai'
import { freeport } from './ts-servertestutilities'
import { startServerP, sendDelta } from './servertestutilities'

// The resolution lives server-side; a client should not have to reimplement
// the precedence to know which contract is in force. These assertions run
// against the real REST surface rather than the resolver in isolation.

const SERVER_START_TIMEOUT_MS = 90000
const TEST_TIMEOUT_MS = 30000
const SETTLE_MS = 1500

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('resolved updateContract in the meta API', function () {
  let server: Awaited<ReturnType<typeof startServerP>> | undefined
  let port: number

  const metaFor = async (path: string) => {
    const url =
      `http://localhost:${port}/signalk/v1/api/vessels/self/` +
      `${path.split('.').join('/')}/meta`
    const res = await fetch(url)
    expect(res.ok, `GET ${path}/meta returned ${res.status}`).to.equal(true)
    const body: unknown = await res.json()
    expect(body).to.be.an('object')
    return body as { updateContract?: unknown }
  }

  before(async function () {
    this.timeout(SERVER_START_TIMEOUT_MS)
    port = await freeport()
    server = await startServerP(port, false, {
      settings: { interfaces: { plugins: false } }
    })
    await sendDelta(
      {
        context: `vessels.${server.app.selfId}`,
        updates: [
          {
            source: { label: 'contract-e2e' },
            timestamp: new Date().toISOString(),
            values: [
              { path: 'navigation.state', value: 'moored' },
              {
                path: 'navigation.anchor.position',
                value: { latitude: 1, longitude: 2 }
              }
            ]
          }
        ]
      },
      `http://localhost:${port}/signalk/v1/api/_test/delta`
    )
    await delay(SETTLE_MS)
  })

  after(async function () {
    await server?.stop()
  })

  it('reports periodic for a path the shipped classification does not cover', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    expect((await metaFor('navigation.state')).updateContract).to.equal(
      'periodic'
    )
  })

  it('reports event for a path the shipped classification covers', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    expect(
      (await metaFor('navigation.anchor.position')).updateContract
    ).to.equal('event')
  })
})
