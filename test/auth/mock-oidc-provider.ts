/**
 * In-process OpenID Connect provider for end-to-end tests: discovery,
 * authorization code flow with PKCE, RS256-signed ID tokens, userinfo,
 * JWKS and RP-initiated logout. Every request is recorded so tests can
 * assert on what the server sent.
 */
import http, { IncomingMessage, ServerResponse } from 'http'
import { AddressInfo } from 'net'
import {
  createHash,
  generateKeyPairSync,
  KeyObject,
  randomBytes,
  sign
} from 'crypto'

export interface MockUser {
  sub: string
  /** Claims placed in the ID token */
  idTokenClaims?: Record<string, unknown>
  /** Claims returned by the userinfo endpoint */
  userinfoClaims?: Record<string, unknown>
}

interface IssuedCode {
  user: MockUser
  clientId: string
  redirectUri: string
  nonce?: string
  codeChallenge?: string
  codeChallengeMethod?: string
}

export interface RecordedRequest {
  path: string
  method: string
  query: URLSearchParams
  headers: http.IncomingHttpHeaders
  body?: URLSearchParams
}

const KID = 'test-key'
const ID_TOKEN_TTL_SECONDS = 300

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => resolve(data))
  })
}

export class MockOIDCProvider {
  readonly clientId = 'signalk-test-client'
  readonly clientSecret = 'signalk-test-secret'
  readonly requests: RecordedRequest[] = []
  /** Identity the next authorization request logs in as */
  user: MockUser = { sub: 'user-1' }
  /** Make the next authorization request fail with access_denied */
  denyNextAuthorization = false
  /** Omit the id_token from the next token response */
  omitIdTokenOnce = false

