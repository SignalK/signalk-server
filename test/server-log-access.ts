import chai from 'chai'
import { freeport } from './ts-servertestutilities'
import {
  startServerP,
  getAdminToken,
  getReadOnlyToken,
  WsPromiser
} from './servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(chai as any).Should()

// Server logs are streamed over the websocket via a special
// `{ subscribe: [{ path: 'log' }] }` message. When security is enabled the
// stream must be restricted to admin users; with no security configured it
// is open. These tests exercise that gating in processSubscribe.

const LOG_MARKER = '__SERVER_LOG_ACCESS_TEST_MARKER__'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface LogSubscribeResult {
  gotLog: boolean
  denied: boolean
}

async function subscribeToLog(url: string): Promise<LogSubscribeResult> {
  const promiser = new WsPromiser(url)
  await promiser.nextMsg() // hello
  await promiser.send({ subscribe: [{ path: 'log' }] })
  // Emit a fresh log line so an authorised subscriber has something to receive.
  console.log(LOG_MARKER)
  await delay(400)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = promiser.parsedMessages()
  promiser.close()
  return {
    gotLog: messages.some((m) => m && m.type === 'LOG'),
    denied: messages.some(
      (m) =>
        m && typeof m.errorMessage === 'string' && /admin/i.test(m.errorMessage)
    )
  }
}

describe('Server log websocket access', function () {
  describe('with no security configured', function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any
    let wsUrl: string

    before(async function () {
      this.timeout(30000)
      const port = await freeport()
      server = await startServerP(port, false)
      wsUrl =
        `ws://0.0.0.0:${port}/signalk/v1/stream` +
        '?subscribe=none&metaDeltas=none&sendCachedValues=false'
    })

    after(async function () {
      await server.stop()
    })

    it('allows access to the server log', async function () {
      const { gotLog, denied } = await subscribeToLog(wsUrl)
      denied.should.equal(false)
      gotLog.should.equal(true)
    })
  })

  describe('with security enabled', function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any
    let port: number
    let adminToken: string
    let readToken: string

    before(async function () {
      this.timeout(30000)
      port = await freeport()
      server = await startServerP(port, true)
      adminToken = await getAdminToken(server)
      readToken = await getReadOnlyToken(server)
    })

    after(async function () {
      await server.stop()
    })

    function streamUrl(token?: string): string {
      const base =
        `ws://0.0.0.0:${port}/signalk/v1/stream` +
        '?subscribe=none&metaDeltas=none&sendCachedValues=false'
      return token ? `${base}&token=${token}` : base
    }

    it('denies access to a client that is not logged in', async function () {
      const { gotLog, denied } = await subscribeToLog(streamUrl())
      gotLog.should.equal(false)
      denied.should.equal(true)
    })

    it('denies access to a non-admin user', async function () {
      const { gotLog, denied } = await subscribeToLog(streamUrl(readToken))
      gotLog.should.equal(false)
      denied.should.equal(true)
    })

    it('allows access to an admin user', async function () {
      const { gotLog, denied } = await subscribeToLog(streamUrl(adminToken))
      denied.should.equal(false)
      gotLog.should.equal(true)
    })
  })
})
