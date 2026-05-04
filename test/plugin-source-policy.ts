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
  'sourcepolicyplugin.json'
)

const writeConfig = (sourcePolicy?: 'preferred' | 'all') => {
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify({
      enabled: true,
      configuration: sourcePolicy ? { sourcePolicy } : {}
    })
  )
}

// The plugin wrapper is meant to forward command.sourcePolicy through to
// the underlying subscriptionmanager — that is the entire surface of the
// fix. Asserting on the buses themselves is already covered by the
// WS-level test/sourcePolicy.ts; here we just need to prove the wrapper
// does not drop the 6th arg as it used to.
describe('Plugin sourcePolicy', () => {
  before(() => {
    process.env.SIGNALK_NODE_CONFIG_DIR = CONFIG_DIR
  })

  after(() => {
    if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE)
  })

  const captureSubscribeArgs = async (
    sourcePolicy?: 'preferred' | 'all'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> => {
    writeConfig(sourcePolicy)
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
        (p: PluginInfo) => p.id === 'sourcepolicyplugin'
      )
      assert(plugin, 'sourcepolicyplugin should be loaded')
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

  it("forwards command.sourcePolicy='all' to the subscriptionmanager", async () => {
    const args = await captureSubscribeArgs('all')
    assert.strictEqual(
      args[5],
      'all',
      "subscriptionmanager.subscribe should receive 'all' as 6th argument"
    )
  })

  it('omits sourcePolicy when the plugin does not set it (preferred default)', async () => {
    const args = await captureSubscribeArgs()
    assert.strictEqual(
      args[5],
      undefined,
      'subscriptionmanager.subscribe should receive undefined when no policy is set'
    )
  })
})
