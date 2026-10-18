import { expect } from 'chai'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const {
  getSecurityConfig,
  saveSecurityConfig,
  startSecurity
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('../dist/security.js')

const SECRET = 'a'.repeat(512)
const OWNER_ONLY = 0o600
const PERMISSION_BITS = 0o777

describe('security secret key storage', () => {
  let configPath: string
  const securityJson = () => join(configPath, 'security.json')
  const keyFile = () => join(configPath, 'security-secret.key')
  const readSecurityJson = () =>
    JSON.parse(readFileSync(securityJson(), 'utf8'))

  beforeEach(() => {
    configPath = mkdtempSync(join(tmpdir(), 'sk-secret-key-'))
  })

  afterEach(() => rmSync(configPath, { recursive: true, force: true }))

  it('saves the secret to an owner-only key file, not security.json', async () => {
    const app = { config: { configPath }, securityStrategy: {} }

    await new Promise((resolve, reject) =>
      saveSecurityConfig(
        app,
        { secretKey: SECRET, users: [] },
        (err: Error | null) => (err ? reject(err) : resolve(undefined))
      )
    )

    expect(readSecurityJson()).to.deep.equal({ users: [] })
    expect(readFileSync(keyFile(), 'utf8')).to.equal(SECRET)
    expect(statSync(keyFile()).mode & PERMISSION_BITS).to.equal(OWNER_ONLY)
    expect(getSecurityConfig(app).secretKey).to.equal(SECRET)
  })

  it('moves a secret found in security.json into the key file at startup', () => {
    writeFileSync(
      securityJson(),
      JSON.stringify({ secretKey: SECRET, users: [] })
    )
    writeFileSync(keyFile(), 'stale')
    const strategyModule = join(configPath, 'strategy.js')
    writeFileSync(
      strategyModule,
      'module.exports = (app, config) => ({ config, isDummy: () => false })'
    )
    const app = {
      config: {
        configPath,
        settings: { security: { strategy: strategyModule } }
      },
      securityStrategy: undefined as unknown as {
        config: { secretKey: string }
      }
    }

    startSecurity(app, undefined)

    expect(readSecurityJson()).to.deep.equal({ users: [] })
    expect(readFileSync(keyFile(), 'utf8')).to.equal(SECRET)
    expect(app.securityStrategy.config.secretKey).to.equal(SECRET)
  })
})
