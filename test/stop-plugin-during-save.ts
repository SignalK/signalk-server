import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startServerP } = require('./servertestutilities')

const PLUGIN_ID = 'stopduringsaveplugin'
// Long enough for the test to call stopPlugin while the save's stop runs.
const STOP_DELAY_MS = 300
const POLL_INTERVAL_MS = 10
const POLL_ATTEMPTS = 500

interface CountingPlugin {
  id: string
  starts: number
  stopCalls: number
  stopsFinished: number
  running: boolean
}

function seedConfigDir(configDir: string) {
  const moduleDir = path.join(configDir, 'node_modules', PLUGIN_ID)
  fs.mkdirSync(moduleDir, { recursive: true })
  fs.writeFileSync(
    path.join(configDir, 'package.json'),
    JSON.stringify({
      name: 'signalk-server-config',
      version: '0.0.1',
      dependencies: { [PLUGIN_ID]: '^1.0.0' }
    })
  )
  fs.writeFileSync(
    path.join(moduleDir, 'package.json'),
    JSON.stringify({
      name: PLUGIN_ID,
      version: '1.0.0',
      keywords: ['signalk-node-server-plugin'],
      main: 'index.js'
    })
  )
  fs.writeFileSync(
    path.join(moduleDir, 'index.js'),
    `module.exports = function () {
  const plugin = {
    id: '${PLUGIN_ID}',
    name: '${PLUGIN_ID}',
    starts: 0,
    stopCalls: 0,
    stopsFinished: 0,
    running: false,
    start: function () {
      plugin.starts++
      plugin.running = true
    },
    stop: function () {
      plugin.stopCalls++
      return new Promise(function (resolve) {
        setTimeout(function () {
          plugin.running = false
          plugin.stopsFinished++
          resolve()
        }, ${STOP_DELAY_MS})
      })
    },
    schema: function () { return {} }
  }
  return plugin
}
`
  )
  const pluginConfigDir = path.join(configDir, 'plugin-config-data')
  fs.mkdirSync(pluginConfigDir, { recursive: true })
  fs.writeFileSync(
    path.join(pluginConfigDir, `${PLUGIN_ID}.json`),
    JSON.stringify({ enabled: true, configuration: {} })
  )
}

// A configuration save stops the plugin and starts it again once that stop
// settles. A stopPlugin call (the App Store removal) arriving in between must
// leave the plugin stopped, not running again on the saved configuration.
describe('stopPlugin during a configuration save', function () {
  let configDir: string
  let host: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any

  before(async function () {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-stop-during-save-'))
    seedConfigDir(configDir)
    const port = await freeport()
    host = 'http://localhost:' + port
    server = await startServerP(
      port,
      false,
      { settings: { interfaces: { plugins: true } } },
      undefined,
      configDir
    )
  })

  after(async function () {
    if (server) await server.stop()
    if (configDir) fs.rmSync(configDir, { recursive: true, force: true })
  })

  async function waitFor(done: () => boolean, what: string) {
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      if (done()) return
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    throw new Error(`plugin was not ${what}`)
  }

  function plugin(): CountingPlugin {
    return server.app.plugins.find((p: CountingPlugin) => p.id === PLUGIN_ID)
  }

  async function saveConfig(enabled: boolean) {
    const res = await fetch(`${host}/skServer/plugins/${PLUGIN_ID}/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled, configuration: {} })
    })
    expect(res.status).to.equal(200)
  }

  it('stops the plugin the save starts again', async function () {
    expect(plugin().starts, `${PLUGIN_ID} must be running`).to.equal(1)

    await saveConfig(true)
    await waitFor(() => plugin().stopCalls === 1, 'stopped by the save')
    expect(plugin().running, 'the save stop must still be running').to.equal(
      true
    )

    await server.app.stopPlugin(PLUGIN_ID)

    expect(plugin().starts, 'the save starts the plugin again').to.equal(2)
    expect(plugin().running, 'stopPlugin stops it after that').to.equal(false)
  })

  it('waits for a stop a later save begins meanwhile', async function () {
    const calls = plugin().stopCalls

    await saveConfig(false)
    await waitFor(() => plugin().stopCalls === calls + 1, 'stopped by a save')
    const stopped = server.app.stopPlugin(PLUGIN_ID)
    await saveConfig(false)
    await waitFor(
      () => plugin().stopCalls === calls + 2,
      'stopped by the later save'
    )

    await stopped

    expect(
      plugin().stopsFinished,
      'no stop may still be running when stopPlugin resolves'
    ).to.equal(plugin().stopCalls)
  })

  // Stops the shared server, so it runs last.
  it('lets a server stop wait for the save and stop what it starts', async function () {
    await saveConfig(true)
    await waitFor(() => plugin().running, 'started by the save')
    const calls = plugin().stopCalls
    const starts = plugin().starts

    await saveConfig(true)
    await waitFor(() => plugin().stopCalls === calls + 1, 'stopped by a save')
    await server.stop()

    expect(plugin().starts, 'the save starts the plugin again').to.equal(
      starts + 1
    )
    expect(plugin().running, 'the server stop stops it after that').to.equal(
      false
    )
    expect(
      plugin().stopsFinished,
      'no stop may still be running when the server stop resolves'
    ).to.equal(plugin().stopCalls)
  })
})
