import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startServerP } = require('./servertestutilities')

const PLUGIN_ID = 'stopreasonplugin'

interface RecordingPlugin {
  id: string
  starts: number
  stopReasons: unknown[]
  restartWith: (configuration: object) => void
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
  return {
    id: '${PLUGIN_ID}',
    name: '${PLUGIN_ID}',
    starts: 0,
    stopReasons: [],
    start: function (config, restart) {
      this.starts++
      this.restartWith = restart
    },
    stop: function (options) {
      this.stopReasons.push(options && options.reason)
    },
    schema: function () { return {} }
  }
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

// The configuration POST answers before the plugin has stopped.
const POLL_INTERVAL_MS = 50
const POLL_ATTEMPTS = 100

describe('plugin stop() reason', function () {
  let configDir: string
  let host: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any

  before(async function () {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-stop-reason-'))
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

  function plugin(): RecordingPlugin {
    const found = server.app.plugins.find(
      (p: RecordingPlugin) => p.id === PLUGIN_ID
    )
    if (!found) throw new Error(`${PLUGIN_ID} was not loaded`)
    return found
  }

  async function waitFor(done: () => boolean, what: string) {
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      if (done()) return
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    throw new Error(`plugin was not ${what}`)
  }

  // Captures the count synchronously, so call it before triggering the stop.
  async function nextStopReason(): Promise<unknown> {
    const seen = plugin().stopReasons.length
    await waitFor(() => plugin().stopReasons.length > seen, 'stopped')
    return plugin().stopReasons[seen]
  }

  async function saveConfig(enabled: boolean) {
    const res = await fetch(`${host}/skServer/plugins/${PLUGIN_ID}/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled, configuration: {} })
    })
    expect(res.status).to.equal(200)
  }

  it('is restart when saved configuration restarts the plugin', async () => {
    const reason = nextStopReason()
    await saveConfig(true)
    expect(await reason).to.equal('restart')
  })

  it('is restart when the plugin restarts itself', async () => {
    const reason = nextStopReason()
    plugin().restartWith({})
    expect(await reason).to.equal('restart')
  })

  it('is disable when the plugin is disabled', async () => {
    const reason = nextStopReason()
    await saveConfig(false)
    expect(await reason).to.equal('disable')
  })

  it('is shutdown when the server stops', async () => {
    // Re-enable it, and wait until it runs again: the server only stops
    // plugins that are started.
    const starts = plugin().starts
    await saveConfig(true)
    await waitFor(() => plugin().starts > starts, 'started')
    const instance = plugin()
    const recorded = instance.stopReasons.length
    await server.stop()
    server = undefined
    expect(instance.stopReasons.slice(recorded)).to.deep.equal(['shutdown'])
  })
})
