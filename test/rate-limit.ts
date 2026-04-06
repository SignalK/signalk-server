import chai from 'chai'
import WebSocket from 'ws'
import { startServerP } from './servertestutilities'
import { freeport } from './ts-servertestutilities'

chai.should()

interface ServerInstance {
  stop: () => Promise<void>
}

function wsLogin(
  ws: WebSocket,
  requestId: string,
  username: string,
  password: string
): Promise<{
  statusCode: number
  requestId: string
  state: string
  message?: string
}> {
  return new Promise((resolve, reject) => {
    function cleanup() {
      clearTimeout(timer)
      ws.removeListener('message', onMessage)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${requestId} response`))
    }, 10000)
    function onMessage(data: WebSocket.Data) {
      const msg = JSON.parse(data.toString())
      if (msg.requestId === requestId) {
        cleanup()
        resolve(msg)
      }
    }
    ws.on('message', onMessage)
    ws.send(JSON.stringify({ requestId, login: { username, password } }))
  })
}

function openWs(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://0.0.0.0:${port}/signalk/v1/stream?subscribe=none`
    )
    const timer = setTimeout(
      () => reject(new Error('WS connection timeout')),
      10000
    )
    ws.on('message', function onHello(data: WebSocket.Data) {
      const msg = JSON.parse(data.toString())
      if (msg.name && msg.version) {
        clearTimeout(timer)
        ws.removeListener('message', onHello)
        resolve(ws)
      }
    })
    ws.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

const LOGIN_MAX = 100
const API_MAX = 1000

const securityConfig = {
  allowNewUserRegistration: true,
  allowDeviceAccessRequests: true
}

describe('HTTP login rate limiting', () => {
  let server: ServerInstance
  let url: string

  before(async function () {
    const port = await freeport()
    url = `http://0.0.0.0:${port}`
    server = await startServerP(port, true, {}, securityConfig)
  })

  after(async function () {
    await server.stop()
  })

  it(`should return 429 after ${LOGIN_MAX} attempts`, async function () {
    const requests = []
    for (let i = 0; i < LOGIN_MAX; i++) {
      requests.push(
        fetch(`${url}/signalk/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'admin',
            password: 'wrongpassword'
          })
        })
      )
    }
    await Promise.all(requests)

    const res = await fetch(`${url}/signalk/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'wrongpassword'
      })
    })

    res.status.should.equal(429)
  })
})

describe('WebSocket login rate limiting', () => {
  let server: ServerInstance
  let port: number

  before(async function () {
    port = await freeport()
    server = await startServerP(port, true, {}, securityConfig)
  })

  after(async function () {
    await server.stop()
  })

  it(`should return 429 after ${LOGIN_MAX} attempts`, async function () {
    this.timeout(30000)
    const ws = await openWs(port)

    try {
      for (let i = 0; i < LOGIN_MAX; i++) {
        await wsLogin(ws, `ws-rate-${i}`, 'admin', 'wrongpassword')
      }

      const blocked = await wsLogin(
        ws,
        'ws-rate-blocked',
        'admin',
        'wrongpassword'
      )
      blocked.statusCode.should.equal(429)
    } finally {
      ws.close()
    }
  })
})

describe('Cross-protocol login rate limiting', () => {
  let server: ServerInstance
  let url: string
  let port: number

  before(async function () {
    port = await freeport()
    url = `http://0.0.0.0:${port}`
    server = await startServerP(port, true, {}, securityConfig)
  })

  after(async function () {
    await server.stop()
  })

  it('should share the rate limit budget between HTTP and WebSocket', async function () {
    this.timeout(30000)

    const half = LOGIN_MAX / 2
    const httpRequests = []
    for (let i = 0; i < half; i++) {
      httpRequests.push(
        fetch(`${url}/signalk/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'admin',
            password: 'wrongpassword'
          })
        })
      )
    }
    await Promise.all(httpRequests)

    const ws = await openWs(port)
    try {
      for (let i = 0; i < half; i++) {
        await wsLogin(ws, `ws-cross-${i}`, 'admin', 'wrongpassword')
      }

      const blockedWs = await wsLogin(
        ws,
        'ws-cross-blocked',
        'admin',
        'wrongpassword'
      )
      blockedWs.statusCode.should.equal(429)

      const blockedHttp = await fetch(`${url}/signalk/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
          password: 'wrongpassword'
        })
      })
      blockedHttp.status.should.equal(429)
    } finally {
      ws.close()
    }
  })
})

