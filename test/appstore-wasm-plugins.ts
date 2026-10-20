import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startServerP } = require('./servertestutilities')

const NODE_KEYWORD = 'signalk-node-server-plugin'
const WASM_KEYWORD = 'signalk-wasm-plugin'

const INSTALLED_WASM = 'installed-wasm-plugin'
const AVAILABLE_WASM = 'available-wasm-plugin'
const DUAL_KEYWORD = 'dual-keyword-plugin'
const NODE_PLUGIN = 'node-only-plugin'

const INSTALLED_VERSION = '1.0.0'
const LATEST_VERSION = '2.0.0'

const SUITE_TIMEOUT_MS = 60000

interface AppInfo {
  name: string
  version?: string
  installedVersion?: string
  isPlugin?: boolean
  isWasm?: boolean
}

interface AppStoreResponse {
  installed: AppInfo[]
  available: AppInfo[]
  updates: AppInfo[]
}

interface SearchPackage {
  name: string
  version: string
  keywords: string[]
}

const SEARCH_RESULTS: Record<string, SearchPackage[]> = {
  [NODE_KEYWORD]: [
    { name: NODE_PLUGIN, version: LATEST_VERSION, keywords: [NODE_KEYWORD] },
    {
      name: DUAL_KEYWORD,
      version: LATEST_VERSION,
      keywords: [NODE_KEYWORD, WASM_KEYWORD]
    }
  ],
  [WASM_KEYWORD]: [
    {
      name: INSTALLED_WASM,
      version: LATEST_VERSION,
      keywords: [WASM_KEYWORD]
    },
    {
      name: AVAILABLE_WASM,
      version: LATEST_VERSION,
      keywords: [WASM_KEYWORD]
    },
    {
      name: DUAL_KEYWORD,
      version: LATEST_VERSION,
      keywords: [NODE_KEYWORD, WASM_KEYWORD]
    }
  ]
}

function searchResultsFor(url: string): SearchPackage[] {
  const keyword = Object.keys(SEARCH_RESULTS).find((k) => url.includes(k))
  return keyword ? SEARCH_RESULTS[keyword]! : []
}

// npm's search API is the only network dependency in the appstore read
// path. Everything else (dist-tags, registry metadata, icon probes, README
// and changelog assets) is optional enrichment, so fail it fast instead of
// going online. Only the test's own requests to the server pass through.
function stubNpmRegistry() {
  const realFetch = global.fetch
  global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('https://registry.npmjs.org/-/v1/search')) {
      const packages = searchResultsFor(url)
      return Promise.resolve(
        Response.json({
          objects: packages.map((pkg) => ({
            package: {
              ...pkg,
              description: `${pkg.name} description`,
              date: new Date().toISOString(),
              links: {}
            }
          })),
          total: packages.length
        })
      )
    }
    if (url.startsWith('http://localhost')) {
      return realFetch(input, init)
    }
    return Promise.resolve(new Response('{}', { status: 404 }))
  }) as typeof global.fetch
  return () => {
    global.fetch = realFetch
  }
}

// Install and remove shell out to `npm`; a stub that succeeds without
// touching anything keeps the suite offline.
function writeNpmStub(binDir: string) {
  fs.mkdirSync(binDir, { recursive: true })
  const stub = path.join(binDir, 'npm')
  fs.writeFileSync(stub, '#!/bin/sh\necho "0.0.0-npm-stub"\nexit 0\n')
  fs.chmodSync(stub, 0o755)
}

// With the WASM runtime disabled the server registers installed WASM
// plugins without loading their binary, so the package needs no .wasm file.
function seedInstalledWasmPlugin(configDir: string) {
  const moduleDir = path.join(configDir, 'node_modules', INSTALLED_WASM)
  fs.mkdirSync(moduleDir, { recursive: true })
  fs.writeFileSync(
    path.join(configDir, 'package.json'),
    JSON.stringify({
      name: 'signalk-server-config',
      version: '0.0.1',
      dependencies: { [INSTALLED_WASM]: `^${INSTALLED_VERSION}` }
    })
  )
  fs.writeFileSync(
    path.join(moduleDir, 'package.json'),
    JSON.stringify({
      name: INSTALLED_WASM,
      version: INSTALLED_VERSION,
      keywords: [WASM_KEYWORD],
      wasmManifest: 'plugin.wasm'
    })
  )
}

