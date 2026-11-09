import chai from 'chai'
import WebSocket from 'ws'
import { freeport, SERVER_START_TIMEOUT } from './ts-servertestutilities'
import { promisify } from 'util'
import {
  startServerP,
  getAdminToken,
  getReadOnlyToken,
  getToken
} from './servertestutilities'
import { userAgentOf } from '../src/userAgent'

const expect = chai.expect

interface WebSocketClient {
  ip: string
  userAgent?: string
  principal?: string
  connectedAt?: string
  serverEvents: boolean
}

function openStream(
  url: string,
  headers: Record<string, string>,
  query = 'subscribe=none'
) {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(
      `${url.replace('http', 'ws')}/signalk/v1/stream?${query}`,
      { headers }
    )
    ws.once('message', () => resolve(ws))
    ws.once('error', reject)
  })
}

describe('WebSocket clients', function () {
  describe('without security', function () {
    let url: string
    let server: { stop: () => Promise<void> }

    before(async function () {
      this.timeout(SERVER_START_TIMEOUT)
      const port = await freeport()
      url = `http://0.0.0.0:${port}`
      server = await startServerP(port, false)
    })

    after(async function () {
      await server.stop()
    })

    it('lists connected clients with their User-Agent', async function () {
      const ws = await openStream(url, {
        'User-Agent': 'ESP32 Websocket Client'
      })
      try {
        const res = await fetch(`${url}/skServer/websocketClients`)
        expect(res.status).to.equal(200)
        const clients: WebSocketClient[] = await res.json()
        const client = clients.find(
          (c) => c.userAgent === 'ESP32 Websocket Client'
        )
        expect(client).to.exist
        expect(client?.ip).to.be.a('string')
        expect(client?.principal).to.be.undefined
        expect(Date.parse(client?.connectedAt ?? '')).to.not.be.NaN
        expect(client?.serverEvents).to.equal(false)
      } finally {
        ws.close()
      }
    })

    it('flags clients that receive server events', async function () {
      const ws = await openStream(
        url,
        { 'User-Agent': 'Admin UI test' },
        'serverevents=all&subscribe=none'
      )
      try {
        const res = await fetch(`${url}/skServer/websocketClients`)
        const clients: WebSocketClient[] = await res.json()
        const client = clients.find((c) => c.userAgent === 'Admin UI test')
        expect(client?.serverEvents).to.equal(true)
      } finally {
        ws.close()
      }
    })
  })

  describe('with security', function () {
    let url: string
    let server: { stop: () => Promise<void> }
    let adminToken: string
    let readToken: string

    before(async function () {
      this.timeout(SERVER_START_TIMEOUT)
      const port = await freeport()
      url = `http://0.0.0.0:${port}`
      server = await startServerP(port, true)
      adminToken = await getAdminToken(server)
      readToken = await getReadOnlyToken(server)
    })

    after(async function () {
      await server.stop()
    })

    it('names the principal of each client for admins', async function () {
      const ws = await openStream(url, {
        Cookie: `JAUTHENTICATION=${readToken}`,
        'User-Agent': 'SensESP/3.6.1'
      })
      try {
        const res = await fetch(`${url}/skServer/websocketClients`, {
          headers: { Cookie: `JAUTHENTICATION=${adminToken}` }
        })
        expect(res.status).to.equal(200)
        const clients: WebSocketClient[] = await res.json()
        const client = clients.find((c) => c.userAgent === 'SensESP/3.6.1')
        expect(client?.principal).to.be.a('string')
      } finally {
        ws.close()
      }
    })

    it('refuses the list to non-admins', async function () {
      const res = await fetch(`${url}/skServer/websocketClients`, {
        headers: { Cookie: `JAUTHENTICATION=${readToken}` }
      })
      expect(res.status).to.equal(401)
    })
  })
})

describe('WebSocket clients with read-only access allowed', function () {
  let url: string
  let server: {
    stop: () => Promise<void>
    app: {
      securityStrategy: {
        securityConfig: object
        addUser: (
          config: object,
          user: { userId: string; type: string; password: string },
          callback: (err: Error | null) => void
        ) => void
      }
    }
  }
  let adminToken: string

  before(async function () {
    this.timeout(SERVER_START_TIMEOUT)
    const port = await freeport()
    url = `http://0.0.0.0:${port}`
    server = await startServerP(port, true, {}, { allow_readonly: true })
    adminToken = await getAdminToken(server)
  })

  after(async function () {
    await server.stop()
  })

  it('names no principal for anonymous clients', async function () {
    const ws = await openStream(url, { 'User-Agent': 'Anonymous viewer' })
    try {
      const res = await fetch(`${url}/skServer/websocketClients`, {
        headers: { Cookie: `JAUTHENTICATION=${adminToken}` }
      })
      expect(res.status).to.equal(200)
      const clients: WebSocketClient[] = await res.json()
      const client = clients.find((c) => c.userAgent === 'Anonymous viewer')
      expect(client).to.exist
      expect(client?.principal).to.be.undefined
    } finally {
      ws.close()
    }
  })

  it('names a signed-in user called AUTO', async function () {
    const security = server.app.securityStrategy
    await promisify(security.addUser)(security.securityConfig, {
      userId: 'AUTO',
      type: 'read',
      password: 'auto-password'
    })
    const ws = await openStream(url, {
      Cookie: `JAUTHENTICATION=${getToken(server, 'AUTO')}`,
      'User-Agent': 'Signed-in AUTO'
    })
    try {
      const res = await fetch(`${url}/skServer/websocketClients`, {
        headers: { Cookie: `JAUTHENTICATION=${adminToken}` }
      })
      const clients: WebSocketClient[] = await res.json()
      const client = clients.find((c) => c.userAgent === 'Signed-in AUTO')
      expect(client?.principal).to.equal('AUTO')
    } finally {
      ws.close()
    }
  })
})

describe('WebSocket clients with a strategy not marking authentication', function () {
  let url: string
  let server: { stop: () => Promise<void> }
  let adminToken: string
  let readToken: string

  before(async function () {
    this.timeout(SERVER_START_TIMEOUT)
    const port = await freeport()
    url = `http://0.0.0.0:${port}`
    process.env.SECURITYSTRATEGY = require.resolve('./flagless-security')
    try {
      server = await startServerP(port, true)
    } finally {
      delete process.env.SECURITYSTRATEGY
    }
    adminToken = await getAdminToken(server)
    readToken = await getReadOnlyToken(server)
  })

  after(async function () {
    await server.stop()
  })

  it('keeps the principal the strategy set', async function () {
    const ws = await openStream(url, {
      Cookie: `JAUTHENTICATION=${readToken}`,
      'User-Agent': 'Custom strategy client'
    })
    try {
      const res = await fetch(`${url}/skServer/websocketClients`, {
        headers: { Cookie: `JAUTHENTICATION=${adminToken}` }
      })
      const clients: WebSocketClient[] = await res.json()
      const client = clients.find(
        (c) => c.userAgent === 'Custom strategy client'
      )
      expect(client?.principal).to.be.a('string')
    } finally {
      ws.close()
    }
  })
})

describe('userAgentOf', function () {
  it('caps the length and ignores a missing header', function () {
    expect(userAgentOf({ 'user-agent': 'a'.repeat(300) })).to.have.lengthOf(256)
    expect(userAgentOf({})).to.be.undefined
  })
})
