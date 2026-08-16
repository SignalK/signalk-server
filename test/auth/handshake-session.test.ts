import { expect } from 'chai'
import express, { Request, Response } from 'express'
import cookieParser from 'cookie-parser'
import { AddressInfo } from 'net'
import { Server } from 'http'
import {
  decryptJson,
  encryptJson,
  handshakeSession,
  HandshakeRequest
} from '../../src/auth/handshake-session'

const SECRET = 'handshake-secret'
const COOKIE = 'HS'
const MAX_AGE_MS = 1000

describe('encryptJson / decryptJson', () => {
  it('round-trips a value', () => {
    const value = { state: 'abc', nested: { n: 1 } }
    expect(decryptJson(encryptJson(value, SECRET), SECRET)).to.deep.equal(value)
  })

  it('rejects a tampered ciphertext and a wrong secret', () => {
    const encrypted = encryptJson({ a: 1 }, SECRET)
    const tampered = encrypted.slice(0, -3) + 'AAA'
    expect(() => decryptJson(tampered, SECRET)).to.throw()
    expect(() => decryptJson(encrypted, 'other')).to.throw()
  })

  it('does not expose the plaintext', () => {
    expect(encryptJson({ verifier: 'topsecret' }, SECRET)).to.not.include(
      'topsecret'
    )
  })
})

describe('handshakeSession middleware', () => {
  let server: Server
  let base: string

  before(async () => {
    const app = express()
    app.use(cookieParser())
    app.use(
      '/auth',
      handshakeSession({
        cookieName: COOKIE,
        cookiePath: '/auth',
        getSecret: () => SECRET,
        maxAgeMs: MAX_AGE_MS
      })
    )
    app.get('/auth/set', (req: Request, res: Response) => {
      ;(req as HandshakeRequest).session!.value = req.query.v
      res.json({ ok: true })
    })
    app.get('/auth/read', (req: Request, res: Response) => {
      res.json((req as HandshakeRequest).session)
    })
    app.get('/auth/clear', (req: Request, res: Response) => {
      ;(req as HandshakeRequest).session = {}
      res.json({ ok: true })
    })
    app.get('/auth/untouched', (req: Request, res: Response) => {
      res.json((req as HandshakeRequest).session)
    })
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s))
    })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  after(() => server.close())

  function cookieOf(response: globalThis.Response): string | undefined {
    return response.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${COOKIE}=`))
  }

  it('sets an encrypted, httpOnly, path-scoped cookie when the session is written', async () => {
    const response = await fetch(`${base}/auth/set?v=hello`)
    const cookie = cookieOf(response)!
    expect(cookie).to.include('HttpOnly')
    expect(cookie).to.include('Path=/auth')
    expect(cookie).to.include('SameSite=Lax')
    expect(cookie).to.not.include('hello')
    const value = cookie.split(';')[0].split('=')[1]
    expect(decryptJson(value, SECRET)).to.include({ value: 'hello' })
  })

  it('restores the session on the next request and clears the cookie once emptied', async () => {
    const set = await fetch(`${base}/auth/set?v=again`)
    const cookie = cookieOf(set)!.split(';')[0]

    const read = await fetch(`${base}/auth/read`, {
      headers: { Cookie: cookie }
    })
    expect(await read.json()).to.deep.equal({ value: 'again' })
    expect(cookieOf(read)).to.equal(undefined)

    const clear = await fetch(`${base}/auth/clear`, {
      headers: { Cookie: cookie }
    })
    const cleared = cookieOf(clear)!
    expect(cleared).to.match(/Expires=Thu, 01 Jan 1970/)
  })

  it('does not set a cookie when the session is left untouched', async () => {
    const response = await fetch(`${base}/auth/untouched`)
    expect(cookieOf(response)).to.equal(undefined)
  })

  it('ignores a tampered or expired cookie', async () => {
    const set = await fetch(`${base}/auth/set?v=x`)
    const cookie = cookieOf(set)!.split(';')[0]
    const tampered = cookie.slice(0, -4) + 'AAAA'
    const read = await fetch(`${base}/auth/read`, {
      headers: { Cookie: tampered }
    })
    expect(await read.json()).to.deep.equal({})

    await new Promise((resolve) => setTimeout(resolve, MAX_AGE_MS + 50))
    const expired = await fetch(`${base}/auth/read`, {
      headers: { Cookie: cookie }
    })
    expect(await expired.json()).to.deep.equal({})
  })
})
