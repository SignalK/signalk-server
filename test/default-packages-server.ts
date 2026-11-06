import { expect } from 'chai'
import { ChildProcess } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ConfigPackageJson } from '../src/defaultPackages'
import { freeport, SERVER_START_TIMEOUT } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const childProcess = require('child_process')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { defaultPackages } = require('../package.json').signalk

interface ServerEvent {
  type: string
  data: { status?: string; packages?: unknown }
}

interface TestServer {
  app: { lastServerEvents: Record<string, ServerEvent> }
  stop: () => Promise<unknown>
}

interface HeldNpm {
  spec: string
  close: (code: number) => void
}

const ENV_KEYS = ['SIGNALK_SKIP_DEFAULT_PACKAGES', 'SIGNALK_NODE_CONFIG_DIR']

describe('default packages on a real server start', function () {
  this.timeout(SERVER_START_TIMEOUT)

  let configDir: string
  let originalSpawn: typeof childProcess.spawn
  let originalEnv: Record<string, string | undefined>
  let held: HeldNpm[]
  let server: TestServer | undefined
  let host: string

  const readPackageJson = (): ConfigPackageJson =>
    JSON.parse(fs.readFileSync(path.join(configDir, 'package.json'), 'utf-8'))

  async function start() {
    const port = await freeport()
    fs.writeFileSync(
      path.join(configDir, 'settings.json'),
      JSON.stringify({ port, interfaces: {} })
    )
    host = `http://localhost:${port}`
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Server = require('../dist')
    server = (await new Server({}).start()) as TestServer
  }

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-default-server-'))
    originalEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
    delete process.env.SIGNALK_SKIP_DEFAULT_PACKAGES
    process.env.SIGNALK_NODE_CONFIG_DIR = configDir
    held = []
    originalSpawn = childProcess.spawn
    childProcess.spawn = (_cmd: string, args: string[]) => {
      const handlers: Record<string, (code: number) => void> = {}
      if (args.includes('install')) {
        held.push({
          spec: args[args.indexOf('--') + 1],
          close: (code) => handlers.close(code)
        })
      } else {
        setImmediate(() => handlers.close?.(0))
      }
      return {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: (event: string, cb: (code: number) => void) => {
          handlers[event] = cb
        }
      } as unknown as ChildProcess
    }
  })

  afterEach(async () => {
    childProcess.spawn = originalSpawn
    if (server) {
      await server.stop()
      server = undefined
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  it('installs the defaults into a fresh configuration and refuses a restore meanwhile', async () => {
    await start()
    expect(Object.values(readPackageJson().signalkDefaultPackages!)).to.satisfy(
      (states: string[]) => states.every((state) => state === 'pending')
    )
    expect(held.map((npm) => npm.spec)).to.deep.equal([
      `${Object.keys(defaultPackages)[0]}@${Object.values(defaultPackages)[0]}`
    ])

    const restore = await fetch(`${host}/skServer/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
    expect(restore.status).to.equal(409)

    for (let i = 0; i < held.length; i++) {
      held[i].close(0)
    }
    expect(held).to.have.length(Object.keys(defaultPackages).length)
    expect(
      server!.app.lastServerEvents.RESTART_REQUIRED.data.packages
    ).to.deep.equal(Object.keys(defaultPackages))
    expect(server!.app.lastServerEvents.DEFAULT_PACKAGES.data.status).to.equal(
      'done'
    )
  })

  it('offers the defaults to a configuration without a record', async () => {
    fs.writeFileSync(
      path.join(configDir, 'package.json'),
      JSON.stringify({ name: 'signalk-server-config', dependencies: {} })
    )
    await start()
    expect(held).to.have.length(0)
    expect(server!.app.lastServerEvents.DEFAULT_PACKAGES.data).to.deep.equal({
      status: 'offer',
      packages: defaultPackages
    })

    const res = await fetch(`${host}/skServer/appstore/defaultPackages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ install: [] })
    })
    expect(res.status).to.equal(200)
    expect(Object.values(readPackageJson().signalkDefaultPackages!)).to.satisfy(
      (states: string[]) => states.every((state) => state === 'declined')
    )
    expect(held).to.have.length(0)
  })
})
