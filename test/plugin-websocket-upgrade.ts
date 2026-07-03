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
const OPEN_TIMEOUT_MS = 5000
const SETTLE_TIMEOUT_MS = 5000
const POLL_INTERVAL_MS = 50

function writeUpgradePluginConfig(enabled: boolean) {
  fs.writeFileSync(
    PLUGIN_CONFIG_FILE,
    JSON.stringify({ enabled, configuration: {} }, null, 2)
  )
}

async function setPluginConfig(
  port: number,
  enabled: boolean,
  configuration: Record<string, unknown> = {}
) {
  const res = await fetch(
    `http://localhost:${port}/skServer/plugins/upgradetestplugin/config`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled, configuration })
    }
  )
  assert.equal(res.status, 200)
}

// The config POST returns before the async stop/restart cycle finishes, so
// poll the /echo endpoint until it reaches the expected state rather than
// sleeping a fixed interval that can be too short on slow CI.
async function waitForEcho(
  open: (pathname: string) => Promise<string>,
  present: boolean
) {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS
  for (;;) {
    let reached: boolean
    try {
      reached = (await open('/plugins/upgradetestplugin/echo')) === 'echo:hello'
    } catch (err) {
      // The endpoint 404s (or otherwise fails) while the plugin is stopped.
      reached = !present && /404/.test(String(err))
    }
    if (reached) {
      return
    }
    if (Date.now() > deadline) {
      throw new Error(
        `/echo did not become ${present ? 'available' : 'unavailable'} in time`
      )
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
}

interface ServerHandle {
  start(): Promise<unknown>
  stop(): Promise<unknown>
}

describe('plugin WebSocket endpoints', () => {
  let server: ServerHandle
  let port: number
  let previousConfigDir: string | undefined

  before(async () => {
    previousConfigDir = process.env.SIGNALK_NODE_CONFIG_DIR
    process.env.SIGNALK_NODE_CONFIG_DIR = CONFIG_DIR
    writeUpgradePluginConfig(true)
    port = await freeport()
    server = new Server({ config: { settings: { port } } }) as ServerHandle
    await server.start()
  })

  after(async () => {
    writeUpgradePluginConfig(false)
    try {
      if (server) {
        await server.stop()
      }
    } finally {
      // Always restore the env var, even if stop() rejects, so the change
      // does not leak into other test files.
      if (previousConfigDir === undefined) {
        delete process.env.SIGNALK_NODE_CONFIG_DIR
      } else {
        process.env.SIGNALK_NODE_CONFIG_DIR = previousConfigDir
      }
    }
  })

  function open(pathname: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}${pathname}`)
      const timer = setTimeout(() => {
        ws.close()
        reject(new Error(`WebSocket open() timeout for ${pathname}`))
      }, OPEN_TIMEOUT_MS)
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

  it('completes the handshake and emits connection on a registered path', async () => {
    const reply = await open('/plugins/upgradetestplugin/echo')
    assert.equal(reply, 'echo:hello')
  })

  it('matches paths exactly — sub-paths are not dispatched', async () => {
    await assert.rejects(open('/plugins/upgradetestplugin/echo/sub'), /404/)
  })

  it('rejects paths the plugin has not registered', async () => {
    await assert.rejects(open('/plugins/upgradetestplugin/nope'), /404/)
  })

  it("hands the raw upgrade to an 'upgrade' listener instead of completing the handshake", async () => {
    await assert.rejects(open('/plugins/upgradetestplugin/raw'), /418/)
  })

  it('does not break the primary Signal K WebSocket', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/signalk/v1/stream`)
    ws.on('open', () => {
      ws.close()
      done()
    })
    ws.on('error', done)
  })

  it('re-registers endpoints across a config-change restart', async () => {
    await setPluginConfig(port, true)
    await waitForEcho(open, true)
    const reply = await open('/plugins/upgradetestplugin/echo')
    assert.equal(reply, 'echo:hello')
  })

  it('rolls back a registered endpoint when start() throws', async () => {
    // A start() that registers an endpoint and then throws must leave
    // nothing behind, so the endpoint 404s and a later clean start still
    // succeeds (rather than throwing on a duplicate registration).
    await setPluginConfig(port, true, { failAfterRegister: true })
    await waitForEcho(open, false)
    await assert.rejects(open('/plugins/upgradetestplugin/echo'), /404/)

    await setPluginConfig(port, true, {})
    await waitForEcho(open, true)
    const reply = await open('/plugins/upgradetestplugin/echo')
    assert.equal(reply, 'echo:hello')
  })

  it('removes endpoints when the plugin stops', async () => {
    // A live connection must be terminated when the plugin stops, and new
    // upgrades must then be rejected.
    await setPluginConfig(port, true, {})
    await waitForEcho(open, true)

    const live = new WebSocket(
      `ws://localhost:${port}/plugins/upgradetestplugin/echo`
    )
    await new Promise<void>((resolve, reject) => {
      live.on('open', () => resolve())
      live.on('error', reject)
    })
    const closed = new Promise<void>((resolve, reject) => {
      live.on('close', () => resolve())
      const timer = setTimeout(
        () =>
          reject(
            new Error('live connection was not closed when plugin stopped')
          ),
        SETTLE_TIMEOUT_MS
      )
      live.on('close', () => clearTimeout(timer))
    })

    await setPluginConfig(port, false)
    await closed
    await waitForEcho(open, false)
    await assert.rejects(open('/plugins/upgradetestplugin/echo'), /404/)
  })
})
