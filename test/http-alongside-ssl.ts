import { expect } from 'chai'
import https from 'https'
import net from 'net'
import WebSocket from 'ws'
import { freeport, SERVER_START_TIMEOUT } from './ts-servertestutilities'
import { startServerP } from './servertestutilities'
import { getMfdOrigin, servesPlainHttpAlongsideSsl } from '../dist/ports'

const PORT_WAIT_MS = 5000
const PORT_RETRY_MS = 50

// start() resolves once the HTTPS port listens; the HTTP port follows on
// its own, so wait for it before talking to it.
async function waitForPort(port: number) {
  const deadline = Date.now() + PORT_WAIT_MS
  for (;;) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => resolve(false))
    })
    if (connected) {
      return
    }
    if (Date.now() > deadline) {
      throw new Error(`port ${port} never started listening`)
    }
    await new Promise((resolve) => setTimeout(resolve, PORT_RETRY_MS))
  }
}

function httpsRequest(
  url: string,
  options: https.RequestOptions = {},
  body?: string
): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { rejectUnauthorized: false, ...options },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          data += chunk
        })
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: data
          })
        )
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

function firstWsMessage(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('message', (data) => {
      ws.close()
      resolve(JSON.parse(data.toString()))
    })
    ws.once('error', reject)
  })
}

describe('Plain HTTP alongside SSL', function () {
  this.timeout(SERVER_START_TIMEOUT)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let port: number
  let sslPort: number

  beforeEach(async function () {
    port = await freeport()
    sslPort = await freeport()
  })

  afterEach(async function () {
    if (server) {
      await server.stop()
      server = null
    }
  })

  it('redirects the HTTP port to HTTPS by default', async function () {
    server = await startServerP(port, false, {
      settings: { ssl: true, sslport: sslPort }
    })
    await waitForPort(port)

    const res = await fetch(`http://localhost:${port}/signalk`, {
      redirect: 'manual'
    })
    expect(res.status).to.equal(302)
    expect(res.headers.get('location')).to.equal(
      `https://localhost:${sslPort}/signalk`
    )

    const tls = await httpsRequest(`https://localhost:${sslPort}/signalk`)
    expect(tls.headers).to.have.property('strict-transport-security')
    expect(getMfdOrigin(server.app)).to.deep.equal({
      protocol: 'https',
      port: sslPort
    })
  })

  it('serves the API and WebSockets on both ports when enabled', async function () {
    server = await startServerP(port, false, {
      settings: { ssl: true, sslport: sslPort, httpAlongsideSsl: true }
    })
    await waitForPort(port)

    const res = await fetch(`http://localhost:${port}/signalk`, {
      redirect: 'manual'
    })
    expect(res.status).to.equal(200)
    expect(res.headers.get('strict-transport-security')).to.equal(null)
    const plainEndpoints = (await res.json()).endpoints.v1
    expect(plainEndpoints['signalk-http']).to.equal(
      `http://localhost:${port}/signalk/v1/api/`
    )
    expect(plainEndpoints['signalk-ws']).to.equal(
      `ws://localhost:${port}/signalk/v1/stream`
    )

    const tls = await httpsRequest(`https://localhost:${sslPort}/signalk`)
    expect(tls.status).to.equal(200)
    expect(tls.headers).not.to.have.property('strict-transport-security')
    const tlsEndpoints = JSON.parse(tls.body).endpoints.v1
    expect(tlsEndpoints['signalk-http']).to.equal(
      `https://localhost:${sslPort}/signalk/v1/api/`
    )
    expect(tlsEndpoints['signalk-ws']).to.equal(
      `wss://localhost:${sslPort}/signalk/v1/stream`
    )

    const hello = await firstWsMessage(
      `ws://localhost:${port}/signalk/v1/stream?subscribe=none`
    )
    expect(hello).to.have.property('self')

    expect(getMfdOrigin(server.app)).to.deep.equal({
      protocol: 'http',
      port
    })
  })

  it('stops both ports when the server stops', async function () {
    server = await startServerP(port, false, {
      settings: { ssl: true, sslport: sslPort, httpAlongsideSsl: true }
    })
    await waitForPort(port)
    await server.stop()
    server = null

    let error: unknown
    try {
      await fetch(`http://localhost:${port}/signalk`)
    } catch (e) {
      error = e
    }
    expect(error).to.be.instanceOf(Error)
  })

  it('marks the session cookie Secure only on HTTPS', async function () {
    server = await startServerP(port, true, {
      settings: { ssl: true, sslport: sslPort, httpAlongsideSsl: true }
    })
    await waitForPort(port)
    const body = JSON.stringify({ username: 'adminuser', password: 'admin' })
    const headers = { 'Content-Type': 'application/json' }

    const plain = await fetch(
      `http://localhost:${port}/signalk/v1/auth/login`,
      {
        method: 'POST',
        headers,
        body
      }
    )
    expect(plain.status).to.equal(200)
    const plainCookie = plain.headers.get('set-cookie') ?? ''
    expect(plainCookie).to.contain('JAUTHENTICATION=')
    expect(plainCookie).not.to.match(/;\s*Secure/i)

    const tls = await httpsRequest(
      `https://localhost:${sslPort}/signalk/v1/auth/login`,
      { method: 'POST', headers },
      body
    )
    expect(tls.status).to.equal(200)
    const tlsCookie = (tls.headers['set-cookie'] as string[]).join('\n')
    expect(tlsCookie).to.contain('JAUTHENTICATION=')
    expect(tlsCookie).to.match(/;\s*Secure/i)
  })
})

