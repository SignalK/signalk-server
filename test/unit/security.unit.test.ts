import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  createCertificateOptions,
  getCAChainArray,
  getCertificateOptions,
  getRateLimitValidationOptions,
  getSecurityConfig,
  pathForSecurityConfig,
  requestAccess,
  saveSecurityConfig,
  startSecurity
} from '../../src/security'
import type { WithConfig } from '../../src/app'
import type { WithSecurityStrategy } from '../../src/security'

type TestApp = WithConfig &
  WithSecurityStrategy & {
    config: { configPath: string; settings: Record<string, unknown> }
    securityStrategy: Record<string, unknown>
  }

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sk-sec-'))

const createApp = (configPath: string): TestApp => {
  return {
    config: { configPath, settings: {} },
    securityStrategy: {}
  } as TestApp
}

describe('security module', () => {
  it('uses dummy strategy when none is configured', () => {
    const app = createApp(createTempDir())

    startSecurity(app, undefined)

    expect(app.securityStrategy.isDummy?.()).to.equal(true)
  })

  it('loads security strategy from environment and persists config args', () => {
    const tempDir = createTempDir()
    const modulePath = path.join(tempDir, 'security-strategy.js')
    fs.writeFileSync(
      modulePath,
      "module.exports = () => ({ marker: 'custom', configFromArguments: false, securityConfig: undefined, requestAccess: () => undefined })\n"
    )

    const envBackup = process.env.SECURITYSTRATEGY
    process.env.SECURITYSTRATEGY = modulePath

    try {
      const app = createApp(tempDir)
      const securityConfig = { allow_readonly: true }

      startSecurity(app, securityConfig)

      expect(app.securityStrategy.marker).to.equal('custom')
      expect(app.securityStrategy.configFromArguments).to.equal(true)
      expect(app.securityStrategy.securityConfig).to.equal(securityConfig)
    } finally {
      if (typeof envBackup === 'undefined') {
        delete process.env.SECURITYSTRATEGY
      } else {
        process.env.SECURITYSTRATEGY = envBackup
      }
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('returns config from strategy arguments when set', () => {
    const app = createApp(createTempDir())
    app.securityStrategy.configFromArguments = true
    app.securityStrategy.securityConfig = { foo: 'bar' }

    const result = getSecurityConfig(app)

    expect(result).to.deep.equal({ foo: 'bar' })
  })

  it('builds the security config path', () => {
    const app = createApp('/tmp/config')
    expect(pathForSecurityConfig(app)).to.equal('/tmp/config/security.json')
  })

  it('saves security config in memory when arguments are used', (done) => {
    const app = createApp(createTempDir())
    app.securityStrategy.configFromArguments = true

    saveSecurityConfig(app, { foo: 'bar' }, (err: Error | null) => {
      expect(err).to.equal(null)
      expect(app.securityStrategy.securityConfig).to.deep.equal({ foo: 'bar' })
      done()
    })
  })

  it('writes security config to disk when not using arguments', (done) => {
    const tempDir = createTempDir()
    const app = createApp(tempDir)
    app.securityStrategy.configFromArguments = false

    saveSecurityConfig(app, { foo: 'bar' }, (err: Error | null) => {
      expect(err).to.equal(null)
      const contents = fs.readFileSync(
        path.join(tempDir, 'security.json'),
        'utf8'
      )
      expect(JSON.parse(contents)).to.deep.equal({ foo: 'bar' })
      done()
    })
  })

  it('returns existing certificate options when files are present', (done) => {
    const tempDir = createTempDir()
    const app = createApp(tempDir)
    const keyPath = path.join(tempDir, 'ssl-key.pem')
    const certPath = path.join(tempDir, 'ssl-cert.pem')
    const chainPath = path.join(tempDir, 'ssl-chain.pem')

    fs.writeFileSync(keyPath, 'key')
    fs.writeFileSync(certPath, 'cert')
    fs.writeFileSync(
      chainPath,
      '-----BEGIN CERTIFICATE-----\nA\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\nB\n-----END CERTIFICATE-----\n'
    )
    fs.chmodSync(keyPath, 0o600)
    fs.chmodSync(certPath, 0o600)

    getCertificateOptions(
      app,
      (
        err: Error | null,
        options: { key: Buffer; cert: Buffer; ca?: Buffer[] }
      ) => {
        expect(err).to.equal(null)
        expect(options.key.toString()).to.equal('key')
        expect(options.cert.toString()).to.equal('cert')
        expect(options.ca).to.have.length(2)
        fs.rmSync(tempDir, { recursive: true, force: true })
        done()
      }
    )
  })

  it('rejects certificates with loose permissions', (done) => {
    const tempDir = createTempDir()
    const app = createApp(tempDir)
    const keyPath = path.join(tempDir, 'ssl-key.pem')
    const certPath = path.join(tempDir, 'ssl-cert.pem')

    fs.writeFileSync(keyPath, 'key')
    fs.writeFileSync(certPath, 'cert')
    fs.chmodSync(keyPath, 0o644)
    fs.chmodSync(certPath, 0o600)

    getCertificateOptions(app, (err: Error | null) => {
      expect(err).to.be.instanceOf(Error)
      expect(err?.message).to.contain('ssl-key.pem')
      fs.rmSync(tempDir, { recursive: true, force: true })
      done()
    })
  })

  it('parses certificate chains from file', () => {
    const tempDir = createTempDir()
    const chainPath = path.join(tempDir, 'chain.pem')
    fs.writeFileSync(
      chainPath,
      '-----BEGIN CERTIFICATE-----\nONE\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\nTWO\n-----END CERTIFICATE-----\n'
    )

    const chain = getCAChainArray(chainPath)

    expect(chain).to.have.length(2)
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates certificate files when missing', (done) => {
    const tempDir = createTempDir()
    const app = createApp(tempDir)
    const keyPath = path.join(tempDir, 'ssl-key.pem')
    const certPath = path.join(tempDir, 'ssl-cert.pem')

    createCertificateOptions(app, certPath, keyPath, (err: Error | null) => {
      expect(err).to.equal(null)
      expect(fs.existsSync(keyPath)).to.equal(true)
      expect(fs.existsSync(certPath)).to.equal(true)
      fs.rmSync(tempDir, { recursive: true, force: true })
      done()
    })
  })

  it('forwards request access to security strategy', async () => {
    const app = createApp(createTempDir())
    app.securityStrategy.configFromArguments = true
    app.securityStrategy.securityConfig = { foo: 'bar' }
    let seenConfig: unknown
    let seenRequest: unknown
    let seenIp: unknown
    app.securityStrategy.requestAccess = (
      config: unknown,
      request: unknown,
      ip: unknown
    ) => {
      seenConfig = config
      seenRequest = request
      seenIp = ip
      return Promise.resolve({ ok: true })
    }

    const reply = await requestAccess(
      app,
      { request: true },
      '127.0.0.1',
      () => {}
    )

    expect(reply).to.deep.equal({ ok: true })
    expect(seenConfig).to.deep.equal({ foo: 'bar' })
    expect(seenRequest).to.deep.equal({ request: true })
    expect(seenIp).to.equal('127.0.0.1')
  })

  it('returns rate limit options when trustProxy is enabled', () => {
    const app = createApp(createTempDir())
    app.config.settings.trustProxy = true

    const result = getRateLimitValidationOptions(app)

    expect(result).to.deep.equal({
      xForwardedForHeader: false,
      trustProxy: false
    })
  })

  it('returns undefined rate limit options when trustProxy is disabled', () => {
    const app = createApp(createTempDir())
    app.config.settings.trustProxy = 'false'

    const result = getRateLimitValidationOptions(app)

    expect(result).to.equal(undefined)
  })
})
