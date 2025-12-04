import { expect } from 'chai'
import fs from 'fs'
import net from 'net'
import path from 'path'
import { rimraf } from 'rimraf'
import { SERVERSTATEDIRNAME } from '../src/serverstate/store'
// Import from dist to use the same module instance as the Server
// This is critical because wasmPlugins is a singleton Map
import { shutdownAllWasmPlugins } from '../dist/wasm'

// Test configuration directory for WASM regression tests
const wasmTestConfigDirectory = () =>
  path.join(__dirname, 'wasm-regression-config')

// Get a free port for the test server
function freeport(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    let port = 0

    server.on('listening', () => {
      const address = server.address()

      if (address == null) {
        return reject(new Error('Server was not listening'))
      }

      if (typeof address === 'string') {
        return reject(new Error('Server was Unix Socket'))
      }

      port = address.port
      server.close()
    })

    server.once('close', () => resolve(port))
    server.once('error', reject)
    server.listen(0, '127.0.0.1')
  })
}

// Create directory if it doesn't exist
function mkDirSync(dirPath: string) {
  try {
    fs.mkdirSync(dirPath, { recursive: true })
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw err
    }
  }
}

// Write plugin config file
function writePluginConfig(pluginId: string, config: object) {
  const configDir = path.join(wasmTestConfigDirectory(), 'plugin-config-data')
  mkDirSync(configDir)
  fs.writeFileSync(
    path.join(configDir, `${pluginId}.json`),
    JSON.stringify(config)
  )
}

// Clean up config directory before tests
const emptyConfigDirectory = async () => {
  await Promise.all(
    [SERVERSTATEDIRNAME, 'resources', 'plugin-config-data']
      .map((subDir) => path.join(wasmTestConfigDirectory(), subDir))
      .map((dir) => rimraf(dir))
  )
}

// Setup plugin configs
function setupPluginConfigs() {
  // Enable Node.js test plugin
  writePluginConfig('testplugin', {
    enabled: true,
    configuration: {}
  })

  // Enable WASM plugin - config file uses plugin ID from WASM binary
  // Plugin ID is 'anchor-watch-rust' (without @signalk/ scope)
  writePluginConfig('anchor-watch-rust', {
    enabled: true,
    configuration: {
      maxRadius: 100
    }
  })
}

// Wait for a specific plugin to be loaded
async function waitForPlugin(
  server: any,
  pluginId: string,
  timeout: number = 5000
): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const plugin = server.app.plugins.find((p: any) => p.id === pluginId)
    if (plugin) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

// Start server with WASM regression test config
async function startWasmTestServer(port: number) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Server = require('../dist')

  const props = {
    config: {
      defaults: {
        vessels: {
          self: {
            uuid: 'urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d',
            name: 'Test Vessel'
          }
        }
      },
      settings: {
        port: port,
        pipedProviders: [],
        interfaces: {
          plugins: true
        }
      }
    }
  }

  process.env.SIGNALK_NODE_CONFIG_DIR = wasmTestConfigDirectory()
  process.env.SIGNALK_DISABLE_SERVER_UPDATES = 'true'

  const server = new Server(props)
  await server.start()

  // Wait for WASM plugin to finish loading (it loads async after server.start())
  await waitForPlugin(server, 'anchor-watch-rust', 10000)

  return server
}

