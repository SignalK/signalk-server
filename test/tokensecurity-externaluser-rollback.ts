import { expect } from 'chai'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { SecurityConfig } from '../src/security'
import { SECURITY_CONFIG_FILE_MODE } from '../src/security'
import { atomicWriteFile } from '../src/atomicWrite'

// tokensecurity is only reachable as CommonJS; the compiled factory carries
// no types, so the strategy shape is declared below.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokenSecurityFactory = require('../dist/tokensecurity.js')

interface ExternalUser {
  username: string
  type: string
  providerData?: Record<string, unknown>
}

interface ExternalUserService {
  findUserByUsername(username: string): Promise<ExternalUser | null>
  createUser(user: ExternalUser): Promise<void>
  updateUser(
    username: string,
    updates: { type?: string; providerData?: Record<string, unknown> }
  ): Promise<void>
}

interface RollbackStrategy {
  externalUserService: ExternalUserService
}

function makeStrategy(
  configPath: string,
  config: Partial<SecurityConfig> = {}
): RollbackStrategy {
  // setupApp() registers express routes during construction; stub the
  // router verbs as no-ops since this test only exercises the user service.
  const noop = () => undefined
  const app: Record<string, unknown> = {
    config: { configPath },
    use: noop,
    get: noop,
    post: noop,
    put: noop,
    delete: noop
  }
  const strategy = tokenSecurityFactory(app, {
    secretKey: 'test-key',
    users: [],
    ...config
  })
  // saveSecurityConfig consults app.securityStrategy.configFromArguments;
  // mirror startSecurity(), which assigns the strategy onto the app.
  app.securityStrategy = strategy
  return strategy
}

const oidcIdentity = { sub: 'sub-1', issuer: 'https://idp.example.com' }

const MODE_MASK = 0o777

function savedUsernames(saved: unknown): string[] {
  const users = (saved as { users?: unknown }).users
  if (!Array.isArray(users)) {
    throw new Error('saved config has no users array')
  }
  return users.map((user) => (user as { username: string }).username)
}

describe('tokensecurity externalUserService', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-security-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('persists a created user to security.json', async () => {
    const service = makeStrategy(tempDir).externalUserService
    await service.createUser({
      username: 'oidc-user',
      type: 'readonly',
      providerData: { oidc: oidcIdentity }
    })

    expect(await service.findUserByUsername('oidc-user')).to.not.equal(null)

    const configFile = path.join(tempDir, 'security.json')
    const saved: unknown = JSON.parse(fs.readFileSync(configFile, 'utf8'))
    expect(savedUsernames(saved)).to.include('oidc-user')
    if (process.platform !== 'win32') {
      expect(fs.statSync(configFile).mode & MODE_MASK).to.equal(
        SECURITY_CONFIG_FILE_MODE
      )
    }
  })

  it('rolls the created user back out of memory when the save fails', async () => {
    const service = makeStrategy(
      path.join(tempDir, 'missing', 'nested')
    ).externalUserService

    let error: Error | undefined
    try {
      await service.createUser({
        username: 'oidc-user',
        type: 'readonly',
        providerData: { oidc: oidcIdentity }
      })
    } catch (err) {
      error = err as Error
    }

    expect(error).to.be.an('error')
    expect(await service.findUserByUsername('oidc-user')).to.equal(null)
  })

  it('restores the previous record when an update fails to save', async () => {
    const service = makeStrategy(path.join(tempDir, 'missing', 'nested'), {
      users: [{ username: 'alice', type: 'readonly', oidc: oidcIdentity }]
    }).externalUserService

    let error: Error | undefined
    try {
      await service.updateUser('alice', {
        type: 'admin',
        providerData: {
          oidc: { sub: 'sub-2', issuer: 'https://other.example.com' }
        }
      })
    } catch (err) {
      error = err as Error
    }

    expect(error).to.be.an('error')
    const alice = await service.findUserByUsername('alice')
    expect(alice?.type).to.equal('readonly')
    expect(alice?.providerData).to.deep.equal(oidcIdentity)
  })
})

describe('atomicWriteFile', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-atomic-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('applies the requested mode before the file appears', async () => {
    const target = path.join(tempDir, 'out.json')
    await atomicWriteFile(target, '{}', SECURITY_CONFIG_FILE_MODE)
    expect(fs.readFileSync(target, 'utf8')).to.equal('{}')
    if (process.platform !== 'win32') {
      expect(fs.statSync(target).mode & MODE_MASK).to.equal(
        SECURITY_CONFIG_FILE_MODE
      )
    }
  })

  it('leaves an existing file untouched when the write fails', async () => {
    const target = path.join(tempDir, 'out.json')
    fs.writeFileSync(target, '{"existing":true}')

    // A directory at the tmp path makes the write fail, standing in for any
    // mid-write failure: the point is that the target keeps its old contents.
    const tmpPath = target + '.tmp'
    fs.mkdirSync(tmpPath)

    let error: Error | undefined
    try {
      await atomicWriteFile(target, '{"new":true}', SECURITY_CONFIG_FILE_MODE)
    } catch (err) {
      error = err as Error
    } finally {
      fs.rmSync(tmpPath, { recursive: true, force: true })
    }

    expect(error).to.be.an('error')
    expect(fs.readFileSync(target, 'utf8')).to.equal('{"existing":true}')
  })

  it('writes without a mode as before', async () => {
    const target = path.join(tempDir, 'out.json')
    await atomicWriteFile(target, '{"a":1}')
    expect(fs.readFileSync(target, 'utf8')).to.equal('{"a":1}')
  })
})
