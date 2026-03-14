import assert from 'assert'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist/')

interface PluginInfo {
  id: string
  packageName: string
}

interface ProviderStatus {
  id: string
  type: string
  message: string
  statusType?: string
}

describe('Plugin crash isolation', () => {
  it('survives a plugin that throws in a subscription callback', async () => {
    process.env.SIGNALK_NODE_CONFIG_DIR = path.join(
      __dirname,
      'plugin-test-config'
    )

    const port = await freeport()
    const server = new Server({
      config: { settings: { port } }
    })
    await server.start()

    const crashingPlugin = server.app.plugins.find(
      (p: PluginInfo) => p.id === 'crashingplugin'
    )
    assert(crashingPlugin, 'Crashing plugin should be loaded')

    server.app.handleMessage('test', {
      updates: [
        {
          values: [
            {
              path: 'environment.outside.pressure',
              value: 101325
            }
          ]
        }
      ]
    })

    // Allow the delta to propagate through the BaconJS pipeline
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Server should still be running
    assert(
      server.app.started,
      'Server should still be running after plugin crash'
    )

    // The plugin error should be reported via provider status
    const statuses: ProviderStatus[] = server.app.getProviderStatus()
    const errorStatus = statuses.find(
      (s: ProviderStatus) => s.id === 'crashingplugin' && s.type === 'error'
    )
    assert(errorStatus, 'Crashing plugin should have error status')
    assert(
      errorStatus.message.includes('tendency'),
      `Error message should contain the original error text, got: ${errorStatus.message}`
    )

    await server.stop()
  })
})
