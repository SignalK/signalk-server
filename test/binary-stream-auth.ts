import chai from 'chai'
import { freeport } from './ts-servertestutilities'
import { startServerP, getAdminToken } from './servertestutilities'
import WebSocket from 'ws'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(chai as any).Should()

// The radar spoke stream is served as a binary-stream WebSocket at the
// alias path /signalk/v2/api/vessels/self/radars/:id/stream. WebSocket
// upgrade requests bypass the Express middleware chain, so the handler
// must parse the cookie header and query string itself before calling
// authorizeWS() — otherwise a browser's same-origin HttpOnly
// JAUTHENTICATION cookie is ignored and every connection is rejected.
describe('Binary stream WebSocket authentication', function () {
  const RADAR_STREAM = '/signalk/v2/api/vessels/self/radars/test-radar/stream'

  let host: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let adminToken: string

  before(async function () {
    this.timeout(60000)
    const port = await freeport()
    host = `ws://0.0.0.0:${port}`
    server = await startServerP(port, true)
    adminToken = await getAdminToken(server)
  })

  after(async function () {
    await server.stop()
  })

  // Resolve to the HTTP status on a rejected upgrade, or 101 on success.
  function upgradeStatus(
    path: string,
    headers: Record<string, string> = {}
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${host}${path}`, { headers })
      const done = (n: number) => {
        try {
          ws.close()
        } catch {
          // ignore
        }
        resolve(n)
      }
      ws.on('open', () => done(101))
      ws.on('unexpected-response', (_req, res) => done(res.statusCode ?? 0))
      ws.on('error', (err) => reject(err))
    })
  }

  it('rejects an unauthenticated connection with 401', async function () {
    const status = await upgradeStatus(RADAR_STREAM)
    status.should.equal(401)
  })

  it('rejects an invalid token with 401', async function () {
    const status = await upgradeStatus(RADAR_STREAM, {
      Cookie: 'JAUTHENTICATION=not-a-real-token'
    })
    status.should.equal(401)
  })

  it('accepts a valid token via the JAUTHENTICATION cookie', async function () {
    const status = await upgradeStatus(RADAR_STREAM, {
      Cookie: `JAUTHENTICATION=${adminToken}`
    })
    status.should.equal(101)
  })

  it('accepts a valid token via the ?token= query parameter', async function () {
    const status = await upgradeStatus(`${RADAR_STREAM}?token=${adminToken}`)
    status.should.equal(101)
  })

  it('accepts a valid token via the Authorization header', async function () {
    const status = await upgradeStatus(RADAR_STREAM, {
      Authorization: `Bearer ${adminToken}`
    })
    status.should.equal(101)
  })
})
