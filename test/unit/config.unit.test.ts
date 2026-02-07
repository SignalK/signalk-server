import { expect } from 'chai'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)

const configModule = require('../../src/config/config') as {
  getConfigDirectory: (app: {
    argv: Record<string, unknown>
    config: Record<string, unknown>
    env: Record<string, string | undefined>
  }) => string
  readDefaultsFile: (app: {
    config: { configPath: string; appPath: string }
  }) => Record<string, unknown> | unknown
  sendBaseDeltas: (app: {
    config: { baseDeltaEditor: { deltas: unknown[] } }
    handleMessage: (source: string, delta: unknown) => void
  }) => void
  writeSettingsFile: (
    app: { argv: Record<string, unknown>; config: { configPath: string } },
    settings: unknown,
    cb: (err?: Error) => void
  ) => void
}

const DeltaEditor = require('../../src/deltaeditor') as {
  new (): { deltas: unknown[] }
}

describe('config module', () => {
  it('uses the highest-priority config directory', () => {
    const result = configModule.getConfigDirectory({
      argv: { c: '/tmp/argv' },
      config: { configPath: '/tmp/config', appPath: '/tmp/app' },
      env: {
        SIGNALK_NODE_CONFIG_DIR: '/tmp/env',
        HOME: '/tmp/home'
      }
    })

    expect(result).to.equal(path.resolve('/tmp/env'))
  })

  it('uses appPath when settings file is provided', () => {
    const result = configModule.getConfigDirectory({
      argv: { s: 'settings.json' },
      config: { appPath: '/tmp/app' },
      env: {}
    })

    expect(result).to.equal(path.resolve('/tmp/app'))
  })

  it('reads defaults from config directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signalk-config-'))
    const defaultsPath = path.join(tempDir, 'defaults.json')
    fs.writeFileSync(defaultsPath, JSON.stringify({ foo: 'bar' }))

    const defaults = configModule.readDefaultsFile({
      config: { configPath: tempDir, appPath: '/tmp/app' }
    }) as { foo: string }

    expect(defaults.foo).to.equal('bar')

    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('writes settings to the configured filename', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signalk-settings-'))
    const app = {
      argv: { s: 'settings.json' },
      config: { configPath: tempDir }
    }

    await new Promise<void>((resolve, reject) => {
      configModule.writeSettingsFile(app, { pipedProviders: [] }, (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })

    const contents = fs.readFileSync(
      path.join(tempDir, 'settings.json'),
      'utf8'
    )
    expect(JSON.parse(contents)).to.deep.equal({ pipedProviders: [] })

    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('sends base deltas through handleMessage', () => {
    const deltaEditor = new DeltaEditor()
    deltaEditor.deltas = [
      { context: 'vessels.self', updates: [{ values: [] }] }
    ]

    const seen: unknown[] = []
    configModule.sendBaseDeltas({
      config: { baseDeltaEditor: deltaEditor },
      handleMessage: (source, delta) => {
        seen.push({ source, delta })
      }
    })

    expect(seen).to.have.length(1)
    expect(seen[0]).to.deep.include({ source: 'defaults' })
  })
})
