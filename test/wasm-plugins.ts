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

const examplePluginId = '_signalk_example-hello-assemblyscript'

// startServerP points SIGNALK_NODE_CONFIG_DIR at serverTestConfigDirectory()
function examplePluginLinkPath(): string {
  return path.join(
    testConfigDirectory(),
    'node_modules',
    '@signalk',
    'example-hello-assemblyscript'
  )
}

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

function unlinkExamplePlugin(): void {
  const pluginDest = examplePluginLinkPath()
  if (fs.existsSync(pluginDest)) {
    fs.rmSync(pluginDest, { recursive: true, force: true })
  }
}

interface SseClient {
  response: Response
  // Resolves with everything received once `text` has arrived, or with
  // null if the stream ends first
  waitFor: (text: string) => Promise<string | null>
  abort: () => void
}

async function openSseClient(url: string): Promise<SseClient> {
  const controller = new AbortController()
  const response = await fetch(url, {
    headers: { Accept: 'text/event-stream' },
    signal: controller.signal
  })
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let received = ''
  return {
    response,
    waitFor: async (text: string) => {
      while (!received.includes(text)) {
        const { done, value } = await reader.read()
        if (done) {
          return null
        }
        received += decoder.decode(value, { stream: true })
      }
      return received
    },
    abort: () => controller.abort()
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

  describe('SSE channels', () => {
    let server: ServerInstance | null = null
    let url: string

    before(async function () {
      linkExamplePlugin()
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
      await setPluginEnabled(true)
    })

    after(async function () {
      if (server) {
        await server.stop()
      }
      unlinkExamplePlugin()
    })

    async function setPluginEnabled(enabled: boolean): Promise<void> {
      const response = await fetch(
        `${url}/skServer/plugins/${examplePluginId}/config`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled, configuration: {} })
        }
      )
      expect(response.status).to.equal(200)
    }

    async function broadcast(): Promise<number> {
      const response = await fetch(
        `${url}/plugins/${examplePluginId}/api/broadcast`,
        { method: 'POST' }
      )
      expect(response.status).to.equal(200)
      const body = await response.json()
      return body.sent
    }

    async function waitForSubscriberCount(expected: number): Promise<void> {
      for (let i = 0; i < 40; i++) {
        if ((await broadcast()) === expected) {
          return
        }
        await new Promise((r) => setTimeout(r, 50))
      }
      expect.fail(`channel never reached ${expected} subscribers`)
    }

    const eventsUrl = () => `${url}/plugins/${examplePluginId}/api/events`

    it('streams events pushed by the plugin to a subscribed client', async function () {
      const client = await openSseClient(eventsUrl())
      try {
        expect(client.response.status).to.equal(200)
        expect(client.response.headers.get('content-type')).to.match(
          /^text\/event-stream/
        )
        expect(await client.waitFor('\n\n')).to.equal(
          'event: welcome\ndata: Hello AssemblyScript Plugin\n\n'
        )

        expect(await broadcast()).to.equal(1)
        const received = await client.waitFor('broadcast #')
        expect(received).to.include(
          'event: greeting\ndata: Hello from AssemblyScript!\ndata: broadcast #'
        )
      } finally {
        client.abort()
      }
    })

    it('removes a client from the channel when it disconnects', async function () {
      const client = await openSseClient(eventsUrl())
      await client.waitFor('welcome')
      await waitForSubscriberCount(1)

      client.abort()
      await waitForSubscriberCount(0)
    })

    it('ends open streams when the plugin stops', async function () {
      const client = await openSseClient(eventsUrl())
      await client.waitFor('welcome')

      await setPluginEnabled(false)

      expect(await client.waitFor('never sent')).to.equal(null)
      expect(await broadcast()).to.equal(0)

      const refused = await fetch(eventsUrl())
      expect(refused.status).to.equal(503)
    })
  })
})