  private server?: http.Server
  private port = 0
  private readonly privateKey: KeyObject
  private readonly publicJwk: Record<string, unknown>
  private readonly codes = new Map<string, IssuedCode>()
  private readonly accessTokens = new Map<string, MockUser>()

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048
    })
    this.privateKey = privateKey
    this.publicJwk = {
      ...publicKey.export({ format: 'jwk' }),
      kid: KID,
      use: 'sig',
      alg: 'RS256'
    }
  }

  get issuer(): string {
    return `http://127.0.0.1:${this.port}`
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch((err) => {
        res.writeHead(500).end(String(err))
      })
    })
    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve)
    )
    this.port = (this.server.address() as AddressInfo).port
  }

  async stop(): Promise<void> {
    const server = this.server
    if (!server) {
      return
    }
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  reset(): void {
    this.requests.length = 0
    this.denyNextAuthorization = false
    this.omitIdTokenOnce = false
    this.user = { sub: 'user-1' }
    this.codes.clear()
    this.accessTokens.clear()
  }

  requestsTo(path: string): RecordedRequest[] {
    return this.requests.filter((r) => r.path === path)
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url!, this.issuer)
    const recorded: RecordedRequest = {
      path: url.pathname,
      method: req.method!,
      query: url.searchParams,
      headers: req.headers
    }
    if (req.method === 'POST') {
      recorded.body = new URLSearchParams(await readBody(req))
    }
    this.requests.push(recorded)

    switch (url.pathname) {
      case '/.well-known/openid-configuration':
        return this.json(res, {
          issuer: this.issuer,
          authorization_endpoint: `${this.issuer}/authorize`,
          token_endpoint: `${this.issuer}/token`,
          userinfo_endpoint: `${this.issuer}/userinfo`,
          jwks_uri: `${this.issuer}/jwks`,
          end_session_endpoint: `${this.issuer}/logout`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['client_secret_post'],
          scopes_supported: ['openid', 'email', 'profile', 'groups']
        })
      case '/jwks':
        return this.json(res, { keys: [this.publicJwk] })
      case '/authorize':
        return this.authorize(url.searchParams, res)
      case '/token':
        return this.token(recorded.body!, res)
      case '/userinfo':
        return this.userinfo(req, res)
      case '/logout': {
        const target = url.searchParams.get('post_logout_redirect_uri')
        if (target) {
          res.writeHead(302, { Location: target }).end()
        } else {
          res.writeHead(200).end('logged out')
        }
        return
      }
      default:
        res.writeHead(404).end()
    }
  }

  private json(res: ServerResponse, body: unknown, status = 200) {
    res
      .writeHead(status, { 'Content-Type': 'application/json' })
      .end(JSON.stringify(body))
  }

  private authorize(params: URLSearchParams, res: ServerResponse) {
    const redirectUri = params.get('redirect_uri')
    if (params.get('client_id') !== this.clientId || !redirectUri) {
      return this.json(res, { error: 'invalid_request' }, 400)
    }
    const location = new URL(redirectUri)
    const state = params.get('state')
    if (state) {
      location.searchParams.set('state', state)
    }
    if (this.denyNextAuthorization) {
      this.denyNextAuthorization = false
      location.searchParams.set('error', 'access_denied')
      location.searchParams.set('error_description', 'User denied access')
    } else {
      const code = randomBytes(16).toString('hex')
      this.codes.set(code, {
        user: this.user,
        clientId: this.clientId,
        redirectUri,
        nonce: params.get('nonce') ?? undefined,
        codeChallenge: params.get('code_challenge') ?? undefined,
        codeChallengeMethod: params.get('code_challenge_method') ?? undefined
      })
      location.searchParams.set('code', code)
    }
    res.writeHead(302, { Location: location.href }).end()
  }

  private token(body: URLSearchParams, res: ServerResponse) {
    if (
      body.get('client_id') !== this.clientId ||
      body.get('client_secret') !== this.clientSecret
    ) {
      return this.json(res, { error: 'invalid_client' }, 401)
    }
    if (body.get('grant_type') !== 'authorization_code') {
      return this.json(res, { error: 'unsupported_grant_type' }, 400)
    }
    const issued = this.codes.get(body.get('code') ?? '')
    if (!issued || issued.redirectUri !== body.get('redirect_uri')) {
      return this.json(res, { error: 'invalid_grant' }, 400)
    }
    this.codes.delete(body.get('code')!)
    if (issued.codeChallenge) {
      const verifier = body.get('code_verifier') ?? ''
      const challenge = base64url(
        createHash('sha256').update(verifier).digest()
      )
      if (
        issued.codeChallengeMethod !== 'S256' ||
        challenge !== issued.codeChallenge
      ) {
        return this.json(
          res,
          {
            error: 'invalid_grant',
            error_description: 'PKCE verification failed'
          },
          400
        )
      }
    }
    const accessToken = randomBytes(16).toString('hex')
    this.accessTokens.set(accessToken, issued.user)
    const response: Record<string, unknown> = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile'
    }
    if (this.omitIdTokenOnce) {
      this.omitIdTokenOnce = false
    } else {
      response.id_token = this.signIdToken(issued)
    }
    this.json(res, response)
  }

  private signIdToken(issued: IssuedCode): string {
    const now = Math.floor(Date.now() / 1000)
    const payload: Record<string, unknown> = {
      iss: this.issuer,
      sub: issued.user.sub,
      aud: issued.clientId,
      iat: now,
      exp: now + ID_TOKEN_TTL_SECONDS,
      ...(issued.nonce ? { nonce: issued.nonce } : {}),
      ...issued.user.idTokenClaims
    }
    const header = { alg: 'RS256', typ: 'JWT', kid: KID }
    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(signingInput),
      this.privateKey
    )
    return `${signingInput}.${base64url(signature)}`
  }

  private userinfo(req: IncomingMessage, res: ServerResponse) {
    const token = req.headers.authorization?.replace(/^Bearer /, '')
    const user = token ? this.accessTokens.get(token) : undefined
    if (!user) {
      return this.json(res, { error: 'invalid_token' }, 401)
    }
    this.json(res, { sub: user.sub, ...user.userinfoClaims })
  }
}
