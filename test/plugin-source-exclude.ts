import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist/')

interface PluginInfo {
  id: string
}

interface PluginOptions {
  excludeSelf?: boolean
  excludeSources?: string[]
}

const CONFIG_DIR = path.join(__dirname, 'plugin-test-config')
const CONFIG_FILE = path.join(
  CONFIG_DIR,
  'plugin-config-data',
  'sourceexcludeplugin.json'
)

const writeConfig = (options: PluginOptions) => {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify({
      enabled: true,
      configuration: options
    })
  )
}

// Asserts the plugin wrapper resolves excludeSelf to [plugin.id] and
// forwards a merged excludeSources to the underlying
// subscriptionmanager. End-to-end exclude routing (per-subscription
// engine + cache replay) is covered by test/deltaPriority.ts; here
// we just need to prove the wrapper produces the right call.
// Position of the excludeSources argument in subscriptionmanager.subscribe:
// (command, unsubscribes, errorCallback, callback, user, sourcePolicy, excludeSources)
const EXCLUDE_SOURCES_ARG_INDEX = 6

describe('Plugin excludeSelf / excludeSources', () => {
  const originalConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
  before(() => {
    process.env.SIGNALK_NODE_CONFIG_DIR = CONFIG_DIR
  })

  after(() => {
    if (originalConfigDir === undefined) {
      delete process.env.SIGNALK_NODE_CONFIG_DIR
    } else {
      process.env.SIGNALK_NODE_CONFIG_DIR = originalConfigDir
    }
    if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE)
  })

  const captureSubscribeArgs = async (
    options: PluginOptions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> => {
    writeConfig(options)
    const port = await freeport()
    const server = new Server({ config: { settings: { port } } })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const captured: any[] = []
    const original = server.app.subscriptionmanager
    server.app.subscriptionmanager = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subscribe: (...args: any[]) => {
        captured.push(args)
        return original.subscribe(...args)
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unsubscribe: (...args: any[]) => original.unsubscribe(...args)
    }

    await server.start()
    try {
      const plugin = server.app.plugins.find(
        (p: PluginInfo) => p.id === 'sourceexcludeplugin'
      )
      assert(plugin, 'sourceexcludeplugin should be loaded')
      const ours = captured.find(
        (args) =>
          args[0]?.subscribe?.[0]?.path === 'environment.inside.test.pressure'
      )
      assert(ours, 'plugin subscribe call should be captured')
      return ours
    } finally {
      await server.stop()
    }
  }

  it('resolves excludeSelf:true to [plugin.id] as the 7th argument', async () => {
    const args = await captureSubscribeArgs({ excludeSelf: true })
    assert.deepStrictEqual(
      args[EXCLUDE_SOURCES_ARG_INDEX],
      ['sourceexcludeplugin'],
      'excludeSelf should be expanded to [plugin.id]'
    )
  })

  it('forwards an explicit excludeSources list', async () => {
    const args = await captureSubscribeArgs({
      excludeSources: ['otherPlugin']
    })
    assert.deepStrictEqual(
      args[EXCLUDE_SOURCES_ARG_INDEX],
      ['otherPlugin'],
      'excludeSources should be forwarded as-is'
    )
  })

  it('merges excludeSelf with an explicit excludeSources list', async () => {
    const args = await captureSubscribeArgs({
      excludeSelf: true,
      excludeSources: ['otherPlugin']
    })
    assert(
      Array.isArray(args[EXCLUDE_SOURCES_ARG_INDEX]),
      'excludeSources arg should be an array'
    )
    const set = new Set(args[EXCLUDE_SOURCES_ARG_INDEX])
    assert(
      set.has('sourceexcludeplugin'),
      "merged list should include the plugin's own id"
    )
    assert(set.has('otherPlugin'), 'merged list should include explicit refs')
    assert.strictEqual(set.size, 2, 'merged list should be deduplicated')
  })

  it('omits the excludeSources argument when neither field is set', async () => {
    const args = await captureSubscribeArgs({})
    assert.strictEqual(
      args[EXCLUDE_SOURCES_ARG_INDEX],
      undefined,
      'subscriptionmanager.subscribe should receive undefined when no excludes are set'
    )
  })
})
