import { expect } from 'chai'
import path from 'node:path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist')

interface TrackingPlugin {
  id: string
  started: boolean
  stopped: boolean
}

/**
 * Server.stop() stops each interface that exposes a stop(). This asserts that
 * the plugins interface participates, so a running plugin is given the chance
 * to release what it opened in start() rather than being left running until
 * the process exits.
 */
describe('Plugin shutdown', () => {
  const previousConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
  let running: { stop: () => Promise<unknown> } | undefined

  beforeEach(() => {
    process.env.SIGNALK_NODE_CONFIG_DIR = path.join(
      __dirname,
      'plugin-stop-config'
    )
  })

  // Runs even when an assertion fails before the explicit stop(), so a failing
  // test does not leave a server listening for the rest of the run.
  afterEach(async () => {
    if (running) {
      await running.stop().catch(() => undefined)
      running = undefined
    }
    if (previousConfigDir === undefined) {
      delete process.env.SIGNALK_NODE_CONFIG_DIR
    } else {
      process.env.SIGNALK_NODE_CONFIG_DIR = previousConfigDir
    }
  })
  it('stops running plugins when the server stops', async () => {
    const port = await freeport()
    const server = new Server({ config: { settings: { port } } })
    running = server
    await server.start()

    const plugin = server.app.plugins.find(
      (p: TrackingPlugin) => p.id === 'stoptrackingplugin'
    ) as TrackingPlugin | undefined

    expect(plugin, 'test plugin should be loaded').to.not.be.undefined
    expect(plugin!.started, 'test plugin should have started').to.be.true
    expect(plugin!.stopped).to.be.false

    await server.stop()
    running = undefined

    expect(plugin!.stopped, 'plugin stop() should have been called').to.be.true
  })

  it('does not stop plugins that never started', async () => {
    const port = await freeport()
    const server = new Server({ config: { settings: { port } } })
    running = server
    await server.start()

    const disabled = server.app.plugins.find(
      (p: TrackingPlugin) => p.id === 'disabledplugin'
    ) as (TrackingPlugin & { stopCalled: boolean }) | undefined

    expect(disabled, 'disabled plugin should be registered').to.not.be.undefined

    await server.stop()
    running = undefined

    expect(
      disabled!.stopCalled,
      'a plugin that never started should not be stopped'
    ).to.be.false
  })
})
