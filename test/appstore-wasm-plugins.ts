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
const WASM_ONLY = 'wasm-keyword-only-plugin'
const INSTALLED_WASM_ONLY = 'installed-wasm-keyword-only-plugin'
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

// The store searches npm only for the Node plugin keyword, so WASM plugins
// published with both keywords are found and WASM_ONLY is not. An installed
// WASM plugin the search misses is listed from its installed entry instead.
const SEARCH_RESULTS: Record<string, SearchPackage[]> = {
  [NODE_KEYWORD]: [
    { name: NODE_PLUGIN, version: LATEST_VERSION, keywords: [NODE_KEYWORD] },
    {
      name: INSTALLED_WASM,
      version: LATEST_VERSION,
      keywords: [NODE_KEYWORD, WASM_KEYWORD]
    },
    {
      name: AVAILABLE_WASM,
      version: LATEST_VERSION,
      keywords: [NODE_KEYWORD, WASM_KEYWORD]
    }
  ],
  [WASM_KEYWORD]: [
    {
      name: WASM_ONLY,
      version: LATEST_VERSION,
      keywords: [WASM_KEYWORD]
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
    // The server's own dist-tags are read after every install and remove;
    // answering them keeps those runs free of unhandled rejections.
    if (
      url ===
        `https://registry.npmjs.org/-/package/${INSTALLED_WASM_ONLY}/dist-tags` ||
      url === 'https://registry.npmjs.org/-/package/signalk-server/dist-tags'
    ) {
      return Promise.resolve(Response.json({ latest: LATEST_VERSION }))
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

// Install and remove shell out to `npm`; a stub that records its arguments
// and succeeds without touching anything keeps the suite offline.
function writeNpmStub(binDir: string, callLog: string) {
  fs.mkdirSync(binDir, { recursive: true })
  const stub = path.join(binDir, 'npm')
  fs.writeFileSync(
    stub,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> '${callLog}'\necho "0.0.0-npm-stub"\nexit 0\n`
  )
  fs.chmodSync(stub, 0o755)
}

const NPM_CALL_TIMEOUT_MS = 10000
const NPM_CALL_POLL_MS = 100

// Install and remove run in the background after the route answers, so wait
// for the stub to record the npm command.
async function waitForNpmCall(
  callLog: string,
  command: string,
  packageSpec: string
): Promise<void> {
  const deadline = Date.now() + NPM_CALL_TIMEOUT_MS
  const recorded = () =>
    fs.existsSync(callLog)
      ? fs.readFileSync(callLog, 'utf8').split('\n').filter(Boolean)
      : []
  while (Date.now() < deadline) {
    const found = recorded().some((call) => {
      const args = call.split(' ')
      return args.includes(command) && args.at(-1) === packageSpec
    })
    if (found) return
    await new Promise((resolve) => setTimeout(resolve, NPM_CALL_POLL_MS))
  }
  expect.fail(
    `npm ${command} ${packageSpec} was not run; npm calls: ${JSON.stringify(recorded())}`
  )
}

// With the WASM runtime disabled the server registers installed WASM
// plugins without loading their binary, so the packages need no .wasm file.
// INSTALLED_WASM_ONLY is missing from the npm search results, and npm
// reports a newer release of it.
function seedInstalledWasmPlugins(configDir: string) {
  const names = [INSTALLED_WASM, INSTALLED_WASM_ONLY]
  fs.writeFileSync(
    path.join(configDir, 'package.json'),
    JSON.stringify({
      name: 'signalk-server-config',
      version: '0.0.1',
      dependencies: Object.fromEntries(
        names.map((name) => [name, `^${INSTALLED_VERSION}`])
      )
    })
  )
  for (const name of names) {
    const moduleDir = path.join(configDir, 'node_modules', name)
    fs.mkdirSync(moduleDir, { recursive: true })
    fs.writeFileSync(
      path.join(moduleDir, 'package.json'),
      JSON.stringify({
        name,
        version: INSTALLED_VERSION,
        keywords: [WASM_KEYWORD],
        wasmManifest: 'plugin.wasm'
      })
    )
  }
}

async function startAppStoreServer() {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-appstore-wasm-'))
  const originalPath = process.env.PATH
  const restoreFetch = stubNpmRegistry()
  const cleanUp = () => {
    restoreFetch()
    process.env.PATH = originalPath
    fs.rmSync(configDir, { recursive: true, force: true })
  }
  try {
    seedInstalledWasmPlugins(configDir)
    const binDir = path.join(configDir, 'bin')
    const npmCallLog = path.join(configDir, 'npm-calls.log')
    writeNpmStub(binDir, npmCallLog)
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`

    const port = await freeport()
    const server = await startServerP(
      port,
      false,
      { settings: { interfaces: { plugins: true, wasm: false } } },
      undefined,
      configDir
    )
    return {
      host: 'http://localhost:' + port,
      npmCallLog,
      stop: async () => {
        try {
          await server.stop()
        } finally {
          cleanUp()
        }
      }
    }
  } catch (err) {
    cleanUp()
    throw err
  }
}

async function getAppStore(host: string): Promise<AppStoreResponse> {
  const res = await fetch(`${host}/skServer/appstore/available/`)
  expect(res.status).to.equal(200)
  return (await res.json()) as AppStoreResponse
}

describe('appstore lists WASM plugins', function () {
  this.timeout(SUITE_TIMEOUT_MS)

  let stop: (() => Promise<void>) | undefined
  let host: string
  let npmCallLog: string

  before(async function () {
    if (process.platform === 'win32') {
      this.skip()
    }
    ;({ host, npmCallLog, stop } = await startAppStoreServer())
  })

  after(async function () {
    if (stop) await stop()
  })

  it('offers a published WASM plugin as an installable plugin', async function () {
    const store = await getAppStore(host)
    const entry = store.available.find((a) => a.name === AVAILABLE_WASM)
    expect(entry, 'WASM plugin should be available').to.exist
    expect(entry!.isPlugin).to.equal(true)
    expect(entry!.isWasm).to.equal(true)
  })

  it('does not mark Node plugins as WASM', async function () {
    const store = await getAppStore(host)
    const entry = store.available.find((a) => a.name === NODE_PLUGIN)
    expect(entry!.isPlugin).to.equal(true)
    expect(entry!.isWasm).to.equal(false)
  })

  it('does not list a package published with only the WASM keyword', async function () {
    const store = await getAppStore(host)
    expect(store.available.find((a) => a.name === WASM_ONLY)).to.not.exist
  })

  it('offers an update for an installed WASM plugin even with the runtime disabled', async function () {
    const store = await getAppStore(host)
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
    await waitForNpmCall(
      npmCallLog,
      'install',
      `${AVAILABLE_WASM}@${LATEST_VERSION}`
    )
  })

  it('lists an installed WASM plugin the search does not find', async function () {
    const store = await getAppStore(host)
    const entry = store.installed.find((a) => a.name === INSTALLED_WASM_ONLY)
    expect(entry, 'installed WASM plugin should be listed').to.exist
    expect(entry!.isWasm).to.equal(true)
  })

  it('offers the published update for an installed WASM plugin the search does not find', async function () {
    const store = await getAppStore(host)
    const update = store.updates.find((a) => a.name === INSTALLED_WASM_ONLY)
    expect(update, 'npm latest should be offered as an update').to.exist
    expect(update!.installedVersion).to.equal(INSTALLED_VERSION)
    expect(update!.version).to.equal(LATEST_VERSION)
  })

  it('shows the published version on the detail page of an installed WASM plugin the search does not find', async function () {
    // The detail page reads the dist-tags the store list fetched.
    await getAppStore(host)
    const res = await fetch(
      `${host}/skServer/appstore/plugin/${INSTALLED_WASM_ONLY}`
    )
    expect(res.status).to.equal(200)
    const detail = (await res.json()) as AppInfo
    expect(detail.version).to.equal(LATEST_VERSION)
    expect(detail.isWasm).to.equal(true)
  })

  it('accepts removing an installed WASM plugin the search does not find', async function () {
    const res = await fetch(
      `${host}/skServer/appstore/remove/${INSTALLED_WASM_ONLY}`,
      { method: 'POST' }
    )
    expect(res.status).to.equal(200)
    await waitForNpmCall(npmCallLog, 'remove', INSTALLED_WASM_ONLY)
  })

  it('accepts removing a WASM plugin', async function () {
    const res = await fetch(
      `${host}/skServer/appstore/remove/${INSTALLED_WASM}`,
      { method: 'POST' }
    )
    expect(res.status).to.equal(200)
    await waitForNpmCall(npmCallLog, 'remove', INSTALLED_WASM)
  })
})
