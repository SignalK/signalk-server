import { expect } from 'chai'
import WebSocket from 'ws'
import { freeport, SERVER_START_TIMEOUT } from './ts-servertestutilities'
import { isInternetAddress } from '../src/internetAddress'
import { EXPOSURE_STATUS_ID } from '../src/exposureWarning'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist/')

describe('isInternetAddress', () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.9',
    '172.31.255.255',
    '192.168.1.20',
    '100.101.102.103',
    '169.254.1.1',
    '::1',
    'fd7a:115c:a1e0::1',
    'fe80::1',
    '::ffff:192.168.1.20'
  ]) {
    it(`treats ${address} as local`, () => {
      expect(isInternetAddress(address)).to.equal(false)
    })
  }

  for (const address of [
    '8.8.8.8',
    '172.32.0.1',
    '100.128.0.1',
    '2001:4860:4860::8888',
    '::ffff:8.8.8.8'
  ]) {
    it(`treats ${address} as an internet address`, () => {
      expect(isInternetAddress(address)).to.equal(true)
    })
  }

  it('treats a missing or malformed address as local', () => {
    expect(isInternetAddress(undefined)).to.equal(false)
    expect(isInternetAddress('not-an-address')).to.equal(false)
  })
})

describe('Warning about a server without security on the internet', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let port: number

  beforeEach(async function () {
    this.timeout(SERVER_START_TIMEOUT)
    port = await freeport()
    server = new Server({
      config: {
        settings: { port, trustProxy: true, interfaces: { plugins: false } }
      }
    })
    await server.start()
  })

  afterEach(async function () {
    await server.stop()
  })

  const exposureStatus = () => server.app.providerStatus[EXPOSURE_STATUS_ID]
  const requestFrom = (address: string, method = 'GET') =>
    fetch(`http://127.0.0.1:${port}/signalk`, {
      method,
      headers: {
        'X-Forwarded-For': address,
        Origin: 'http://example.com',
        'Access-Control-Request-Method': 'GET'
      }
    })
  const connectWebSocketFrom = (address: string) =>
    new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/signalk/v1/stream?subscribe=none`,
        { headers: { 'X-Forwarded-For': address } }
      )
      ws.on('open', () => {
        ws.close()
        resolve()
      })
      ws.on('error', reject)
    })

  it('stays quiet for requests from the local network', async () => {
    await requestFrom('192.168.1.20')
    await connectWebSocketFrom('192.168.1.20')
    expect(exposureStatus()).to.equal(undefined)
  })

  it('warns once a request arrives from the internet', async () => {
    await requestFrom('203.0.113.7')
    expect(exposureStatus().type).to.equal('error')
    expect(exposureStatus().message).to.contain('203.0.113.7')
  })

  it('warns about a preflight request that CORS answers itself', async () => {
    const res = await requestFrom('203.0.113.8', 'OPTIONS')
    expect(res.status).to.equal(204)
    expect(exposureStatus().message).to.contain('203.0.113.8')
  })

  it('warns about a request the JSON parser rejects', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/skServer/providers`, {
      method: 'POST',
      headers: {
        'X-Forwarded-For': '203.0.113.10',
        'Content-Type': 'application/json'
      },
      body: '{not json'
    })
    expect(res.status).to.equal(400)
    expect(exposureStatus().message).to.contain('203.0.113.10')
  })

  it('warns once an hour across HTTP and WebSocket clients', async () => {
    const warn = console.warn
    const warnings: unknown[] = []
    console.warn = (...args: unknown[]) => {
      warnings.push(args[0])
    }
    try {
      await requestFrom('203.0.113.11')
      await connectWebSocketFrom('203.0.113.12')
    } finally {
      console.warn = warn
    }
    expect(warnings).to.have.length(1)
    expect(exposureStatus().message).to.contain('203.0.113.11')
  })

  it('warns about a client that only opens a WebSocket', async () => {
    await connectWebSocketFrom('203.0.113.9')
    expect(exposureStatus().message).to.contain('203.0.113.9')
  })
})
