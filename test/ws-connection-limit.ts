import chai from 'chai'
import WebSocket from 'ws'
import { freeport } from './ts-servertestutilities'
import { startServerP } from './servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(chai as any).Should()

const WS_STREAM_PATH =
  '/signalk/v1/stream?subscribe=none&sendCachedValues=false'

function openWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
    ws.once('unexpected-response', (_req, res) => {
      const err = Object.assign(new Error(`HTTP ${res.statusCode}`), {
        statusCode: res.statusCode,
        response: res
      })
      reject(err)
    })
  })
}

function openWsExpect429(
  url: string
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('open', () => {
      ws.close()
      reject(
        new Error('Expected connection to be rejected but it was accepted')
      )
    })
    ws.once('error', reject)
    ws.once('unexpected-response', (_req, res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        let body: unknown
        try {
          body = JSON.parse(Buffer.concat(chunks).toString())
        } catch {
          body = Buffer.concat(chunks).toString()
        }
        resolve({ statusCode: res.statusCode!, body })
      })
    })
  })
}

describe('WebSocket per-IP connection limit', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let wsUrl: string
  const MAX = 2
  const openSockets: WebSocket[] = []

  before(async function () {
    process.env.MAX_WS_CONNECTIONS_PER_IP = String(MAX)
    const port = await freeport()
    wsUrl = `ws://127.0.0.1:${port}${WS_STREAM_PATH}`
    server = await startServerP(port, false)
  })

  after(async function () {
    delete process.env.MAX_WS_CONNECTIONS_PER_IP
    openSockets.forEach((ws) => ws.terminate())
    await server.stop()
  })

  it(`allows up to ${MAX} concurrent connections from the same IP`, async function () {
    for (let i = 0; i < MAX; i++) {
      const ws = await openWs(wsUrl)
      openSockets.push(ws)
    }
  })

  it('rejects the next connection with HTTP 429 and a JSON error payload', async function () {
    const { statusCode, body } = await openWsExpect429(wsUrl)
    statusCode.should.equal(429)
    ;(body as { error: string }).error.should.include(
      'Too many concurrent websocket connections'
    )
  })

  it('allows a new connection after one is closed', async function () {
    const toClose = openSockets.pop()!
    await new Promise<void>((resolve) => {
      toClose.once('close', resolve)
      toClose.close()
    })

    // Retry opening a new connection with backoff until it succeeds
    let ws: WebSocket | undefined
    const maxAttempts = 5
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        ws = await openWs(wsUrl)
        break
      } catch (err) {
        if (attempt === maxAttempts) {
          throw err
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 20))
      }
    }

    openSockets.push(ws!)
  })
})

describe('WebSocket per-IP connection limit with trust proxy', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let wsUrl: string
  const MAX = 2
  const openSockets: WebSocket[] = []
  const FORWARDED_IP_A = '10.0.0.1'
  const FORWARDED_IP_B = '10.0.0.2'

  function openWsWithForwardedIp(
    url: string,
    forwardedIp: string
  ): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: { 'x-forwarded-for': forwardedIp }
      })
      ws.once('open', () => resolve(ws))
      ws.once('error', reject)
      ws.once('unexpected-response', (_req, res) => {
        const err = Object.assign(new Error(`HTTP ${res.statusCode}`), {
          statusCode: res.statusCode,
          response: res
        })
        reject(err)
      })
    })
  }

  function openWsWithForwardedIpExpect429(
    url: string,
    forwardedIp: string
  ): Promise<{ statusCode: number; body: unknown }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: { 'x-forwarded-for': forwardedIp }
      })
      ws.once('open', () => {
        ws.close()
        reject(
          new Error('Expected connection to be rejected but it was accepted')
        )
      })
      ws.once('error', reject)
      ws.once('unexpected-response', (_req, res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          let body: unknown
          try {
            body = JSON.parse(Buffer.concat(chunks).toString())
          } catch {
            body = Buffer.concat(chunks).toString()
          }
          resolve({ statusCode: res.statusCode!, body })
        })
      })
    })
  }

  before(async function () {
    process.env.MAX_WS_CONNECTIONS_PER_IP = String(MAX)
    const port = await freeport()
    wsUrl = `ws://127.0.0.1:${port}${WS_STREAM_PATH}`
    server = await startServerP(port, false, { settings: { trustProxy: true } })
  })

  after(async function () {
    delete process.env.MAX_WS_CONNECTIONS_PER_IP
    openSockets.forEach((ws) => ws.terminate())
    await server.stop()
  })

  it(`allows up to ${MAX} connections from the same forwarded IP`, async function () {
    for (let i = 0; i < MAX; i++) {
      const ws = await openWsWithForwardedIp(wsUrl, FORWARDED_IP_A)
      openSockets.push(ws)
    }
  })

  it('rejects the next connection from the same forwarded IP with HTTP 429', async function () {
    const { statusCode, body } = await openWsWithForwardedIpExpect429(
      wsUrl,
      FORWARDED_IP_A
    )
    statusCode.should.equal(429)
    ;(body as { error: string }).error.should.include(
      'Too many concurrent websocket connections'
    )
  })

  it('allows connections from a different forwarded IP while the first is at its limit', async function () {
    const ws = await openWsWithForwardedIp(wsUrl, FORWARDED_IP_B)
    openSockets.push(ws)
  })

  it('uses only the first IP when X-Forwarded-For contains multiple addresses', async function () {
    // FORWARDED_IP_A is already at MAX connections; send it as the first entry
    // in a multi-value header — the server must still recognise it as at-limit
    const { statusCode } = await openWsWithForwardedIpExpect429(
      wsUrl,
      `${FORWARDED_IP_A}, 172.16.0.1`
    )
    statusCode.should.equal(429)
  })
})
