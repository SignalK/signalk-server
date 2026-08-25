import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist/')

interface PluginInfo {
  id: string
  // The app copy a plugin is handed, which is what these assertions are about.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: Record<string, any>
}

/** Booting a real server with its plugins is slow on a cold cache. */
const TEST_TIMEOUT_MS = 30000

const CONFIG_DIR = path.join(__dirname, 'plugin-test-config')
const CONFIG_FILE = path.join(
  CONFIG_DIR,
  'plugin-config-data',
  'testplugin.json'
)

/**
 * The provider registries a plugin is handed.
 *
 * `HistoryProviderRegistry` declares both `registerHistoryApiProvider` and
 * `unregisterHistoryApiProvider`, and `ServerAPI` extends it, so both are part
 * of the typed surface a plugin sees and TypeScript accepts either call. The
 * unregister half was declared but never assigned, which made it a runtime
 * TypeError at a call site the compiler had approved.
 *
 * Asserted against the real `plugin.app` from a booted server rather than a
 * reconstruction of the wiring: the defect was in the wiring, so a test that
 * rebuilt it would have passed either way.
 */
describe('Plugin provider registries', () => {
  let origConfigDir: string | undefined

  before(() => {
    // Restored afterwards: mocha runs every test file in one process, so
    // leaving this set would point whatever runs next at the plugin fixtures.
    origConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
    process.env.SIGNALK_NODE_CONFIG_DIR = CONFIG_DIR
    fs.mkdirSync(path.join(CONFIG_DIR, 'plugin-config-data'), {
      recursive: true
    })
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify({ enabled: true, configuration: {} })
    )
  })

  after(() => {
    if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE)
    if (origConfigDir === undefined) {
      delete process.env.SIGNALK_NODE_CONFIG_DIR
    } else {
      process.env.SIGNALK_NODE_CONFIG_DIR = origConfigDir
    }
  })

  it('gives a plugin both halves of the history provider registry', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    const port = await freeport()
    const server = new Server({ config: { settings: { port } } })
    await server.start()
    try {
      const plugin = server.app.plugins.find(
        (p: PluginInfo) => p.id === 'testplugin'
      )
      assert(plugin, 'testplugin should be loaded')

      assert.strictEqual(
        typeof plugin.app.registerHistoryApiProvider,
        'function',
        'registerHistoryApiProvider missing from the plugin app'
      )
      assert.strictEqual(
        typeof plugin.app.unregisterHistoryApiProvider,
        'function',
        'unregisterHistoryApiProvider missing from the plugin app'
      )
    } finally {
      await server.stop()
    }
  })

  it('withdraws a provider without stopping the plugin', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    const port = await freeport()
    const server = new Server({ config: { settings: { port } } })
    await server.start()
    try {
      const plugin = server.app.plugins.find(
        (p: PluginInfo) => p.id === 'testplugin'
      )
      assert(plugin, 'testplugin should be loaded')

      // Asserted against the registry rather than getHistoryApi(): other
      // plugins in the test config register providers too, so the API still
      // resolves through one of those and would hide whether this one left.
      const providers = () => [
        ...server.app.historyApiHttpRegistry.historyProviders.keys()
      ]
      assert(
        providers().includes('testplugin'),
        'testplugin registers a history provider at start'
      )

      plugin.app.unregisterHistoryApiProvider()

      assert(
        !providers().includes('testplugin'),
        'the provider should be gone while the plugin stays loaded'
      )
      assert(plugin.started, 'the plugin itself should still be running')
    } finally {
      await server.stop()
    }
  })
})
