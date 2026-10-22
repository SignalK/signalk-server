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

  describe('Rebuilt binary', () => {
    const packageName = 'wasm-reload-probe'
    const ascPath = path.join(__dirname, '..', 'node_modules', '.bin', 'asc')
    let server: ServerInstance | null = null
    let url: string

    function probeDir(): string {
      return path.join(testConfigDirectory(), 'node_modules', packageName)
    }

    /**
     * Compile the probe as `build`: it reports `build <build>` as its status,
     * serves `build` at /api/build-<build> and handles PUT on probe.<build>,
     * reporting `put <build>` as its status when that handler runs
     */
    function buildProbe(build: string): void {
      fs.writeFileSync(
        path.join(probeDir(), 'assembly', 'index.ts'),
        `
import { setStatus } from '@signalk/assemblyscript-plugin-sdk/assembly'

@external("env", "sk_register_put_handler")
declare function sk_register_put_handler(contextPtr: usize, contextLen: usize, pathPtr: usize, pathLen: usize): i32

export function plugin_name(): string {
  return 'Reload probe'
}

export function plugin_schema(): string {
  return '{"type":"object","properties":{}}'
}

export function plugin_start(configPtr: usize, configLen: usize): i32 {
  setStatus('build ${build}')
  const context = String.UTF8.encode('vessels.self')
  const putPath = String.UTF8.encode('probe.${build}')
  sk_register_put_handler(changetype<usize>(context), context.byteLength, changetype<usize>(putPath), putPath.byteLength)
  return 0
}

export function handle_put_vessels_self_probe_${build}(value: string): string {
  setStatus('put ${build}')
  return '{"state":"COMPLETED","statusCode":200}'
}

export function http_endpoints(): string {
  return '[{"method":"GET","path":"/api/build-${build}","handler":"handle_${build}"}]'
}

export function handle_${build}(requestPtr: usize, requestLen: usize): string {
  return '{"statusCode":200,"body":"${build}"}'
}

export function plugin_stop(): i32 {
  return 0
}
`
      )
      execSync(
        `"${ascPath}" assembly/index.ts --outFile plugin.wasm --runtime incremental --exportRuntime`,
        { cwd: probeDir(), stdio: 'inherit' }
      )
    }

    /** Enable or disable the probe through Plugin Config */
    function setEnabled(enabled: boolean): Promise<Response> {
      return fetch(`${url}/skServer/plugins/${packageName}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, configuration: {} })
      })
    }

    async function statusMessage(): Promise<string> {
      const response = await fetch(`${url}/skServer/plugins`)
      const plugins: (PluginInfo & { statusMessage: string })[] =
        await response.json()
      return plugins.find((p) => p.id === packageName)?.statusMessage ?? ''
    }

    /** Poll until the probe reports `expected`, returning the last status */
    async function waitForStatus(expected: string): Promise<string> {
      let status = await statusMessage()
      for (let i = 0; i < 40 && status !== expected; i++) {
        await new Promise((r) => setTimeout(r, 50))
        status = await statusMessage()
      }
      return status
    }

    before(async function () {
      const dir = probeDir()
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(path.join(dir, 'assembly'), { recursive: true })
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({
          name: packageName,
          version: '0.0.1',
          keywords: ['signalk-wasm-plugin'],
          wasmManifest: 'plugin.wasm',
          wasmCapabilities: { putHandlers: true }
        })
      )
      buildProbe('one')

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
      fs.rmSync(probeDir(), { recursive: true, force: true })
      fs.rmSync(
        path.join(
          testConfigDirectory(),
          'plugin-config-data',
          `${packageName}.json`
        ),
        { force: true }
      )
    })

    function getBuildEndpoint(build: string): Promise<Response> {
      return fetch(`${url}/plugins/${packageName}/api/build-${build}`)
    }

    async function putStatus(build: string): Promise<number> {
      const response = await fetch(
        `${url}/signalk/v1/api/vessels/self/probe/${build}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 1 })
        }
      )
      return response.status
    }

    it('runs the rebuilt plugin.wasm after disable and enable', async function () {
      expect((await setEnabled(true)).status).to.equal(200)
      expect(await waitForStatus('build one')).to.equal('build one')
      const one = await getBuildEndpoint('one')
      expect(one.status).to.equal(200)
      expect(await one.text()).to.equal('one')
      await putStatus('one')
      expect(await waitForStatus('put one')).to.equal('put one')

      buildProbe('two')
      expect((await setEnabled(false)).status).to.equal(200)
      expect((await setEnabled(true)).status).to.equal(200)

      expect(await waitForStatus('build two')).to.equal('build two')
      const two = await getBuildEndpoint('two')
      expect(two.status).to.equal(200)
      expect(await two.text()).to.equal('two')
      expect((await getBuildEndpoint('one')).status).to.equal(404)
      await putStatus('two')
      expect(await waitForStatus('put two')).to.equal('put two')
      // 405: no PUT handler is registered for the path any more
      expect(await putStatus('one')).to.equal(405)
      expect(await statusMessage()).to.equal('put two')
      const metaOne = await fetch(
        `${url}/signalk/v1/api/vessels/self/probe/one/meta`
      )
      expect((await metaOne.json()).supportsPut).to.equal(false)
    })
  })
})