describe('HTTP API rate limiting', () => {
  let server: ServerInstance
  let url: string

  before(async function () {
    const port = await freeport()
    url = `http://0.0.0.0:${port}`
    server = await startServerP(port, true, {}, securityConfig)
  })

  after(async function () {
    await server.stop()
  })

  it('should limit access requests', async function () {
    const requests = []
    for (let i = 0; i < API_MAX; i++) {
      requests.push(
        fetch(`${url}/signalk/v1/access/requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: `device-${i}`,
            description: `Device ${i}`
          })
        })
      )
    }

    await Promise.all(requests)

    const res = await fetch(`${url}/signalk/v1/access/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'device-1001',
        description: 'Device 1001'
      })
    })

    res.status.should.equal(429)
  })

  it('should limit request status checks', async function () {
    const requests = []
    for (let i = 0; i < API_MAX; i++) {
      requests.push(fetch(`${url}/signalk/v1/requests/123`))
    }

    await Promise.all(requests)

    const res = await fetch(`${url}/signalk/v1/requests/123`)
    res.status.should.equal(429)
  })

  it('should limit login status checks', async function () {
    const requests = []
    for (let i = 0; i < API_MAX; i++) {
      requests.push(fetch(`${url}/loginStatus`))
    }

    await Promise.all(requests)

    const res = await fetch(`${url}/loginStatus`)
    res.status.should.equal(429)
  })
})

describe('Rate limiting with trustProxy enabled', () => {
  let server: ServerInstance
  let url: string
  let originalConsoleError: typeof console.error
  let originalConsoleLog: typeof console.log
  let capturedLogs: string[]

  before(async function () {
    const port = await freeport()
    url = `http://0.0.0.0:${port}`

    capturedLogs = []
    originalConsoleError = console.error
    originalConsoleLog = console.log
    console.error = (...args: unknown[]) => {
      capturedLogs.push(args.join(' '))
      originalConsoleError.apply(console, args)
    }
    console.log = (...args: unknown[]) => {
      capturedLogs.push(args.join(' '))
      originalConsoleLog.apply(console, args)
    }

    const extraConfig = {
      settings: {
        trustProxy: true
      }
    }
    server = await startServerP(port, true, extraConfig, securityConfig)
  })

  after(async function () {
    await server.stop()
    console.error = originalConsoleError
    console.log = originalConsoleLog
  })

  it('should start without rate limiter errors logged and handle requests', async function () {
    const res = await fetch(`${url}/signalk/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'wrongpassword'
      })
    })

    res.status.should.equal(401)

    const allLogs = capturedLogs.join('\n')
    allLogs.should.not.include('ERR_ERL_PERMISSIVE_TRUST_PROXY')
    allLogs.should.not.include('ERR_ERL_UNEXPECTED_X_FORWARDED_FOR')
  })

  it('should use X-Forwarded-For for per-IP rate limit buckets', async function () {
    const requests = []
    for (let i = 0; i < API_MAX; i++) {
      requests.push(
        fetch(`${url}/loginStatus`, {
          headers: {
            'X-Forwarded-For': '192.168.1.200'
          }
        })
      )
    }
    await Promise.all(requests)

    const blocked = await fetch(`${url}/loginStatus`, {
      headers: {
        'X-Forwarded-For': '192.168.1.200'
      }
    })
    blocked.status.should.equal(429)

    const differentIp = await fetch(`${url}/loginStatus`, {
      headers: {
        'X-Forwarded-For': '192.168.1.201'
      }
    })
    differentIp.status.should.be.oneOf([200, 401, 403])
  })
})
