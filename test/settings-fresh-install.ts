import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { load } from '../src/config/config'
import { ConfigApp } from '../src/config/config'

// load() consults these before config.configPath / the temp dir, so they
// must not leak in from the environment (and must be restored afterwards).
const ENV_OVERRIDES = [
  'SIGNALK_NODE_SETTINGS',
  'SIGNALK_NODE_CONFIG_DIR',
  'SIGNALK_NODE_CONDFIG_DIR'
]

function makeApp(configPath: string): ConfigApp {
  return {
    config: { configPath },
    argv: {},
    // load() ends by wiring development/production middleware into what
    // is normally the express app; the stubs keep the test at the config
    // layer and make both branches no-ops.
    get: () => 'test',
    use: () => undefined
  } as unknown as ConfigApp
}

describe('settings defaults on fresh install', () => {
  let dir: string
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-fresh-install-'))
    savedEnv = {}
    for (const key of ENV_OVERRIDES) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    for (const key of ENV_OVERRIDES) {
      if (savedEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = savedEnv[key]
      }
    }
  })

  it('seeds enforceDataTimeouts true when no settings file exists', () => {
    const app = makeApp(dir)

    load(app)

    expect(app.config.settings.enforceDataTimeouts).to.equal(true)
    // The seed is an in-memory default, not an eager write: settings.json
    // appears only when the user first saves settings.
    expect(fs.existsSync(path.join(dir, 'settings.json'))).to.equal(false)
  })

  it('leaves enforceDataTimeouts unset when a settings file predates it', () => {
    fs.writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({ pipedProviders: [] })
    )
    const app = makeApp(dir)

    load(app)

    expect(app.config.settings.enforceDataTimeouts).to.equal(undefined)
  })

  it('keeps an explicit enforceDataTimeouts false', () => {
    fs.writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({ enforceDataTimeouts: false, pipedProviders: [] })
    )
    const app = makeApp(dir)

    load(app)

    expect(app.config.settings.enforceDataTimeouts).to.equal(false)
  })
})
