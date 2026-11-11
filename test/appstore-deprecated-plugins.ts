import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startServerP } = require('./servertestutilities')

const NODE_KEYWORD = 'signalk-node-server-plugin'

const LISTED_PLUGIN = 'listed-plugin'
const DEPRECATED_PLUGIN = 'npm-deprecated-plugin'
const UNPUBLISHED_PLUGIN = 'unpublished-local-plugin'

const INSTALLED_VERSION = '1.0.0'
const DEPRECATION_NOTICE = 'Replaced by listed-plugin'

const SUITE_TIMEOUT_MS = 60000

interface AppInfo {
  name: string
  version?: string
  installedVersion?: string
  deprecated?: boolean
  deprecationMessage?: string
}

interface AppStoreResponse {
  installed: AppInfo[]
  available: AppInfo[]
}

// npm search leaves out packages whose current version is deprecated, so
// only LISTED_PLUGIN is found. The per-version metadata of the installed
// DEPRECATED_PLUGIN carries npm's notice; UNPUBLISHED_PLUGIN is not on npm.
function stubNpmRegistry() {
  const realFetch = global.fetch
  global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('https://registry.npmjs.org/-/v1/search')) {
      const objects = url.includes(NODE_KEYWORD)
        ? [
            {
              package: {
                name: LISTED_PLUGIN,
                version: INSTALLED_VERSION,
                keywords: [NODE_KEYWORD],
                description: `${LISTED_PLUGIN} description`,
                date: new Date().toISOString(),
                links: {}
              }
            }
          ]
        : []
      return Promise.resolve(Response.json({ objects, total: objects.length }))
    }
    if (
      url ===
      `https://registry.npmjs.org/${DEPRECATED_PLUGIN}/${INSTALLED_VERSION}`
    ) {
      return Promise.resolve(
        Response.json({
          name: DEPRECATED_PLUGIN,
          version: INSTALLED_VERSION,
          deprecated: DEPRECATION_NOTICE
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

function seedInstalledPlugins(configDir: string) {
  const names = [DEPRECATED_PLUGIN, UNPUBLISHED_PLUGIN]
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
        main: 'index.js',
        keywords: [NODE_KEYWORD]
      })
    )
    fs.writeFileSync(
      path.join(moduleDir, 'index.js'),
      `module.exports = () => ({ id: '${name}', name: '${name}', schema: {}, start() {}, stop() {} })\n`
    )
  }
}

// A detail page cached for the installed version before npm deprecated it.
function seedCachedDetail(configDir: string) {
  const dir = path.join(
    configDir,
    'appstore-cache',
    'plugins',
    DEPRECATED_PLUGIN
  )
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'detail.json'),
    JSON.stringify({
      writtenAt: Date.now(),
      installed: true,
      payload: {
        name: DEPRECATED_PLUGIN,
        version: INSTALLED_VERSION,
        screenshots: [],
        official: false,
        deprecated: false,
        isWasm: false,
        readme: '',
        changelog: '',
        requires: [],
        recommends: [],
        readmeFormat: 'markdown',
        changelogFormat: 'markdown',
        fetchedAt: Date.now(),
        fromCache: true
      }
    })
  )
}

async function startAppStoreServer() {
  const configDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'sk-appstore-deprecated-')
  )
  const restoreFetch = stubNpmRegistry()
  const cleanUp = () => {
    restoreFetch()
    fs.rmSync(configDir, { recursive: true, force: true })
  }
  try {
    seedInstalledPlugins(configDir)
    seedCachedDetail(configDir)
    const port = await freeport()
    const server = await startServerP(
      port,
      false,
      { settings: { interfaces: { plugins: true } } },
      undefined,
      configDir
    )
    return {
      host: 'http://localhost:' + port,
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

describe('appstore lists installed npm-deprecated plugins', function () {
  this.timeout(SUITE_TIMEOUT_MS)

  let stop: (() => Promise<void>) | undefined
  let host: string

  before(async function () {
    ;({ host, stop } = await startAppStoreServer())
  })

  after(async function () {
    if (stop) await stop()
  })

  it('lists an installed plugin the search leaves out because npm deprecated it', async function () {
    const store = await getAppStore(host)
    const entry = store.installed.find((a) => a.name === DEPRECATED_PLUGIN)
    expect(entry, 'deprecated plugin should be listed').to.exist
    expect(entry!.installedVersion).to.equal(INSTALLED_VERSION)
    expect(entry!.deprecated).to.equal(true)
    expect(entry!.deprecationMessage).to.equal(DEPRECATION_NOTICE)
  })

  it('does not list an installed plugin that is not on npm', async function () {
    const store = await getAppStore(host)
    expect(store.installed.find((a) => a.name === UNPUBLISHED_PLUGIN)).to.not
      .exist
  })

  it('does not mark a plugin deprecated without a notice', async function () {
    const store = await getAppStore(host)
    const entry = store.available.find((a) => a.name === LISTED_PLUGIN)
    expect(entry!.deprecated).to.equal(false)
    expect(entry!.deprecationMessage).to.equal(undefined)
  })

  it('shows the npm deprecation notice on a detail page cached before the deprecation', async function () {
    await getAppStore(host)
    const res = await fetch(
      `${host}/skServer/appstore/plugin/${DEPRECATED_PLUGIN}`
    )
    expect(res.status).to.equal(200)
    const detail = (await res.json()) as AppInfo
    expect(detail.deprecated).to.equal(true)
    expect(detail.deprecationMessage).to.equal(DEPRECATION_NOTICE)
  })
})
