/**
 * WASM Plugin Tests
 *
 * Tests that WASM plugins:
 * 1. Can be compiled from source (when SDK is available)
 * 2. Are discovered and loaded by the server
 * 3. Appear in the plugins API endpoint
 * 4. Can be enabled and started
 *
 * Note: These tests require the example plugin to be pre-built.
 * Run from repo root: npm run build:all (which includes WASM examples)
 */

import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import { freeport } from './ts-servertestutilities'
import { startServerP, serverTestConfigDirectory } from './servertestutilities'

interface PluginInfo {
  id: string
  packageName: string
  name: string
  version: string
  description: string
  type: string
  data: {
    enabled: boolean
  }
}

interface ServerInstance {
  stop: () => Promise<void>
  app: {
    config: {
      settings: {
        port: number
      }
    }
  }
}

// Use the same config directory as startServerP to ensure plugins are discovered
const testConfigDirectory = serverTestConfigDirectory

const examplePluginDir = path.join(
  __dirname,
  '..',
  'examples',
  'wasm-plugins',
  'example-hello-assemblyscript'
)

const wasmPath = path.join(examplePluginDir, 'plugin.wasm')

describe('WASM Plugins', function () {
  this.timeout(60000) // WASM compilation and loading can take time

  describe('Build verification', () => {
    it('example-hello-assemblyscript WASM file exists', function () {
      // Skip if WASM file doesn't exist - it needs to be pre-built
      // The SDK is not published to npm, so we can't build in CI without workspace setup
      if (!fs.existsSync(wasmPath)) {
        this.skip()
        return
      }

      const stats = fs.statSync(wasmPath)
      expect(stats.size).to.be.greaterThan(
        1000,
        'WASM file should be non-trivial size'
      )
    })
  })

  describe('Plugin loading', () => {
    let server: ServerInstance | null = null

    before(async function () {
      // Skip all loading tests if WASM file doesn't exist
      if (!fs.existsSync(wasmPath)) {
        this.skip()
        return
      }

      // Create symlink to the example plugin in test config node_modules
      // Note: startServerP sets SIGNALK_NODE_CONFIG_DIR to serverTestConfigDirectory()
      const pluginDest = path.join(
        testConfigDirectory(),
        'node_modules',
        '@signalk',
        'example-hello-assemblyscript'
      )

      // Create @signalk directory if needed
      const signalkDir = path.join(
        testConfigDirectory(),
        'node_modules',
        '@signalk'
      )
      if (!fs.existsSync(signalkDir)) {
        fs.mkdirSync(signalkDir, { recursive: true })
      }

      // Remove existing symlink/directory if present
      if (fs.existsSync(pluginDest)) {
        fs.rmSync(pluginDest, { recursive: true, force: true })
      }

      // Create symlink
      fs.symlinkSync(examplePluginDir, pluginDest, 'dir')
    })

    after(async function () {
      if (server) {
        await server.stop()
      }
      // Clean up symlink
      const pluginDest = path.join(
        testConfigDirectory(),
        'node_modules',
        '@signalk',
        'example-hello-assemblyscript'
      )
      if (fs.existsSync(pluginDest)) {
        fs.rmSync(pluginDest, { recursive: true, force: true })
      }
    })

    it('discovers and registers WASM plugin', async function () {
      if (!fs.existsSync(wasmPath)) {
        this.skip()
        return
      }

      const port = await freeport()

      server = await startServerP(port, false, {
        settings: {
          interfaces: {
            plugins: true,
            wasm: true
          }
        }
      })

      // Wait a moment for plugins to fully load
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Check that the plugin appears in the plugins list
      const response = await fetch(`http://0.0.0.0:${port}/skServer/plugins`)
      expect(response.status).to.equal(200)

      const plugins: PluginInfo[] = await response.json()
      const wasmPlugin = plugins.find(
        (p) =>
          p.id === '_signalk_example-hello-assemblyscript' ||
          p.packageName === '@signalk/example-hello-assemblyscript'
      )

      expect(wasmPlugin, 'WASM plugin should be in plugins list').to.not.equal(
        undefined
      )
      expect(wasmPlugin!.type).to.equal(
        'wasm',
        'Plugin should be marked as WASM type'
      )
    })

    it('WASM plugin has correct metadata', async function () {
      if (!fs.existsSync(wasmPath) || !server) {
        this.skip()
        return
      }

      // Use the server from the previous test
      const port = server.app.config.settings.port

      const response = await fetch(`http://0.0.0.0:${port}/skServer/plugins`)
      const plugins: PluginInfo[] = await response.json()
      const wasmPlugin = plugins.find(
        (p) =>
          p.id === '_signalk_example-hello-assemblyscript' ||
          p.packageName === '@signalk/example-hello-assemblyscript'
      )

      expect(wasmPlugin).to.not.equal(undefined)
      expect(wasmPlugin!.name).to.be.a('string')
      expect(wasmPlugin!.version).to.equal('0.1.0')
      expect(wasmPlugin!.description).to.include('Hello World')
    })

    it('WASM plugin can be enabled and started', async function () {
      if (!fs.existsSync(wasmPath) || !server) {
        this.skip()
        return
      }

      const port = server.app.config.settings.port
      const pluginId = '_signalk_example-hello-assemblyscript'

      // Enable and start the plugin via config endpoint
      const configResponse = await fetch(
        `http://0.0.0.0:${port}/skServer/plugins/${pluginId}/config`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: true,
            configuration: {
              message: 'Test message'
            }
          })
        }
      )
      expect(configResponse.status).to.equal(200)

      // Wait for plugin to start
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Check plugin status
      const statusResponse = await fetch(
        `http://0.0.0.0:${port}/skServer/plugins`
      )
      const plugins: PluginInfo[] = await statusResponse.json()
      const wasmPlugin = plugins.find((p) => p.id === pluginId)

      expect(
        wasmPlugin,
        'Plugin should still exist after enabling'
      ).to.not.equal(undefined)
      expect(wasmPlugin!.data.enabled).to.equal(
        true,
        'Plugin should be enabled'
      )
    })
  })
})
