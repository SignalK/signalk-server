import { expect } from 'chai'
import { freeport } from './ts-servertestutilities'
import { startServerP, getAdminToken, WsPromiser } from './servertestutilities'

// The throttle exists to keep a chatty setPluginStatus caller from flooding
// every admin-UI WebSocket (#2972). Asserting it on the real socket rather
// than on the ThrottledCaller unit catches a miswiring of the two provider
// status intervals that the unit test cannot see.

const BURST_SIZE = 200
// PROVIDER_STATUS_MIN_INTERVAL_MS in src/index.ts.
const MIN_INTERVAL_MS = 1000
// PROVIDER_STATUS_REFRESH_INTERVAL_MS in src/index.ts.
const REFRESH_INTERVAL_MS = 5000
// Starting a server dominates this suite's runtime; see the budget in
// ts-servertestutilities.
const SERVER_START_TIMEOUT_MS = 90000
const TEST_TIMEOUT_MS = 30000
// Long enough for the bootstrap replay to arrive before counting starts.
const BOOTSTRAP_DRAIN_MS = 500
// Two intervals, so a throttle that emitted once per interval rather than
// coalescing would exceed MAX_EMITS and be caught.
const OBSERVE_MS = MIN_INTERVAL_MS * 2
// The synchronous burst runs in one tick, so only the first request() arms the
// timer and the rest coalesce into it: one emit. The periodic refresh can add
// at most one more within OBSERVE_MS.
const MAX_EMITS = 1 + Math.ceil(OBSERVE_MS / REFRESH_INTERVAL_MS)

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('PROVIDERSTATUS throttling', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let port: number
  let adminToken: string

  before(async function () {
    this.timeout(SERVER_START_TIMEOUT_MS)
    port = await freeport()
    server = await startServerP(port, true)
    adminToken = await getAdminToken(server)
  })

  after(async function () {
    await server.stop()
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countProviderStatus = (promiser: any): number =>
    promiser
      .parsedMessages()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((m: any) => m && m.type === 'PROVIDERSTATUS').length

  it('coalesces a burst of status changes into few socket messages', async function () {
    this.timeout(TEST_TIMEOUT_MS)

    const promiser = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream` +
        `?serverevents=all&subscribe=none&sendCachedValues=false&token=${adminToken}`
    )
    await promiser.nextMsg() // hello
    // Drain the bootstrap replay so only burst-driven emits are counted.
    await delay(BOOTSTRAP_DRAIN_MS)
    const before = countProviderStatus(promiser)

    for (let i = 0; i < BURST_SIZE; i++) {
      server.app.setPluginStatus('throttle-e2e-plugin', `status ${i}`)
    }
    await delay(OBSERVE_MS)
    const emitted = countProviderStatus(promiser) - before
    promiser.close()

    // Unthrottled this would be BURST_SIZE messages.
    expect(emitted).to.be.greaterThan(0)
    expect(emitted).to.be.at.most(MAX_EMITS)
  })

  it('delivers the latest status despite coalescing', async function () {
    this.timeout(TEST_TIMEOUT_MS)

    const promiser = new WsPromiser(
      `ws://0.0.0.0:${port}/signalk/v1/stream` +
        `?serverevents=all&subscribe=none&sendCachedValues=false&token=${adminToken}`
    )
    await promiser.nextMsg() // hello
    await delay(BOOTSTRAP_DRAIN_MS)

    for (let i = 0; i < BURST_SIZE; i++) {
      server.app.setPluginStatus('throttle-e2e-latest-plugin', `status ${i}`)
    }
    await delay(OBSERVE_MS)

    const statuses = promiser
      .parsedMessages()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((m: any) => m && m.type === 'PROVIDERSTATUS')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .flatMap((m: any) => m.data ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((s: any) => s && s.id === 'throttle-e2e-latest-plugin')
    promiser.close()

    expect(statuses.length).to.be.greaterThan(0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const last: any = statuses[statuses.length - 1]
    expect(last.message).to.equal(`status ${BURST_SIZE - 1}`)
  })
})
