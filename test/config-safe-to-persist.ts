import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { load, ConfigApp } from '../src/config/config'

// load() reads process.argv directly, so each case swaps it and restores
// it afterwards. Settings are read from a config directory rather than
// handed to the constructor: constructor-supplied settings set the
// module-global disableWriteSettings for the rest of the process, which
// would disarm the file assertions in the other suites.
function withArgv<T>(args: string[], run: () => T): T {
  const saved = process.argv
  process.argv = ['node', 'signalk-server', ...args]
  try {
    return run()
  } finally {
    process.argv = saved
  }
}

// load() ends by handing the app to config/development and
// config/production, which ask it for express-style accessors.
function loadInto(dir: string, args: string[]) {
  const app = {
    config: {},
    get: (key: string) => (key === 'env' ? 'test' : undefined),
    set: () => undefined,
    use: () => undefined
  } as unknown as ConfigApp
  withArgv(args, () => load(app))
  return app
}

describe('load() decides when settings are safe to persist', () => {
  let dir: string
  let savedConfigDir: string | undefined
  let savedSettingsEnv: string | undefined
  let savedSkipCheck: string | undefined

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-config-'))
    savedConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
    savedSettingsEnv = process.env.SIGNALK_NODE_SETTINGS
    savedSkipCheck = process.env.SKIP_ADMINUI_VERSION_CHECK
    process.env.SIGNALK_NODE_CONFIG_DIR = dir
    delete process.env.SIGNALK_NODE_SETTINGS
    process.env.SKIP_ADMINUI_VERSION_CHECK = '1'
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
    restore('SIGNALK_NODE_CONFIG_DIR', savedConfigDir)
    restore('SIGNALK_NODE_SETTINGS', savedSettingsEnv)
    restore('SKIP_ADMINUI_VERSION_CHECK', savedSkipCheck)
  })

  const writeSettings = (contents: string) =>
    fs.writeFileSync(path.join(dir, 'settings.json'), contents)

  it('stays true for an ordinary start', () => {
    writeSettings(JSON.stringify({ pipedProviders: [] }))
    expect(loadInto(dir, []).config.safeToPersistSettings).to.be.true
  })

  it('is cleared by --data', () => {
    writeSettings(JSON.stringify({ pipedProviders: [] }))
    expect(
      loadInto(dir, ['--data', path.join(dir, 'trip.log')]).config
        .safeToPersistSettings
    ).to.be.false
  })

  it('is cleared by --sample-nmea0183-data', () => {
    writeSettings(JSON.stringify({ pipedProviders: [] }))
    expect(
      loadInto(dir, ['--sample-nmea0183-data']).config.safeToPersistSettings
    ).to.be.false
  })

  it('is cleared by --sample-n2k-data', () => {
    writeSettings(JSON.stringify({ pipedProviders: [] }))
    expect(loadInto(dir, ['--sample-n2k-data']).config.safeToPersistSettings).to
      .be.false
  })

  it('is cleared when the settings file cannot be parsed', () => {
    writeSettings('{ this is not json')
    expect(loadInto(dir, []).config.safeToPersistSettings).to.be.false
  })

  it('stays true when there is no settings file at all', () => {
    expect(loadInto(dir, []).config.safeToPersistSettings).to.be.true
  })

  it('is cleared when settings come from the constructor call', () => {
    // That branch sets the module-global disableWriteSettings, which no
    // export resets, and every suite shares one mocha process. Loading a
    // private copy of the module confines the flag to this case: the
    // instance the other suites hold never runs this branch, and the
    // second purge stops a later importer from inheriting this one.
    const modulePath = require.resolve('../src/config/config')
    delete require.cache[modulePath]
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const isolated = require('../src/config/config')
      const app = {
        config: { settings: { pipedProviders: [] } },
        get: (key: string) => (key === 'env' ? 'test' : undefined),
        set: () => undefined,
        use: () => undefined
      } as unknown as ConfigApp
      withArgv([], () => isolated.load(app))
      expect(app.config.safeToPersistSettings).to.be.false
    } finally {
      delete require.cache[modulePath]
    }
  })
})
