import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startServerP } = require('./servertestutilities')

interface Received {
  $source: string
  value: unknown
}

interface ExcludePlugin {
  id: string
  start: (options: object) => void
  stop: () => void
  _received: Received[]
}

interface TestServer {
  app: {
    plugins: ExcludePlugin[]
    handleMessage: (providerId: string, delta: object) => void
  }
  stop: () => Promise<void>
}

const PLUGIN_ID = 'sourceexcludeplugin'
const PLUGIN_SOURCE = path.join(
  __dirname,
  'plugin-test-config',
  'node_modules',
  PLUGIN_ID
)
const PATH = 'environment.inside.test.pressure'
const PRESSURE = 101300

// A value that is published once, such as a selection made at another
// plugin's start, reaches a plugin that subscribes later only through the
// subscription's cache bootstrap.
describe('Plugin subscriptions with security enabled', () => {
  let configDir: string
  let server: TestServer
  let plugin: ExcludePlugin

  before(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-plugin-sub-cache-'))
    fs.cpSync(PLUGIN_SOURCE, path.join(configDir, 'node_modules', PLUGIN_ID), {
      recursive: true
    })
    const pluginConfigDir = path.join(configDir, 'plugin-config-data')
    fs.mkdirSync(pluginConfigDir)
    fs.writeFileSync(
      path.join(pluginConfigDir, `${PLUGIN_ID}.json`),
      JSON.stringify({ enabled: true, configuration: {} })
    )
    // The bundled resources-provider creates its folders after start and
    // would recreate the config dir after cleanup
    fs.writeFileSync(
      path.join(pluginConfigDir, 'resources-provider.json'),
      JSON.stringify({ enabled: false })
    )
    server = await startServerP(
      await freeport(),
      true,
      { settings: { interfaces: { plugins: true } } },
      undefined,
      configDir
    )
    const found = server.app.plugins.find((p) => p.id === PLUGIN_ID)
    assert(found, `${PLUGIN_ID} should be loaded`)
    plugin = found
    server.app.handleMessage('test-source', {
      updates: [{ values: [{ path: PATH, value: PRESSURE }] }]
    })
  })

  after(async () => {
    if (server) await server.stop()
    if (configDir) fs.rmSync(configDir, { recursive: true, force: true })
  })

  const restartAndCollect = (options: object): unknown[] => {
    plugin.stop()
    const before = plugin._received.length
    plugin.start(options)
    return plugin._received.slice(before).map((received) => received.value)
  }

  it('starts a plugin subscription from the cached value', () => {
    assert.deepStrictEqual(restartAndCollect({}), [PRESSURE])
  })

  it('starts an excludeSelf subscription from the cached value', () => {
    assert.deepStrictEqual(restartAndCollect({ excludeSelf: true }), [PRESSURE])
  })
})