describe('WASM Plugin Regression Tests', function () {
  // WASM loading can be slow
  this.timeout(60000)

  describe('Node.js Plugin Compatibility', function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any
    let port: number

    before(async function () {
      await emptyConfigDirectory()
      setupPluginConfigs()
      port = await freeport()
      server = await startWasmTestServer(port)
    })

    after(async function () {
      if (server) {
        await server.stop()
      }
    })

    it('Node.js plugin loads and starts', function () {
      const plugin = server.app.plugins.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.id === 'testplugin'
      )
      expect(plugin).to.exist
      expect(plugin.started).to.be.true
    })

    it('Node.js plugin appears in pluginsMap', function () {
      expect(server.app.pluginsMap['testplugin']).to.exist
    })

    it('Node.js plugin can emit deltas', function () {
      // The testplugin emits a delta on start - check via signalk.self
      const value = server.app.signalk.self?.test?.plugin?.started?.value
      expect(value).to.equal(true)
    })

    it('Node.js plugin HTTP endpoint is accessible', async function () {
      const resp = await fetch(
        `http://localhost:${port}/plugins/testplugin/test-endpoint`
      )
      expect(resp.status).to.equal(200)
      const json = await resp.json()
      expect(json.ok).to.equal(true)
    })
  })

  describe('WASM Plugin Functionality', function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any
    let port: number

    before(async function () {
      await emptyConfigDirectory()
      setupPluginConfigs()
      port = await freeport()
      server = await startWasmTestServer(port)
    })

    after(async function () {
      if (server) {
        await server.stop()
      }
    })

    it('WASM plugin loads', function () {
      const plugin = server.app.plugins.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.id === 'anchor-watch-rust'
      )
      expect(plugin).to.exist
    })

    it('WASM plugin starts', function () {
      const plugin = server.app.plugins.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.id === 'anchor-watch-rust'
      )
      expect(plugin.started).to.be.true
    })

    it('WASM plugin appears in pluginsMap', function () {
      expect(server.app.pluginsMap['anchor-watch-rust']).to.exist
    })

    it('WASM plugin status is set via /skServer/plugins', async function () {
      const resp = await fetch(`http://localhost:${port}/skServer/plugins`)
      expect(resp.status).to.equal(200)
      const plugins = await resp.json()
      const wasmPlugin = plugins.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.id === 'anchor-watch-rust'
      )
      expect(wasmPlugin).to.exist
      // The /skServer/plugins endpoint returns config data in nested 'data' object
      expect(wasmPlugin.data?.enabled).to.equal(true)
    })
  })

  describe('Plugin Coexistence', function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let server: any
    let port: number

    before(async function () {
      await emptyConfigDirectory()
      setupPluginConfigs()
      port = await freeport()
      server = await startWasmTestServer(port)
    })

    after(async function () {
      if (server) {
        await server.stop()
      }
    })

    it('Both plugin types appear in plugins list', function () {
      const nodePlugin = server.app.plugins.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.id === 'testplugin'
      )
      const wasmPlugin = server.app.plugins.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.id === 'anchor-watch-rust'
      )
      expect(nodePlugin).to.exist
      expect(wasmPlugin).to.exist
    })

    it('Both plugins are started', function () {
      const nodePlugin = server.app.plugins.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.id === 'testplugin'
      )
      const wasmPlugin = server.app.plugins.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.id === 'anchor-watch-rust'
      )
      expect(nodePlugin.started).to.be.true
      expect(wasmPlugin.started).to.be.true
    })

    it('Plugin map contains both types', function () {
      expect(server.app.pluginsMap['testplugin']).to.exist
      expect(server.app.pluginsMap['anchor-watch-rust']).to.exist
    })

    it('Node.js plugin delta does not interfere with WASM plugin', function () {
      // Node.js plugin emits test.plugin.started - check via signalk.self
      const nodeValue = server.app.signalk.self?.test?.plugin?.started?.value
      expect(nodeValue).to.equal(true)

      // WASM plugin should still be functional
      const wasmPlugin = server.app.plugins.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.id === 'anchor-watch-rust'
      )
      expect(wasmPlugin.started).to.be.true
    })

    it('/skServer/plugins returns both plugin types', async function () {
      const resp = await fetch(`http://localhost:${port}/skServer/plugins`)
      const plugins = await resp.json()

      const nodePlugin = plugins.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.id === 'testplugin'
      )
      const wasmPlugin = plugins.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.id === 'anchor-watch-rust'
      )

      expect(nodePlugin).to.exist
      expect(wasmPlugin).to.exist
      // The /skServer/plugins endpoint returns config data in nested 'data' object
      expect(nodePlugin.data?.enabled).to.equal(true)
      expect(wasmPlugin.data?.enabled).to.equal(true)
    })
  })

  describe('Plugin Lifecycle', function () {
    // Clear WASM plugin registry before each test to ensure clean state
    beforeEach(async function () {
      await shutdownAllWasmPlugins()
    })

    it('WASM plugin can be stopped', async function () {
      await emptyConfigDirectory()
      setupPluginConfigs()
      const port = await freeport()
      const server = await startWasmTestServer(port)

      try {
        // Debug: show what plugins are loaded
        const pluginIds = server.app.plugins.map((p: any) => p.id)
        console.log(`Loaded plugins: ${pluginIds.join(', ')}`)

        const wasmPlugin = server.app.plugins.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => p.id === 'anchor-watch-rust'
        )
        expect(wasmPlugin, `WASM plugin not found. Available: ${pluginIds.join(', ')}`).to.exist
        expect(wasmPlugin.started).to.be.true

        // Stop the plugin
        await wasmPlugin.stop()
        expect(wasmPlugin.started).to.be.false
      } finally {
        await server.stop()
      }
    })

    it('Node.js plugin can be stopped independently', async function () {
      await emptyConfigDirectory()
      setupPluginConfigs()
      const port = await freeport()
      const server = await startWasmTestServer(port)

      try {
        // Debug: show what plugins are loaded
        const pluginIds = server.app.plugins.map((p: any) => p.id)
        console.log(`Loaded plugins: ${pluginIds.join(', ')}`)

        const nodePlugin = server.app.plugins.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => p.id === 'testplugin'
        )
        const wasmPlugin = server.app.plugins.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => p.id === 'anchor-watch-rust'
        )

        expect(nodePlugin, `Node.js plugin not found. Available: ${pluginIds.join(', ')}`).to.exist
        expect(wasmPlugin, `WASM plugin not found. Available: ${pluginIds.join(', ')}`).to.exist
        expect(nodePlugin.started).to.be.true
        expect(wasmPlugin.started).to.be.true

        // Stop Node.js plugin
        nodePlugin.stop()
        expect(nodePlugin.started).to.be.false

        // WASM plugin should still be running
        expect(wasmPlugin.started).to.be.true
      } finally {
        await server.stop()
      }
    })

    it('Server stops cleanly with both plugin types', async function () {
      await emptyConfigDirectory()
      setupPluginConfigs()
      const port = await freeport()
      const server = await startWasmTestServer(port)

      // Debug: show what plugins are loaded
      const pluginIds = server.app.plugins.map((p: any) => p.id)
      console.log(`Loaded plugins: ${pluginIds.join(', ')}`)

      // Verify both plugins started
      const nodePlugin = server.app.plugins.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.id === 'testplugin'
      )
      const wasmPlugin = server.app.plugins.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.id === 'anchor-watch-rust'
      )
      expect(nodePlugin, `Node.js plugin not found. Available: ${pluginIds.join(', ')}`).to.exist
      expect(wasmPlugin, `WASM plugin not found. Available: ${pluginIds.join(', ')}`).to.exist
      expect(nodePlugin.started).to.be.true
      expect(wasmPlugin.started).to.be.true

      // Stop server - should not throw
      await server.stop()

      // After stop, WASM plugins should be stopped
      // Note: Node.js plugins don't automatically stop when server.stop() is called
      // (this is existing Signal K behavior - only interfaces like ws/tcp are stopped)
      expect(wasmPlugin.started).to.be.false
    })
  })
})
