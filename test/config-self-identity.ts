import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ConfigApp } from '../src/config/config'

const UUID_PATTERN =
  /^urn:mrn:signalk:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function loadFrom() {
  const app = {
    config: {},
    get: (key: string) => (key === 'env' ? 'test' : undefined),
    set: () => undefined,
    use: () => undefined
  } as unknown as ConfigApp
  // load() honours the module-global disableWriteSettings, which other
  // suites in the same mocha process set by passing settings to the
  // constructor. A private copy of the module starts without it.
  const modulePath = require.resolve('../src/config/config')
  delete require.cache[modulePath]
  const saved = process.argv
  process.argv = ['node', 'signalk-server']
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../src/config/config').load(app)
  } finally {
    process.argv = saved
    delete require.cache[modulePath]
  }
  return app
}

function selfDelta(value: object) {
  return {
    context: 'vessels.self',
    updates: [{ values: [{ path: '', value }] }]
  }
}

describe('load() gives the server a self identity', () => {
  let dir: string
  let savedConfigDir: string | undefined
  let savedSettingsEnv: string | undefined
  let savedSkipCheck: string | undefined

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-identity-'))
    savedConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
    savedSettingsEnv = process.env.SIGNALK_NODE_SETTINGS
    savedSkipCheck = process.env.SKIP_ADMINUI_VERSION_CHECK
    process.env.SIGNALK_NODE_CONFIG_DIR = dir
    delete process.env.SIGNALK_NODE_SETTINGS
    process.env.SKIP_ADMINUI_VERSION_CHECK = '1'
    fs.writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({ pipedProviders: [] })
    )
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

  const baseDeltasFile = () => path.join(dir, 'baseDeltas.json')
  const writeBaseDeltas = (contents: string) =>
    fs.writeFileSync(baseDeltasFile(), contents)
  const readBaseDeltas = () =>
    JSON.parse(fs.readFileSync(baseDeltasFile(), 'utf8'))

  it('uses the mmsi when there is one', () => {
    writeBaseDeltas(
      JSON.stringify([selfDelta({ name: 'Aline', mmsi: '244123456' })])
    )
    const app = loadFrom()
    expect(app.selfId).to.equal('urn:mrn:imo:mmsi:244123456')
    expect(app.selfContext).to.equal('vessels.urn:mrn:imo:mmsi:244123456')
  })

  it('generates a uuid when the self delta has only a name', () => {
    writeBaseDeltas(JSON.stringify([selfDelta({ name: 'Einstein' })]))
    const app = loadFrom()
    expect(app.selfType).to.equal('uuid')
    expect(app.selfId).to.match(UUID_PATTERN)
    expect(app.selfContext).to.equal(`vessels.${app.selfId}`)
    expect(app.config.vesselName).to.equal('Einstein')
  })

  it('generates a uuid when the mmsi was cleared', () => {
    writeBaseDeltas(JSON.stringify([selfDelta({ name: 'Einstein', mmsi: '' })]))
    expect(loadFrom().selfId).to.match(UUID_PATTERN)
  })

  it('keeps the generated uuid across restarts', () => {
    writeBaseDeltas(JSON.stringify([selfDelta({ name: 'Einstein' })]))
    const first = loadFrom().selfId
    expect(loadFrom().selfId).to.equal(first)
    expect(readBaseDeltas()).to.deep.equal([
      selfDelta({ name: 'Einstein', uuid: first })
    ])
  })

  it('keeps the generated uuid across restarts on a fresh install', () => {
    const first = loadFrom().selfId
    expect(first).to.match(UUID_PATTERN)
    expect(loadFrom().selfId).to.equal(first)
  })

  it('does not create baseDeltas.json when running from defaults.json', () => {
    fs.writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({ pipedProviders: [], useBaseDeltas: false })
    )
    fs.writeFileSync(
      path.join(dir, 'defaults.json'),
      JSON.stringify({ vessels: { self: { name: 'Einstein' } } })
    )
    expect(loadFrom().selfId).to.match(UUID_PATTERN)
    expect(fs.existsSync(baseDeltasFile())).to.be.false
  })

  it('does not overwrite a baseDeltas.json it cannot parse', () => {
    writeBaseDeltas('{ this is not json')
    expect(loadFrom().selfId).to.match(UUID_PATTERN)
    expect(fs.readFileSync(baseDeltasFile(), 'utf8')).to.equal(
      '{ this is not json'
    )
  })
})
