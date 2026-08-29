import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist/')

interface PluginInfo {
  id: string
}

const CONFIG_DIR = path.join(__dirname, 'plugin-test-config')
const CONFIG_FILE = path.join(
  CONFIG_DIR,
  'plugin-config-data',
  'skroutesplugin.json'
)

// Booting a real server under ts-node, twice, on a cold cache. The other
// server-booting suites here use 60s for the same reason.
const TEST_TIMEOUT_MS = 60000

/**
 * `getOpenApi` has to be honoured whichever way a plugin mounts its routes.
 *
 * It used to be called only inside the `registerWithRouter` branch, so a
 * plugin serving under `/signalk/v1/api` had its description silently dropped
 * — while the plugin docs recommend implementing it to anyone exposing an API,
 * without distinguishing the two.
 *
 * The fixture `skroutesplugin` uses `signalKApiRoutes`; the demo `testplugin`
 * covers the `registerWithRouter` side, so both paths are exercised.
 */
describe('Plugin OpenAPI registration', () => {
  let origConfigDir: string | undefined

  before(() => {
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

  it('registers the description of a plugin mounting under /signalk/v1/api', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    const port = await freeport()
    const server = new Server({ config: { settings: { port } } })
    await server.start()
    try {
      const plugin = server.app.plugins.find(
        (p: PluginInfo) => p.id === 'skroutesplugin'
      )
      assert(plugin, 'skroutesplugin should be loaded')

      const res = await fetch(
        `http://localhost:${port}/skServer/openapi/plugins/skroutesplugin`
      )
      assert.strictEqual(
        res.status,
        200,
        'the description should be served, not 404'
      )
      const doc = (await res.json()) as {
        paths?: Record<string, unknown>
        servers?: { url: string }[]
      }
      assert(
        doc.paths?.['/skroutestest'],
        'the documented path should be present'
      )
      // The plugin declares its own servers because it does not mount under
      // /plugins/<id>; the server must not overwrite that.
      assert.strictEqual(doc.servers?.[0]?.url, '/signalk/v1/api')
    } finally {
      await server.stop()
    }
  })

  it('still registers the description of a registerWithRouter plugin', async function () {
    this.timeout(TEST_TIMEOUT_MS)
    const port = await freeport()
    const server = new Server({ config: { settings: { port } } })
    await server.start()
    try {
      const res = await fetch(
        `http://localhost:${port}/skServer/openapi/plugins/testplugin`
      )
      assert.strictEqual(res.status, 200)
    } finally {
      await server.stop()
    }
  })
})
