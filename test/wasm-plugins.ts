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
import { execSync } from 'child_process'
import { freeport } from './ts-servertestutilities'
import {
  startServerP,
  serverTestConfigDirectory,
  getReadOnlyToken,
  getWriteToken,
  getAdminToken
} from './servertestutilities'

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

const examplePluginId = '_signalk_example-hello-assemblyscript'

/**
 * Where the example plugin is linked so plugin discovery finds it;
 * startServerP points SIGNALK_NODE_CONFIG_DIR at serverTestConfigDirectory().
 */
function examplePluginLinkPath(): string {
  return path.join(
    testConfigDirectory(),
    'node_modules',
    '@signalk',
    'example-hello-assemblyscript'
  )
}

/**
 * Symlink the built example plugin into the test config's node_modules,
 * replacing any stale link. Requires the build test to have produced the
 * .wasm binary first.
 */
function linkExamplePlugin(): void {
  if (!fs.existsSync(wasmPath)) {
    throw new Error(
      'WASM file does not exist. Build verification test should have created it.'
    )
  }
  const pluginDest = examplePluginLinkPath()
  fs.mkdirSync(path.dirname(pluginDest), { recursive: true })
  if (fs.existsSync(pluginDest)) {
    fs.rmSync(pluginDest, { recursive: true, force: true })
  }
  fs.symlinkSync(examplePluginDir, pluginDest, 'dir')
}

/** Remove the example plugin link so later suites start from a clean config. */
function unlinkExamplePlugin(): void {
  const pluginDest = examplePluginLinkPath()
  if (fs.existsSync(pluginDest)) {
    fs.rmSync(pluginDest, { recursive: true, force: true })
  }
}

describe('WASM Plugins', function () {
  this.timeout(60000) // WASM compilation and loading can take time

  describe('Build verification', () => {
    it('builds example-hello-assemblyscript and produces plugin.wasm', function () {
      // Clean any existing build artifacts
      if (fs.existsSync(wasmPath)) {
        fs.unlinkSync(wasmPath)
      }

      // Install dependencies if needed
      const nodeModulesPath = path.join(examplePluginDir, 'node_modules')
      if (!fs.existsSync(nodeModulesPath)) {
        console.log('Installing dependencies for example plugin...')
        execSync('npm install', {
          cwd: examplePluginDir,
          stdio: 'inherit'
        })
      }

      // Build the plugin
      console.log('Building example WASM plugin...')
      execSync('npm run build', {
        cwd: examplePluginDir,
        stdio: 'inherit'
      })

      // Assert that plugin.wasm was created
      expect(fs.existsSync(wasmPath), 'plugin.wasm should exist').to.equal(true)

      const stats = fs.statSync(wasmPath)
      expect(stats.size).to.be.greaterThan(
        1000,
        'WASM file should be non-trivial size'
      )
    })

    after(function () {
      // Clean up transpiled files generated during build
      const pluginJsPath = path.join(examplePluginDir, 'plugin.js')
      const pluginDtsPath = path.join(examplePluginDir, 'plugin.d.ts')

      if (fs.existsSync(pluginJsPath)) {
        fs.unlinkSync(pluginJsPath)
      }
      if (fs.existsSync(pluginDtsPath)) {
        fs.unlinkSync(pluginDtsPath)
      }
    })
  })

  describe('Plugin loading', () => {
    let server: ServerInstance | null = null

    before(function () {
      linkExamplePlugin()
    })

    after(async function () {
      if (server) {
        await server.stop()
      }
      unlinkExamplePlugin()
    })

    it('discovers and registers WASM plugin', async function () {
      const port = await freeport()

      server = await startServerP(port, false, {
        settings: {
          interfaces: {
            plugins: true,
            wasm: true
          }
        }
      })

      // Poll until WASM plugin appears in the plugins list
      let wasmPlugin: PluginInfo | undefined
      for (let i = 0; i < 40; i++) {
        const res = await fetch(`http://0.0.0.0:${port}/skServer/plugins`)
        const plugins: PluginInfo[] = await res.json()
        wasmPlugin = plugins.find(
          (p) =>
            p.id === '_signalk_example-hello-assemblyscript' ||
            p.packageName === '@signalk/example-hello-assemblyscript'
        )
        if (wasmPlugin) break
        await new Promise((r) => setTimeout(r, 50))
      }

      const response = await fetch(`http://0.0.0.0:${port}/skServer/plugins`)
      expect(response.status).to.equal(200)

      const plugins: PluginInfo[] = await response.json()
      wasmPlugin = plugins.find(
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
      // Use the server from the previous test
      const port = server!.app.config.settings.port

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
      const port = server!.app.config.settings.port
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

      // Poll until plugin is enabled
      let wasmPlugin: PluginInfo | undefined
      for (let i = 0; i < 20; i++) {
        const res = await fetch(`http://0.0.0.0:${port}/skServer/plugins`)
        const plugins: PluginInfo[] = await res.json()
        wasmPlugin = plugins.find((p) => p.id === pluginId)
        if (wasmPlugin?.data?.enabled) break
        await new Promise((r) => setTimeout(r, 50))
      }

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

  describe('Endpoint access levels', () => {
    let server: ServerInstance | null = null
    let url: string
    let readToken: string
    let writeToken: string
    let adminToken: string

    before(async function () {
      linkExamplePlugin()
      const port = await freeport()
      url = `http://0.0.0.0:${port}`
      server = await startServerP(port, true, {
        settings: {
          interfaces: {
            plugins: true,
            wasm: true
          }
        }
      })
      readToken = await getReadOnlyToken(server)
      writeToken = await getWriteToken(server)
      adminToken = await getAdminToken(server)

      const enableResponse = await fetch(
        `${url}/skServer/plugins/${examplePluginId}/config`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ enabled: true, configuration: {} })
        }
      )
      expect(enableResponse.status).to.equal(200)
    })

    after(async function () {
      if (server) {
        await server.stop()
      }
      unlinkExamplePlugin()
    })

    /** GET a route of the example plugin, authenticated only when a token is given. */
    function getEndpoint(route: string, token?: string): Promise<Response> {
      return fetch(`${url}/plugins/${examplePluginId}${route}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
    }

    it('readonly user can access an endpoint declared readonly', async function () {
      const response = await getEndpoint('/api/info', readToken)
      expect(response.status).to.equal(200)
      const body = await response.json()
      expect(body.language).to.equal('AssemblyScript')
    })

    it('readwrite user can access an endpoint declared readonly', async function () {
      const response = await getEndpoint('/api/info', writeToken)
      expect(response.status).to.equal(200)
    })

    it('unauthenticated request is denied an endpoint declared readonly', async function () {
      const response = await getEndpoint('/api/info')
      expect(response.status).to.equal(401)
    })

    it('readonly user is denied an endpoint declared readwrite', async function () {
      const response = await getEndpoint('/api/about', readToken)
      expect(response.status).to.equal(401)
    })

    it('readwrite user can access an endpoint declared readwrite', async function () {
      const response = await getEndpoint('/api/about', writeToken)
      expect(response.status).to.equal(200)
    })

    it('readonly user is denied an endpoint without an access level', async function () {
      const response = await getEndpoint('/api/status', readToken)
      expect(response.status).to.equal(401)
    })

    it('admin can access an endpoint without an access level', async function () {
      const response = await getEndpoint('/api/status', adminToken)
      expect(response.status).to.equal(200)
    })
  })
})
