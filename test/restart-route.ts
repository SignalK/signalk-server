import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freeport } from './ts-servertestutilities'
import { startServerP, getAdminToken } from './servertestutilities'

const PLUGIN_ID = 'slowstopplugin'
// Long enough that an exit which does not wait for stop() comes first.
const STOP_DELAY_MS = 500
// The route's own delay plus the shutdown deadline, with room to spare: a
// restart that never reaches process.exit fails here, not at mocha's timeout.
const EXIT_WAIT_MS = 15000

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

/**
 * The admin UI's restart exits the process and relies on the supervisor to
 * start it again. It must stop the server first, as a SIGTERM does, so that
 * plugins and providers get to close, and an asynchronous plugin stop() must
 * finish before the exit. process.exit is replaced for the duration so the
 * exit can be observed without ending the test run.
 */
describe('admin restart', function () {
  it('stops the server and its plugins before the process exits', async function () {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-restart-'))
    seedConfigDir(configDir)
    const port = await freeport()
    const server = await startServerP(
      port,
      true,
      { settings: { interfaces: { plugins: true } } },
      undefined,
      configDir
    )
    try {
      const plugin: SlowStopPlugin | undefined = server.app.plugins.find(
        (p: SlowStopPlugin) => p.id === PLUGIN_ID
      )
      expect(plugin?.started, `${PLUGIN_ID} must be running`).to.equal(true)
      const token = await getAdminToken(server)

      const originalExit = process.exit
      try {
        const exited = new Promise<{
          code: unknown
          started: boolean
          stopFinished: boolean | undefined
        }>((resolve) => {
          process.exit = ((code?: number) => {
            resolve({
              code,
              started: server.app.started,
              stopFinished: plugin?.stopFinished
            })
          }) as typeof process.exit
        })
        const res = await fetch(`http://0.0.0.0:${port}/skServer/restart`, {
          method: 'PUT',
          headers: { Cookie: `JAUTHENTICATION=${token}` }
        })
        expect(res.status).to.equal(200)

        let waited: NodeJS.Timeout | undefined
        const { code, started, stopFinished } = await Promise.race([
          exited,
          new Promise<never>((_resolve, reject) => {
            waited = setTimeout(
              () => reject(new Error('the restart never called process.exit')),
              EXIT_WAIT_MS
            )
          })
        ]).finally(() => clearTimeout(waited))
        expect(started, 'server must be stopped before exit').to.equal(false)
        expect(
          stopFinished,
          "the plugin's stop() must finish before exit"
        ).to.equal(true)
        expect(code).to.equal(0)
      } finally {
        process.exit = originalExit
      }
    } finally {
      await server.stop()
      fs.rmSync(configDir, { recursive: true, force: true })
    }
  })
})
