import { Request, RequestHandler, Response } from 'express'
import onHeaders from 'on-headers'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from 'crypto'

/**
 * Minimal `req.session` for the redirect leg of a passport login.
 *
 * Passport strategies for OAuth 2.0 / OpenID Connect keep their state, PKCE
 * verifier and nonce in `req.session` between the login redirect and the
 * callback. The server has no server-side session store, so the session
 * lives in an AES-256-GCM encrypted cookie scoped to the auth routes and
 * only exists while a login is in flight: it is written when a handler puts
 * something into `req.session` and cleared as soon as the session is empty
 * again.
 */

export type HandshakeSession = Record<string, unknown>

export interface HandshakeRequest extends Request {
  session?: HandshakeSession
}

export interface HandshakeSessionOptions {
  cookieName: string
  cookiePath: string
  /** Secret the encryption key is derived from; read per request */
  getSecret: () => string
  maxAgeMs: number
}

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const CREATED_AT_KEY = '__createdAt'

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

export function encryptJson(value: unknown, secret: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final()
  ])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    'base64url'
  )
}

/** @throws on tampered or undecryptable input */
export function decryptJson(encrypted: string, secret: string): unknown {
  const combined = Buffer.from(encrypted, 'base64url')
  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), iv)
  decipher.setAuthTag(authTag)
  return JSON.parse(
    Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8'
    )
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readSession(
  req: Request,
  options: HandshakeSessionOptions
): HandshakeSession {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[
    options.cookieName
  ]
  if (!cookie) {
    return {}
  }
  try {
    const decrypted = decryptJson(cookie, options.getSecret())
    if (!isRecord(decrypted)) {
      return {}
    }
    const createdAt = decrypted[CREATED_AT_KEY]
    if (
      typeof createdAt !== 'number' ||
      Date.now() - createdAt > options.maxAgeMs
    ) {
      return {}
    }
    delete decrypted[CREATED_AT_KEY]
    return decrypted
  } catch {
    return {}
  }
}

function isSecureRequest(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https'
}

export function handshakeSession(
  options: HandshakeSessionOptions
): RequestHandler {
  return (req: Request, res: Response, next) => {
    const hReq = req as HandshakeRequest
    const session = readSession(req, options)
    const before = JSON.stringify(session)
    hReq.session = session

    onHeaders(res, () => {
      const current = hReq.session ?? {}
      const after = JSON.stringify(current)
      if (after === before) {
        return
      }
      const cookieOptions = {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: isSecureRequest(req),
        path: options.cookiePath
      }
      if (Object.keys(current).length === 0) {
        res.clearCookie(options.cookieName, cookieOptions)
        return
      }
      res.cookie(
        options.cookieName,
        encryptJson(
          { ...current, [CREATED_AT_KEY]: Date.now() },
          options.getSecret()
        ),
        { ...cookieOptions, maxAge: options.maxAgeMs }
      )
    })

    next()
  }
}
