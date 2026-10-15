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
import net from 'net'
import { freeport } from './ts-servertestutilities'
import { startServerP, serverTestConfigDirectory } from './servertestutilities'
import { WasmPlugin } from '../src/wasm/loader/types'
import { WasmCapabilities, WasmPluginInstance } from '../src/wasm/types'
import { wasmPlugins } from '../src/wasm/loader/plugin-registry'
import { stopWasmPlugin } from '../src/wasm/loader/plugin-lifecycle'
import { tcpSocketManager } from '../src/wasm/bindings/socket-manager'
import { createEnvImports } from '../src/wasm/bindings/env-imports'

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

    before(async function () {
      // Ensure WASM file exists before running loading tests
      if (!fs.existsSync(wasmPath)) {
        throw new Error(
          'WASM file does not exist. Build verification test should have created it.'
        )
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

  describe('Stopping a plugin', () => {
    const pluginId = '_test_stop-cleanup'
    // Host bindings are keyed by the package name the instance was loaded with
    const bindingId = '@test/stop-cleanup'
    const noCapabilities: WasmCapabilities = {
      network: false,
      storage: 'none',
      dataRead: false,
      dataWrite: false,
      serialPorts: false,
      putHandlers: false
    }

    /**
     * Register a running plugin whose instance is a stub, so stopping it
     * exercises only the host-side teardown.
     */
    function addStoppablePlugin(): void {
      const plugin: WasmPlugin = {
        id: pluginId,
        name: 'stop cleanup',
        type: 'wasm',
        packageName: bindingId,
        version: '0.0.0',
        enabled: true,
        enableDebug: false,
        keywords: [],
        packageLocation: '',
        configPath: '',
        metadata: {
          id: pluginId,
          name: 'stop cleanup',
          packageName: bindingId,
          version: '0.0.0',
          wasmManifest: '',
          capabilities: noCapabilities,
          packageLocation: ''
        },
        instance: {
          exports: { stop: () => 0 }
        } as unknown as WasmPluginInstance,
        status: 'running',
        crashCount: 0,
        restartBackoff: 0
      }
      wasmPlugins.set(pluginId, plugin)
    }

    afterEach(function () {
      wasmPlugins.delete(pluginId)
    })

    it('closes TCP sockets the plugin opened', async function () {
      addStoppablePlugin()
      const server = net.createServer()
      const peerClosed = new Promise<void>((resolve) => {
        server.on('connection', (peer) => {
          peer.on('close', () => resolve())
        })
      })
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve)
      )
      const { port } = server.address() as net.AddressInfo
      const connected = new Promise<void>((resolve) =>
        server.once('connection', () => resolve())
      )

      try {
        const socketId = tcpSocketManager.createSocket(bindingId)
        expect(tcpSocketManager.connect(socketId, '127.0.0.1', port)).to.equal(
          0
        )
        await connected

        await stopWasmPlugin(pluginId)

        await peerClosed
        expect(tcpSocketManager.isConnected(socketId)).to.equal(-1)
      } finally {
        server.close()
      }
    })

    it('unregisters its PUT handlers', async function () {
      addStoppablePlugin()
      const registered = new Set<string>()
      const app = {
        registerActionHandler: (
          context: string,
          path: string,
          source: string
        ) => {
          const key = `${context}/${path}/${source}`
          registered.add(key)
          return () => registered.delete(key)
        }
      }
      const memory = new WebAssembly.Memory({ initial: 1 })
      const context = Buffer.from('vessels.self')
      const putPath = Buffer.from('electrical.switches.test.state')
      // Past the end of the context string so the two do not overlap
      const pathOffset = context.length
      new Uint8Array(memory.buffer).set(context, 0)
      new Uint8Array(memory.buffer).set(putPath, pathOffset)
      const imports = createEnvImports({
        pluginId: bindingId,
        capabilities: { ...noCapabilities, putHandlers: true },
        app,
        memoryRef: { current: memory },
        rawExports: { current: null },
        asLoaderInstance: { current: null }
      })

      expect(
        imports.sk_register_put_handler(
          0,
          context.length,
          pathOffset,
          putPath.length
        )
      ).to.equal(1)
      expect(registered.size).to.equal(1)

      await stopWasmPlugin(pluginId)

      expect(registered.size).to.equal(0)
    })
  })

  describe('Stopping a resource provider plugin', () => {
    let server: ServerInstance | null = null
    const providerDir = path.join(
      __dirname,
      '..',
      'examples',
      'wasm-plugins',
      'example-routes-waypoints'
    )
    const providerPackageName = '@signalk/example-routes-waypoints'
    const providerPluginId = '_signalk_example-routes-waypoints'
    const providerLink = () =>
      path.join(
        testConfigDirectory(),
        'node_modules',
        '@signalk',
        'example-routes-waypoints'
      )

    const providerPollAttempts = 40
    const providerPollIntervalMs = 50

    /** Ids of the plugins currently serving the routes resource type. */
    async function routeProviders(port: number): Promise<string[]> {
      const res = await fetch(
        `http://0.0.0.0:${port}/signalk/v2/api/resources/routes/_providers`
      )
      expect(res.status).to.equal(200)
      return res.json()
    }

    /** Enable or disable the provider plugin through the admin config API. */
    async function setEnabled(port: number, enabled: boolean): Promise<void> {
      const res = await fetch(
        `http://0.0.0.0:${port}/skServer/plugins/${providerPluginId}/config`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled, configuration: {} })
        }
      )
      expect(res.status).to.equal(200)
    }

    /**
     * Poll the provider list until the predicate holds, since plugin start
     * and stop complete asynchronously after the config request returns.
     * Returns the last list seen so the caller asserts on it.
     */
    async function waitForProviders(
      port: number,
      predicate: (providers: string[]) => boolean
    ): Promise<string[]> {
      let providers = await routeProviders(port)
      for (let i = 0; i < providerPollAttempts && !predicate(providers); i++) {
        await new Promise((r) => setTimeout(r, providerPollIntervalMs))
        providers = await routeProviders(port)
      }
      return providers
    }

    before(async function () {
      if (!fs.existsSync(path.join(providerDir, 'node_modules'))) {
        execSync('npm install', { cwd: providerDir, stdio: 'inherit' })
      }
      execSync('npm run build', { cwd: providerDir, stdio: 'inherit' })

      const pluginDest = providerLink()
      fs.mkdirSync(path.dirname(pluginDest), { recursive: true })
      fs.rmSync(pluginDest, { recursive: true, force: true })
      fs.symlinkSync(providerDir, pluginDest, 'dir')

      const port = await freeport()
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
      fs.rmSync(providerLink(), { recursive: true, force: true })
    })

    it('is unlisted as a provider on stop and listed again on restart', async function () {
      const port = server!.app.config.settings.port

      await setEnabled(port, true)
      const whileRunning = await waitForProviders(port, (p) =>
        p.includes(providerPackageName)
      )
      expect(whileRunning).to.include(providerPackageName)

      await setEnabled(port, false)
      const afterStop = await waitForProviders(
        port,
        (p) => !p.includes(providerPackageName)
      )
      expect(afterStop).to.not.include(providerPackageName)

      await setEnabled(port, true)
      const afterRestart = await waitForProviders(port, (p) =>
        p.includes(providerPackageName)
      )
      expect(afterRestart).to.include(providerPackageName)
    })
  })
})
