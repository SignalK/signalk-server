import { expect } from 'chai'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)

type Settings = {
  pipedProviders?: unknown[]
  interfaces?: Record<string, unknown>
  security?: { strategy?: string }
  ssl?: boolean
  wsCompression?: boolean
  landingPage?: string
}

type TestApp = {
  config: {
    appPath: string
    configPath: string
    settings?: Settings
    defaults?: Record<string, unknown>
    security?: boolean
    overrideTimestampWithNow?: boolean
  }
  env: Record<string, string | undefined>
  argv: Record<string, unknown>
  handleMessage: () => void
  get: () => string
  use: () => void
  selfId?: string
}

const loadConfigModule = () => {
  const configPath = require.resolve('../../src/config/config')
  delete require.cache[configPath]
  return require('../../src/config/config') as {
    load: (app: TestApp) => void
    writeSettingsFile: (
      app: TestApp,
      settings: Settings,
      cb: (err?: Error) => void
    ) => void
  }
}

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sk-config-'))

describe('config load', () => {
  const originalArgv = process.argv
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.argv = originalArgv
    process.env = { ...originalEnv }
  })

  it('loads settings from constructor defaults and skips settings file writes', (done) => {
    const tempDir = createTempDir()
    const configModule = loadConfigModule()

    const app: TestApp = {
      config: {
        appPath: tempDir,
        configPath: tempDir,
        settings: { pipedProviders: [] },
        defaults: {
          vessels: {
            self: {
              name: 'Boat',
              mmsi: '123',
              navigation: { speedOverGround: { value: 3 } },
              meta: { displayName: 'Boat' },
              communication: { callsignVhf: 'CALL' }
            }
          }
        }
      },
      env: {},
      argv: {},
      handleMessage: () => undefined,
      get: () => 'test',
      use: () => undefined
    }

    process.env.SKIP_ADMINUI_VERSION_CHECK = 'true'
    configModule.load(app)

    const settingsPath = path.join(tempDir, 'settings.json')
    configModule.writeSettingsFile(app, { pipedProviders: [] }, () => {
      expect(fs.existsSync(settingsPath)).to.equal(false)
      expect(app.selfId).to.equal('urn:mrn:imo:mmsi:123')
      fs.rmSync(tempDir, { recursive: true, force: true })
      done()
    })
  })

  it('creates base deltas from defaults when missing', () => {
    const tempDir = createTempDir()
    const configModule = loadConfigModule()

    fs.writeFileSync(
      path.join(tempDir, 'defaults.json'),
      JSON.stringify({ vessels: { self: { name: 'Boat' } } })
    )

    const app: TestApp = {
      config: {
        appPath: '/tmp/app',
        configPath: tempDir,
        settings: undefined
      },
      env: {},
      argv: {},
      handleMessage: () => undefined,
      get: () => 'test',
      use: () => undefined
    }

    process.env.SKIP_ADMINUI_VERSION_CHECK = 'true'
    configModule.load(app)

    const baseDeltasPath = path.join(tempDir, 'baseDeltas.json')
    expect(fs.existsSync(baseDeltasPath)).to.equal(true)
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('falls back to empty settings when settings file is invalid', () => {
    const tempDir = createTempDir()
    const configModule = loadConfigModule()

    fs.writeFileSync(path.join(tempDir, 'settings.json'), '{not-json')

    const app: TestApp = {
      config: {
        appPath: tempDir,
        configPath: tempDir,
        settings: undefined
      },
      env: {},
      argv: { s: 'settings.json' },
      handleMessage: () => undefined,
      get: () => 'test',
      use: () => undefined
    }

    process.env.SKIP_ADMINUI_VERSION_CHECK = 'true'
    configModule.load(app)

    expect(app.config.settings.pipedProviders).to.deep.equal([])
    expect(app.config.settings.interfaces).to.deep.equal({})
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('handles sample data flags and env overrides', () => {
    const tempDir = createTempDir()
    const configModule = loadConfigModule()

    process.argv = [
      'node',
      'script',
      '--sample-nmea0183-data',
      '--sample-n2k-data',
      '--override-timestamps',
      '--securityenabled'
    ]
    process.env.SKIP_ADMINUI_VERSION_CHECK = 'true'
    process.env.SSLPORT = '1234'
    process.env.WSCOMPRESSION = 'true'

    const app: TestApp = {
      config: {
        appPath: tempDir,
        configPath: tempDir,
        settings: { pipedProviders: [] },
        security: false
      },
      env: process.env,
      argv: {},
      handleMessage: () => undefined,
      get: () => 'test',
      use: () => undefined
    }

    configModule.load(app)

    expect(app.config.settings.pipedProviders).to.have.length(2)
    expect(app.config.overrideTimestampWithNow).to.equal(true)
    expect(app.config.settings.security).to.deep.equal({
      strategy: './tokensecurity'
    })
    expect(app.config.settings.ssl).to.equal(true)
    expect(app.config.settings.wsCompression).to.equal(true)
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('rejects invalid landingPage values', () => {
    const tempDir = createTempDir()
    const configModule = loadConfigModule()

    let exited = false
    const exitBackup = process.exit
    process.exit = (() => {
      exited = true
      throw new Error('exit')
    }) as typeof process.exit

    const app: TestApp = {
      config: {
        appPath: tempDir,
        configPath: tempDir,
        settings: { pipedProviders: [], landingPage: 'invalid' }
      },
      env: {},
      argv: {},
      handleMessage: () => undefined,
      get: () => 'test',
      use: () => undefined
    }

    process.env.SKIP_ADMINUI_VERSION_CHECK = 'true'

    try {
      configModule.load(app)
    } catch {
      expect(exited).to.equal(true)
    } finally {
      process.exit = exitBackup
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
