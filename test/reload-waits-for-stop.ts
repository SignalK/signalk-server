import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startServerP } = require('./servertestutilities')

const PLUGIN_ID = 'slowreloadplugin'
// Long enough that a start() which does not wait for stop() runs while the
// old HTTP server is still listening.
const STOP_DELAY_MS = 1500
const POLL_INTERVAL_MS = 50
const POLL_ATTEMPTS = 200

interface SlowStopPlugin {
  id: string
  started: boolean
  stopFinished: boolean
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
    started: false,
    stopFinished: false,
    start: function () {
      plugin.started = true
    },
    stop: function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          plugin.stopFinished = true
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

async function waitFor(done: () => boolean | Promise<boolean>, what: string) {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    if (await done()) return
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw new Error(`timed out waiting until ${what}`)
}

/**
 * reload() stops the server and starts it again. With a plugin whose stop()
 * takes a while, start() must come after the stop has finished, and the server
 * must be listening again once the reload is through.
 */
describe('Server reload', function () {
  it('starts again only after a slow plugin stop has finished', async function () {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-reload-'))
    seedConfigDir(configDir)
    const port = await freeport()
    const server = await startServerP(
      port,
      false,
      { settings: { interfaces: { plugins: true } } },
      undefined,
      configDir
    )
    try {
      const plugin: SlowStopPlugin | undefined = server.app.plugins.find(
        (p: SlowStopPlugin) => p.id === PLUGIN_ID
      )
      expect(plugin?.started, `${PLUGIN_ID} must be running`).to.equal(true)

      const start = server.start.bind(server)
      let stopFinishedAtStart: boolean | undefined
      let restarted: Promise<unknown> | undefined
      server.start = () => {
        stopFinishedAtStart = plugin?.stopFinished
        restarted = start()
        return restarted
      }

      server.reload(undefined)
      await waitFor(() => restarted !== undefined, 'reload() calls start()')
      await restarted

      expect(
        stopFinishedAtStart,
        "start() must wait for the plugin's stop() to finish"
      ).to.equal(true)
      expect(server.app.started, 'the server must be started').to.equal(true)
      const res = await fetch(`http://localhost:${port}/signalk`)
      expect(res.status).to.equal(200)
    } finally {
      await server.stop()
      fs.rmSync(configDir, { recursive: true, force: true })
    }
  })
})
