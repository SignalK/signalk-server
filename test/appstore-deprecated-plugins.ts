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
const DEPRECATED_WEBAPP = 'npm-deprecated-webapp'
const LATEST_DEPRECATED_PLUGIN = 'latest-deprecated-plugin'

const INSTALLED_VERSION = '1.0.0'
const LATEST_VERSION = '1.1.0'
const DEPRECATION_NOTICE = 'Replaced by listed-plugin'
const LATEST_NOTICE = 'Do not update, use 1.0.0'

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
  updates: AppInfo[]
}

// npm search leaves out deprecated packages, so only LISTED_PLUGIN is found.
// The installed version of DEPRECATED_PLUGIN and DEPRECATED_WEBAPP is
// deprecated; the webapp's newer release is not. LATEST_DEPRECATED_PLUGIN
// is the other way round. UNPUBLISHED_PLUGIN is not on npm.
const VERSION_METADATA: Record<string, { deprecated?: string }> = {
  [`${LISTED_PLUGIN}/${INSTALLED_VERSION}`]: {},
  [`${DEPRECATED_PLUGIN}/${INSTALLED_VERSION}`]: {
    deprecated: DEPRECATION_NOTICE
  },
  [`${DEPRECATED_WEBAPP}/${INSTALLED_VERSION}`]: {
    deprecated: DEPRECATION_NOTICE
  },
  [`${DEPRECATED_WEBAPP}/${LATEST_VERSION}`]: {},
  [`${LATEST_DEPRECATED_PLUGIN}/${INSTALLED_VERSION}`]: {},
  [`${LATEST_DEPRECATED_PLUGIN}/${LATEST_VERSION}`]: {
    deprecated: LATEST_NOTICE
  },
  [`${LATEST_DEPRECATED_PLUGIN}/latest`]: { deprecated: LATEST_NOTICE }
}
const WITH_NEWER_RELEASE = [DEPRECATED_WEBAPP, LATEST_DEPRECATED_PLUGIN]

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
    const registryPath = url.replace('https://registry.npmjs.org/', '')
    const metadata = VERSION_METADATA[registryPath]
    if (metadata) {
      const [name, version] = registryPath.split('/')
      return Promise.resolve(
        Response.json({
          name,
          version: version === 'latest' ? LATEST_VERSION : version,
          ...metadata
        })
      )
    }
    const tagged = WITH_NEWER_RELEASE.find(
      (name) => registryPath === `-/package/${name}/dist-tags`
    )
    if (tagged) {
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

function seedInstalledPackages(configDir: string) {
  const plugins = [
    DEPRECATED_PLUGIN,
    UNPUBLISHED_PLUGIN,
    LATEST_DEPRECATED_PLUGIN
  ]
  const names = [...plugins, DEPRECATED_WEBAPP]
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
  for (const name of plugins) {
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
  const webappDir = path.join(configDir, 'node_modules', DEPRECATED_WEBAPP)
  fs.mkdirSync(path.join(webappDir, 'public'), { recursive: true })
  fs.writeFileSync(
    path.join(webappDir, 'package.json'),
    JSON.stringify({
      name: DEPRECATED_WEBAPP,
      version: INSTALLED_VERSION,
      keywords: ['signalk-webapp']
    })
  )
  fs.writeFileSync(
    path.join(webappDir, 'public', 'index.html'),
    '<html></html>'
  )
}

// Detail pages cached before npm deprecated DEPRECATED_PLUGIN and while
// npm still deprecated LISTED_PLUGIN.
function seedCachedDetail(
  configDir: string,
  name: string,
  deprecationMessage?: string
) {
  const dir = path.join(configDir, 'appstore-cache', 'plugins', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'detail.json'),
    JSON.stringify({
      writtenAt: Date.now(),
      installed: true,
      payload: {
        name,
        version: INSTALLED_VERSION,
        screenshots: [],
        official: false,
        deprecated: deprecationMessage !== undefined,
        deprecationMessage,
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
    seedInstalledPackages(configDir)
    seedCachedDetail(configDir, DEPRECATED_PLUGIN)
    seedCachedDetail(configDir, LISTED_PLUGIN, 'No longer maintained')
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

  it('offers the published update for an installed webapp npm deprecated', async function () {
    const store = await getAppStore(host)
    const update = store.updates.find((a) => a.name === DEPRECATED_WEBAPP)
    expect(update, 'newer release should be offered').to.exist
    expect(update!.installedVersion).to.equal(INSTALLED_VERSION)
    expect(update!.version).to.equal(LATEST_VERSION)
    expect(update!.deprecationMessage).to.equal(DEPRECATION_NOTICE)
  })

  it('shows the notice of the offered release on the detail page', async function () {
    await getAppStore(host)
    const res = await fetch(
      `${host}/skServer/appstore/plugin/${DEPRECATED_WEBAPP}`
    )
    expect(res.status).to.equal(200)
    const detail = (await res.json()) as AppInfo
    expect(detail.version).to.equal(LATEST_VERSION)
    expect(detail.deprecated).to.equal(false)
    expect(detail.deprecationMessage).to.equal(undefined)
  })

  it('lists an installed plugin whose latest release npm deprecated', async function () {
    const store = await getAppStore(host)
    const update = store.updates.find(
      (a) => a.name === LATEST_DEPRECATED_PLUGIN
    )
    expect(update, 'plugin should be listed with its update').to.exist
    expect(update!.installedVersion).to.equal(INSTALLED_VERSION)
    expect(update!.version).to.equal(LATEST_VERSION)
    const res = await fetch(
      `${host}/skServer/appstore/plugin/${LATEST_DEPRECATED_PLUGIN}`
    )
    const detail = (await res.json()) as AppInfo
    expect(detail.version).to.equal(LATEST_VERSION)
    expect(detail.deprecationMessage).to.equal(LATEST_NOTICE)
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

  it('drops a cached deprecation notice npm no longer reports', async function () {
    await getAppStore(host)
    const res = await fetch(`${host}/skServer/appstore/plugin/${LISTED_PLUGIN}`)
    expect(res.status).to.equal(200)
    const detail = (await res.json()) as AppInfo
    expect(detail.deprecated).to.equal(false)
    expect(detail.deprecationMessage).to.equal(undefined)
  })
})
