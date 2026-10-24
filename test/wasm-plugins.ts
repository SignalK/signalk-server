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
import express from 'express'
import { AddressInfo } from 'net'
import {
  BufferAbiExports,
  BufferAbiFunction,
  callBufferAbi,
  MAX_BUFFER_ABI_RESPONSE_BYTES,
  METADATA_BUFFER_BYTES,
  RESPONSE_BUFFER_BYTES
} from '../src/wasm/utils/buffer-abi'
import { setupPluginSpecificRoutes } from '../src/wasm/loader/plugin-routes'
import { WasmPlugin } from '../src/wasm/loader/types'

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
})

const FAKE_MEMORY_PAGES = 200

interface FakeBufferAbiPlugin {
  exports: BufferAbiExports & Record<string, unknown>
  liveAllocations: () => number
  calls: number[]
}

/**
 * Stands in for a compiled Rust plugin: real WebAssembly memory with a bump
 * allocator, and exports that follow the buffer ABI, returning `-n` when the
 * output buffer is too small for their result.
 */
function fakeBufferAbiPlugin(
  produce: (request: string | undefined) => string
): FakeBufferAbiPlugin {
  const memory = new WebAssembly.Memory({ initial: FAKE_MEMORY_PAGES })
  const live = new Map<number, number>()
  const calls: number[] = []
  let next = 8

  /** Bump-allocates so every live allocation has a unique pointer */
  const allocate = (size: number) => {
    const ptr = next
    next += size
    live.set(ptr, size)
    return ptr
  }
  /** Asserts the host frees exactly what it allocated, with the same size */
  const deallocate = (ptr: number, size: number) => {
    expect(live.get(ptr)).to.equal(size)
    live.delete(ptr)
  }
  /** Records the offered buffer size and applies the grow-on-negative rule */
  const write = (text: string, outPtr: number, outLen: number) => {
    const bytes = Buffer.from(text, 'utf8')
    calls.push(outLen)
    if (bytes.length > outLen) return -bytes.length
    new Uint8Array(memory.buffer).set(bytes, outPtr)
    return bytes.length
  }
  /** Decodes the request the host wrote into plugin memory */
  const read = (ptr: number, len: number) =>
    Buffer.from(memory.buffer, ptr, len).toString('utf8')

  return {
    exports: {
      memory,
      allocate,
      deallocate,
      handle: (
        reqPtr: number,
        reqLen: number,
        outPtr: number,
        outLen: number
      ) => write(produce(read(reqPtr, reqLen)), outPtr, outLen),
      describe: (outPtr: number, outLen: number) =>
        write(produce(undefined), outPtr, outLen)
    },
    liveAllocations: () => live.size,
    calls
  }
}

describe('WASM buffer ABI', () => {
  const LARGE_BYTES = 200 * 1024

  it('returns output that fits the initial buffer in one call', () => {
    const plugin = fakeBufferAbiPlugin((req) => `echo:${req}`)
    const result = callBufferAbi(
      plugin.exports,
      'handle',
      plugin.exports.handle as BufferAbiFunction,
      RESPONSE_BUFFER_BYTES,
      'hello'
    )
    expect(result).to.equal('echo:hello')
    expect(plugin.calls).to.deep.equal([RESPONSE_BUFFER_BYTES])
    expect(plugin.liveAllocations()).to.equal(0)
  })

  it('grows the buffer when the export returns a negative length', () => {
    const big = 'é'.repeat(LARGE_BYTES)
    const plugin = fakeBufferAbiPlugin(() => big)
    const result = callBufferAbi(
      plugin.exports,
      'describe',
      plugin.exports.describe as BufferAbiFunction,
      METADATA_BUFFER_BYTES
    )
    expect(result).to.equal(big)
    expect(plugin.calls).to.deep.equal([
      METADATA_BUFFER_BYTES,
      Buffer.byteLength(big)
    ])
    expect(plugin.liveAllocations()).to.equal(0)
  })

  it('rejects a request above the maximum buffer size', () => {
    const plugin = fakeBufferAbiPlugin(() =>
      'x'.repeat(MAX_BUFFER_ABI_RESPONSE_BYTES + 1)
    )
    expect(() =>
      callBufferAbi(
        plugin.exports,
        'handle',
        plugin.exports.handle as BufferAbiFunction,
        RESPONSE_BUFFER_BYTES,
        '{}'
      )
    ).to.throw(/handle requested a \d+ byte response buffer, exceeding/)
    expect(plugin.calls).to.have.length(1)
    expect(plugin.liveAllocations()).to.equal(0)
  })

  it('rejects an export that still does not fit after growing', () => {
    let size = RESPONSE_BUFFER_BYTES
    const plugin = fakeBufferAbiPlugin(() => {
      size *= 2
      return 'x'.repeat(size)
    })
    expect(() =>
      callBufferAbi(
        plugin.exports,
        'handle',
        plugin.exports.handle as BufferAbiFunction,
        RESPONSE_BUFFER_BYTES,
        '{}'
      )
    ).to.throw(/handle requested \d+ bytes after being given/)
    expect(plugin.calls).to.have.length(2)
    expect(plugin.liveAllocations()).to.equal(0)
  })

  it('serves a Rust HTTP endpoint response larger than 64 KB', async () => {
    const body = 'x'.repeat(LARGE_BYTES)
    const fake = fakeBufferAbiPlugin((req) =>
      req === undefined
        ? JSON.stringify([{ method: 'GET', path: '/big', handler: 'handle' }])
        : JSON.stringify({
            statusCode: 200,
            headers: { 'Content-Type': 'text/plain' },
            body
          })
    )
    fake.exports.http_endpoints = fake.exports.describe
    const router = express.Router()
    const plugin = {
      id: 'buffer-abi-test',
      router,
      instance: { instance: { exports: fake.exports } }
    } as unknown as WasmPlugin
    setupPluginSpecificRoutes(plugin)

    const app = express()
    app.use(router)
    const server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    try {
      const { port } = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/big`)
      expect(res.status).to.equal(200)
      expect(await res.text()).to.equal(body)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