describe('Navico MFD tile origin', function () {
  const listening = (port: number) => ({ address: () => ({ port }) })
  const app = (
    settings: Record<string, unknown>,
    secondaryServer?: object,
    externalSsl = false
  ) =>
    ({
      config: { settings, isExternalSsl: () => externalSsl },
      secondaryServer
    }) as unknown as Parameters<typeof getMfdOrigin>[0]

  it('is plain HTTP without SSL', function () {
    expect(getMfdOrigin(app({ port: 3000 }))).to.deep.equal({
      protocol: 'http',
      port: 3000
    })
  })

  it('is HTTPS on the SSL port with SSL', function () {
    expect(
      getMfdOrigin(
        app({ ssl: true, port: 3000, sslport: 3443 }, listening(3000))
      )
    ).to.deep.equal({ protocol: 'https', port: 3443 })
  })

  it('is the listening plain HTTP port when served alongside SSL', function () {
    expect(
      getMfdOrigin(
        app({ ssl: true, httpAlongsideSsl: true, sslport: 443 }, listening(80))
      )
    ).to.deep.equal({ protocol: 'http', port: 80 })
  })

  it('stays HTTPS while no plain HTTP port listens', function () {
    expect(
      getMfdOrigin(app({ ssl: true, httpAlongsideSsl: true, sslport: 3443 }))
    ).to.deep.equal({ protocol: 'https', port: 3443 })
  })

  it('is HTTPS behind a TLS-terminating proxy', function () {
    expect(
      getMfdOrigin(app({ port: 3000, proxy_port: 443 }, undefined, true))
    ).to.deep.equal({ protocol: 'https', port: 443 })
  })
})

describe('Plain HTTP listener alongside SSL', function () {
  const app = (settings: Record<string, unknown>) =>
    ({ config: { settings } }) as unknown as Parameters<
      typeof servesPlainHttpAlongsideSsl
    >[0]
  const enabled = { ssl: true, httpAlongsideSsl: true }
  const listenFds = process.env.LISTEN_FDS

  afterEach(function () {
    if (listenFds === undefined) {
      delete process.env.LISTEN_FDS
    } else {
      process.env.LISTEN_FDS = listenFds
    }
  })

  it('is served when enabled with SSL', function () {
    delete process.env.LISTEN_FDS
    expect(servesPlainHttpAlongsideSsl(app(enabled))).to.equal(true)
  })

  it('is not served without SSL or when disabled', function () {
    delete process.env.LISTEN_FDS
    expect(
      servesPlainHttpAlongsideSsl(app({ httpAlongsideSsl: true }))
    ).to.equal(false)
    expect(servesPlainHttpAlongsideSsl(app({ ssl: true }))).to.equal(false)
  })

  it('needs a second fd under socket activation', function () {
    process.env.LISTEN_FDS = '1'
    expect(servesPlainHttpAlongsideSsl(app(enabled))).to.equal(false)
    process.env.LISTEN_FDS = '2'
    expect(servesPlainHttpAlongsideSsl(app(enabled))).to.equal(true)
  })
})
