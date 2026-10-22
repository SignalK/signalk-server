import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { freeport } from './ts-servertestutilities'
import { startServerP, serverTestConfigDirectory } from './servertestutilities'

interface ServerInstance {
  stop: () => Promise<void>
}

const packageName = 'wasm-put-probe'
const ascPath = path.join(__dirname, '..', 'node_modules', '.bin', 'asc')

// Registers PUT handlers on probe.handled, which it implements, and on
// probe.unhandled, which it does not export a handler for
const probeSource = `
import { setStatus } from '@signalk/assemblyscript-plugin-sdk/assembly'

@external("env", "sk_register_put_handler")
declare function sk_register_put_handler(contextPtr: usize, contextLen: usize, pathPtr: usize, pathLen: usize): i32

function registerPut(path: string): void {
  const context = String.UTF8.encode('vessels.self')
  const encodedPath = String.UTF8.encode(path)
  sk_register_put_handler(changetype<usize>(context), context.byteLength, changetype<usize>(encodedPath), encodedPath.byteLength)
}

export function plugin_name(): string {
  return 'PUT probe'
}

export function plugin_schema(): string {
  return '{"type":"object","properties":{}}'
}

export function plugin_start(configPtr: usize, configLen: usize): i32 {
  registerPut('probe.handled')
  registerPut('probe.unhandled')
  setStatus('started')
  return 0
}

export function handle_put_vessels_self_probe_handled(value: string): string {
  return '{"state":"COMPLETED","statusCode":200}'
}

export function plugin_stop(): i32 {
  return 0
}
`

describe('WASM PUT handlers', function () {
  let server: ServerInstance | null = null
  let url: string

  function probeDir(): string {
    return path.join(serverTestConfigDirectory(), 'node_modules', packageName)
  }

  function configFile(): string {
    return path.join(
      serverTestConfigDirectory(),
      'plugin-config-data',
      `${packageName}.json`
    )
  }

  function put(skPath: string): Promise<Response> {
    return fetch(`${url}/signalk/v1/api/vessels/self/${skPath}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 1 })
    })
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

    const response = await fetch(
      `${url}/skServer/plugins/${packageName}/config`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, configuration: {} })
      }
    )
    expect(response.status).to.equal(200)
  })

  after(async function () {
    if (server) {
      await server.stop()
    }
    fs.rmSync(probeDir(), { recursive: true, force: true })
    fs.rmSync(configFile(), { force: true })
  })

  it('answers with the reply of the plugin handler', async function () {
    const response = await put('probe/handled')
    expect(response.status).to.equal(200)
    expect((await response.json()).state).to.equal('COMPLETED')
  })

  it('answers 501 when the plugin exports no handler for the path', async function () {
    const response = await put('probe/unhandled')
    expect(response.status).to.equal(501)
  })
})