describe('appstore lists WASM plugins', function () {
  this.timeout(SUITE_TIMEOUT_MS)

  let stop: (() => Promise<unknown>) | undefined
  let restoreFetch: (() => void) | undefined
  let originalPath: string | undefined
  let configDir: string
  let host: string

  before(async function () {
    if (process.platform === 'win32') {
      this.skip()
    }
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-appstore-wasm-'))
    seedInstalledWasmPlugin(configDir)

    const binDir = path.join(configDir, 'bin')
    writeNpmStub(binDir)
    originalPath = process.env.PATH
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`

    restoreFetch = stubNpmRegistry()

    const port = await freeport()
    host = 'http://localhost:' + port
    const server = await startServerP(
      port,
      false,
      { settings: { interfaces: { plugins: true, wasm: false } } },
      undefined,
      configDir
    )
    stop = () => server.stop()
  })

  after(async function () {
    if (stop) await stop()
    if (restoreFetch) restoreFetch()
    if (originalPath !== undefined) process.env.PATH = originalPath
    if (configDir) fs.rmSync(configDir, { recursive: true, force: true })
  })

  async function getAppStore(): Promise<AppStoreResponse> {
    const res = await fetch(`${host}/skServer/appstore/available/`)
    expect(res.status).to.equal(200)
    return (await res.json()) as AppStoreResponse
  }

  it('offers a published WASM plugin as an installable plugin', async function () {
    const store = await getAppStore()
    const entry = store.available.find((a) => a.name === AVAILABLE_WASM)
    expect(entry, 'WASM plugin should be available').to.exist
    expect(entry!.isPlugin).to.equal(true)
    expect(entry!.isWasm).to.equal(true)
  })

  it('does not mark Node plugins as WASM', async function () {
    const store = await getAppStore()
    const entry = store.available.find((a) => a.name === NODE_PLUGIN)
    expect(entry!.isPlugin).to.equal(true)
    expect(entry!.isWasm).to.equal(false)
  })

  it('lists a package with both plugin keywords once', async function () {
    const store = await getAppStore()
    const entries = store.available.filter((a) => a.name === DUAL_KEYWORD)
    expect(entries).to.have.length(1)
    expect(entries[0]!.isWasm).to.equal(true)
  })

  it('offers an update for an installed WASM plugin even with the runtime disabled', async function () {
    const store = await getAppStore()
    const update = store.updates.find((a) => a.name === INSTALLED_WASM)
    expect(update, 'newer version should be offered as an update').to.exist
    expect(update!.installedVersion).to.equal(INSTALLED_VERSION)
    expect(update!.version).to.equal(LATEST_VERSION)
    expect(update!.isWasm).to.equal(true)
  })

  it('serves the detail page of a WASM plugin', async function () {
    const res = await fetch(
      `${host}/skServer/appstore/plugin/${AVAILABLE_WASM}`
    )
    expect(res.status).to.equal(200)
    const detail = (await res.json()) as AppInfo
    expect(detail.isPlugin).to.equal(true)
    expect(detail.isWasm).to.equal(true)
  })

  it('accepts installing a WASM plugin', async function () {
    const res = await fetch(
      `${host}/skServer/appstore/install/${AVAILABLE_WASM}/${LATEST_VERSION}`,
      { method: 'POST' }
    )
    expect(res.status).to.equal(200)
  })

  it('accepts removing a WASM plugin', async function () {
    const res = await fetch(
      `${host}/skServer/appstore/remove/${INSTALLED_WASM}`,
      { method: 'POST' }
    )
    expect(res.status).to.equal(200)
  })
})
