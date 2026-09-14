import { expect } from 'chai'
import { freeport } from './ts-servertestutilities'
import { startServerP, sendDelta } from './servertestutilities'

// The unit tests drive StalenessEnforcer against a mock app. This exercises
// the real server end to end: once a string-valued path stops updating, the
// REST snapshot must report `value: null` with `state.timedOut` set and the
// last good reading preserved in `state.lastValue`.

const SERVER_START_TIMEOUT_MS = 90000
const TEST_TIMEOUT_MS = 30000
const STALE_TIMEOUT_S = 1
const SETTLE_MS = 3000

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('staleness on string-valued paths', function () {
  let server: Awaited<ReturnType<typeof startServerP>> | undefined
  let port: number

  before(async function () {
    this.timeout(SERVER_START_TIMEOUT_MS)
    port = await freeport()
    server = await startServerP(port, false, {
      settings: {
        enforceDataTimeouts: true,
        defaultTimeout: STALE_TIMEOUT_S,
        interfaces: { plugins: false }
      }
    })
  })

  after(async function () {
    // A rejected before hook leaves server undefined; Mocha still runs this,
    // and an unguarded stop() would mask the real setup failure.
    await server?.stop()
  })

  it('emits null and state.timedOut for a stale string enum path', async function () {
    this.timeout(TEST_TIMEOUT_MS)

    await sendDelta(
      {
        context: `vessels.${server.app.selfId}`,
        updates: [
          {
            source: { label: 'autostate-e2e' },
            timestamp: new Date().toISOString(),
            values: [{ path: 'navigation.state', value: 'moored' }]
          }
        ]
      },
      `http://localhost:${port}/signalk/v1/api/_test/delta`
    )

    // No further deltas: the enforcer must notice the silence. SETTLE_MS
    // exceeds STALE_TIMEOUT_S plus one sweep interval.
    await delay(SETTLE_MS)

    const res = await fetch(
      `http://localhost:${port}/signalk/v1/api/vessels/self/navigation/state`
    )
    expect(res.ok, `GET navigation/state returned ${res.status}`).to.equal(true)

    const body: unknown = await res.json()
    expect(body).to.be.an('object')
    const entry = body as {
      value?: unknown
      state?: { timedOut?: unknown; lastValue?: { value?: unknown } }
    }

    expect(entry.value).to.equal(null)
    expect(entry.state?.timedOut).to.equal(true)
    expect(entry.state?.lastValue?.value).to.equal('moored')
  })
})
