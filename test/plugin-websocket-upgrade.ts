import { strict as assert } from 'assert'
import fs from 'fs'
import path from 'path'
import WebSocket from 'ws'

import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Server = require('../dist/')

const CONFIG_DIR = path.join(__dirname, 'plugin-test-config')
const PLUGIN_CONFIG_FILE = path.join(
  CONFIG_DIR,
  'plugin-config-data',
  'upgradetestplugin.json'
)

function writeUpgradePluginConfig(enabled: boolean) {
  fs.writeFileSync(
    PLUGIN_CONFIG_FILE,
    JSON.stringify({ enabled, configuration: {} }, null, 2)
  )
}

interface ServerHandle {
  start(): Promise<unknown>
  stop(): Promise<unknown>
}

describe('plugin WebSocket upgrade hook', () => {
  let server: ServerHandle
  let port: number

  before(async () => {
    process.env.SIGNALK_NODE_CONFIG_DIR = CONFIG_DIR
    writeUpgradePluginConfig(true)
    port = await freeport()
    server = new Server({ config: { settings: { port } } }) as ServerHandle
    await server.start()
  })

  after(async () => {
    writeUpgradePluginConfig(false)
    if (server) {
      await server.stop()
    }
  })

  function open(pathname: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}${pathname}`)
      const timer = setTimeout(() => {
        ws.close()
        reject(new Error(`WebSocket open() timeout for ${pathname}`))
      }, 5000)
      ws.on('open', () => ws.send('hello'))
      ws.on('message', (data) => {
        clearTimeout(timer)
        ws.close()
        resolve(data.toString())
      })
      ws.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }

  it('dispatches upgrades on a registered pattern to the plugin', async () => {
    const reply = await open('/plugins/upgradetestplugin/echo')
    assert.equal(reply, 'echo:hello')
  })

  it('matches sub-paths of the registered pattern', async () => {
    const reply = await open('/plugins/upgradetestplugin/echo/sub')
    assert.equal(reply, 'echo:hello')
  })

  it('does not break the primary Signal K WebSocket', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/signalk/v1/stream`)
    ws.on('open', () => {
      ws.close()
      done()
    })
    ws.on('error', done)
  })

  it('keeps the upgrade registration across a config-change restart', async () => {
    // Reproduces the bug where saving plugin config triggered
    // stopPlugin -> doPluginStart, but the upgrade registration was
    // wiped on stop and never re-added on start. After this round-trip,
    // the WebSocket must still reach the plugin handler.
    const res = await fetch(
      `http://localhost:${port}/skServer/plugins/upgradetestplugin/config`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true, configuration: {} })
      }
    )
    assert.equal(res.status, 200)
    // Give the plugin host a moment to finish stop-then-start.
    await new Promise((r) => setTimeout(r, 500))

    const reply = await open('/plugins/upgradetestplugin/echo')
    assert.equal(reply, 'echo:hello')
  })
})
