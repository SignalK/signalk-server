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
        // The audit request can stall until npm's five-minute fetch
        // timeout, and the build does not need it.
        execSync('npm install --no-audit --no-fund', {
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

  describe('Scoped package name', () => {
    const scopedPackageName = '@signalk-test/wasm-scoped-probe'
    const scopedPluginId = '_signalk-test_wasm-scoped-probe'
    const ascPath = path.join(__dirname, '..', 'node_modules', '.bin', 'asc')
    // Reads its config, saves a new one and opens a UDP socket on start,
    // reporting the outcome through sk_set_status
    const probeSource = `
import {
  readConfig,
  saveConfig,
  setStatus
} from '@signalk/assemblyscript-plugin-sdk/assembly'

@external("env", "sk_udp_create")
declare function sk_udp_create(socketType: i32): i32

export function plugin_name(): string {
  return 'Scoped probe'
}

export function plugin_schema(): string {
  return '{"type":"object","properties":{}}'
}

export function plugin_start(configPtr: usize, configLen: usize): i32 {
  // readConfig() decodes its whole fixed-size buffer, so cut the NUL padding
  const raw = readConfig()
  const end = raw.indexOf(String.fromCharCode(0))
  const config = end < 0 ? raw : raw.substring(0, end)
  const saved = saveConfig('{"greeting":"saved"}')
  const socket = sk_udp_create(0)
  setStatus('read:' + config + ' saved:' + saved.toString() + ' socket:' + (socket > 0 ? 'ok' : 'failed'))
  return 0
}

export function plugin_stop(): i32 {
  return 0
}
`
    let server: ServerInstance | null = null
    let url: string

    function probeDir(): string {
      return path.join(testConfigDirectory(), 'node_modules', scopedPackageName)
    }

    function configFile(): string {
      return path.join(
        testConfigDirectory(),
        'plugin-config-data',
        `${scopedPluginId}.json`
      )
    }

    async function getProbe(): Promise<PluginInfo & { statusMessage: string }> {
      const response = await fetch(`${url}/skServer/plugins`)
      const plugins: (PluginInfo & { statusMessage: string })[] =
        await response.json()
      const probe = plugins.find((p) => p.id === scopedPluginId)
      expect(probe, 'scoped probe plugin should be registered').to.not.equal(
        undefined
      )
      return probe!
    }

    function postConfig(body: object): Promise<Response> {
      return fetch(`${url}/skServer/plugins/${scopedPluginId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    }

    function probeSockets(): number | undefined {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { socketManager } = require('../dist/wasm/bindings/socket-manager')
      return socketManager.getStats().socketsPerPlugin[scopedPluginId]
    }

    before(async function () {
      const dir = probeDir()
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(path.join(dir, 'assembly'), { recursive: true })
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({
          name: scopedPackageName,
          version: '0.0.1',
          keywords: ['signalk-wasm-plugin'],
          wasmManifest: 'plugin.wasm',
          wasmCapabilities: { rawSockets: true }
        })
      )
      fs.writeFileSync(path.join(dir, 'assembly', 'index.ts'), probeSource)
      execSync(
        `"${ascPath}" assembly/index.ts --outFile plugin.wasm --runtime incremental --exportRuntime`,
        { cwd: dir, stdio: 'inherit' }
      )
      fs.rmSync(configFile(), { force: true })

      const port = await freeport()
      url = `http://0.0.0.0:${port}`
      server = await startServerP(port, false, {
        settings: {
          interfaces: {
            plugins: true,
            wasm: true
          }
        }
      })
    })

    after(async function () {
      if (server) {
        await server.stop()
      }
      fs.rmSync(path.dirname(probeDir()), { recursive: true, force: true })
      fs.rmSync(configFile(), { force: true })
    })

    it('keys status, config and sockets by the derived plugin id', async function () {
      const enableResponse = await postConfig({
        enabled: true,
        configuration: { greeting: 'hi' }
      })
      expect(enableResponse.status).to.equal(200)

      let probe = await getProbe()
      for (let i = 0; i < 40 && !probe.statusMessage; i++) {
        await new Promise((r) => setTimeout(r, 50))
        probe = await getProbe()
      }

      expect(probe.statusMessage).to.equal(
        'read:{"greeting":"hi"} saved:0 socket:ok'
      )
      const stored = JSON.parse(fs.readFileSync(configFile(), 'utf8'))
      expect(stored.configuration).to.deep.equal({ greeting: 'saved' })
      expect(probeSockets()).to.equal(1)

      const disableResponse = await postConfig({
        enabled: false,
        configuration: stored.configuration
      })
      expect(disableResponse.status).to.equal(200)
      expect(probeSockets()).to.equal(undefined)
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
