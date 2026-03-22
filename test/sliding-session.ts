import { expect } from 'chai'
import jwt from 'jsonwebtoken'
import { freeport } from './ts-servertestutilities'
import {
  startServerP,
  WRITE_USER_NAME,
  WRITE_USER_PASSWORD
} from './servertestutilities'

interface TestServer {
  app: {
    securityStrategy: {
      securityConfig: { secretKey: string }
    }
    config: { settings: { port: number } }
  }
  stop: () => Promise<void>
}

function getSecretKey(server: TestServer): string {
  return server.app.securityStrategy.securityConfig.secretKey
}

function signToken(
  secretKey: string,
  userId: string,
  options: { iat: number; exp: number; rememberMe?: boolean }
): string {
  const payload: {
    id: string
    iat: number
    exp: number
    rememberMe?: boolean
  } = {
    id: userId,
    iat: options.iat,
    exp: options.exp
  }
  if (options.rememberMe) {
    payload.rememberMe = true
  }
  return jwt.sign(payload, secretKey)
}

function findJauthCookie(res: Response): string | undefined {
  return res.headers
    .getSetCookie()
    .find((c) => c.startsWith('JAUTHENTICATION='))
}

function extractTokenFromCookie(cookie: string): string {
  return cookie.split(';')[0].replace('JAUTHENTICATION=', '')
}

describe('Sliding session token refresh', function () {
  let server: TestServer
  let url: string
  let secretKey: string

  before(async function () {
    this.timeout(60000)
    const port = await freeport()
    url = `http://0.0.0.0:${port}`

    server = (await startServerP(
      port,
      true,
      {},
      {
        expiration: '30s'
      }
    )) as unknown as TestServer

    secretKey = getSecretKey(server)
  })

  after(async function () {
    await server.stop()
  })

  async function login(rememberMe: boolean): Promise<Response> {
    return fetch(`${url}/signalk/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: WRITE_USER_NAME,
        password: WRITE_USER_PASSWORD,
        rememberMe
      })
    })
  }

  async function authenticatedGet(token: string): Promise<Response> {
    return fetch(`${url}/signalk/v1/api/vessels/self`, {
      headers: { Cookie: `JAUTHENTICATION=${token}` }
    })
  }

  describe('login cookie lifetime', function () {
    it('rememberMe=true sets Max-Age on cookie', async function () {
      const res = await login(true)
      expect(res.status).to.equal(200)
      const cookie = findJauthCookie(res)
      expect(cookie).to.be.a('string')
      expect(cookie).to.match(/Max-Age=\d+/)
    })

    it('rememberMe=false sets session cookie without Max-Age', async function () {
      const res = await login(false)
      expect(res.status).to.equal(200)
      const cookie = findJauthCookie(res)
      expect(cookie).to.be.a('string')
      expect(cookie).to.not.match(/Max-Age/)
    })
  })

  describe('token refresh', function () {
    it('does not refresh a token before the midpoint', async function () {
      const now = Math.floor(Date.now() / 1000)
      const token = signToken(secretKey, WRITE_USER_NAME, {
        iat: now,
        exp: now + 60
      })

      const res = await authenticatedGet(token)
      expect(res.status).to.equal(200)
      expect(findJauthCookie(res)).to.be.undefined
    })

    it('refreshes a token past the midpoint', async function () {
      const now = Math.floor(Date.now() / 1000)
      const token = signToken(secretKey, WRITE_USER_NAME, {
        iat: now - 60,
        exp: now + 10
      })

      const res = await authenticatedGet(token)
      expect(res.status).to.equal(200)
      const cookie = findJauthCookie(res)
      expect(cookie).to.be.a('string')
      expect(extractTokenFromCookie(cookie!)).to.not.equal(token)
    })

    it('preserves rememberMe=true in refreshed cookie', async function () {
      const now = Math.floor(Date.now() / 1000)
      const token = signToken(secretKey, WRITE_USER_NAME, {
        iat: now - 60,
        exp: now + 10,
        rememberMe: true
      })

      const res = await authenticatedGet(token)
      expect(res.status).to.equal(200)
      const cookie = findJauthCookie(res)
      expect(cookie).to.be.a('string')
      expect(cookie).to.match(/Max-Age=\d+/)
    })

    it('refreshed cookie has no Max-Age when rememberMe is absent', async function () {
      const now = Math.floor(Date.now() / 1000)
      const token = signToken(secretKey, WRITE_USER_NAME, {
        iat: now - 60,
        exp: now + 10
      })

      const res = await authenticatedGet(token)
      expect(res.status).to.equal(200)
      const cookie = findJauthCookie(res)
      expect(cookie).to.be.a('string')
      expect(cookie).to.not.match(/Max-Age/)
    })

    it('refreshed token is valid for subsequent requests', async function () {
      const now = Math.floor(Date.now() / 1000)
      const token = signToken(secretKey, WRITE_USER_NAME, {
        iat: now - 60,
        exp: now + 10
      })

      const res = await authenticatedGet(token)
      const cookie = findJauthCookie(res)
      expect(cookie).to.be.a('string')
      const newToken = extractTokenFromCookie(cookie!)

      const res2 = await authenticatedGet(newToken)
      expect(res2.status).to.equal(200)
    })
  })
})
