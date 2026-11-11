import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freeport } from './ts-servertestutilities'

const {
  startServerP,
  getAdminToken,
  getReadOnlyToken
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('./servertestutilities')

const INSTALLED = 'readonlystoreinstalled'
const NOT_INSTALLED = 'readonlystoreother'

interface AppInfo {
  name: string
  version?: string
  installedVersion?: string
  id?: string
}

interface AppStoreResponse {
  available: AppInfo[]
  installed: AppInfo[]
  updates: AppInfo[]
  installing: AppInfo[]
  canUpdateServer?: boolean
}

function packageJson(name: string, version: string) {
  return {
    name,
    id: name,
    version,
    description: `${name} test plugin`,
    keywords: ['signalk-node-server-plugin'],
    main: 'index.js'
  }
}

function seedConfigDir(configDir: string) {
  const moduleDir = path.join(configDir, 'node_modules', INSTALLED)
  fs.mkdirSync(moduleDir, { recursive: true })
  fs.writeFileSync(
    path.join(configDir, 'package.json'),
    JSON.stringify({
      name: 'signalk-server-config',
      version: '0.0.1',
      dependencies: { [INSTALLED]: '^1.0.0' }
    })
  )
  fs.writeFileSync(
    path.join(moduleDir, 'package.json'),
    JSON.stringify(packageJson(INSTALLED, '1.0.0'))
  )
  fs.writeFileSync(
    path.join(moduleDir, 'index.js'),
    `module.exports = () => ({ id: '${INSTALLED}', name: '${INSTALLED}', start() {}, stop() {}, schema: {} })\n`
  )
}

function stubNpm() {
  const realFetch = global.fetch
  global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('https://registry.npmjs.org/-/v1/search')) {
      const plugins = url.includes('signalk-node-server-plugin')
      return Promise.resolve(
        Response.json({
          objects: plugins
            ? [INSTALLED, NOT_INSTALLED].map((name) => ({
                package: {
                  ...packageJson(name, '2.0.0'),
                  date: new Date().toISOString(),
                  links: {}
                }
              }))
            : [],
          total: plugins ? 2 : 0
        })
      )
    }
    if (url.startsWith('https://registry.npmjs.org')) {
      return Promise.resolve(new Response('{}', { status: 404 }))
    }
    return realFetch(input, init)
  }) as typeof global.fetch
  return () => {
    global.fetch = realFetch
  }
}

describe('appstore for read-only users', function () {
  this.timeout(60000)

  let server: { stop: () => Promise<unknown> } | undefined
  let restoreFetch: (() => void) | undefined
  let configDir: string
  let host: string
  let adminToken: string
  let readToken: string

  before(async function () {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-appstore-ro-'))
    seedConfigDir(configDir)
    restoreFetch = stubNpm()
    const port = await freeport()
    host = `http://localhost:${port}`
    server = await startServerP(
      port,
      true,
      { settings: { interfaces: { plugins: true } } },
      { allow_readonly: true },
      configDir
    )
    adminToken = await getAdminToken(server)
    readToken = await getReadOnlyToken(server)
  })

  after(async function () {
    if (server) await server.stop()
    if (restoreFetch) restoreFetch()
    if (configDir) fs.rmSync(configDir, { recursive: true, force: true })
  })

  function headers(token?: string): Record<string, string> {
    return token ? { Cookie: `JAUTHENTICATION=${token}` } : {}
  }

  async function getStore(token?: string): Promise<AppStoreResponse> {
    const res = await fetch(`${host}/skServer/appstore/available/`, {
      headers: headers(token)
    })
    expect(res.status).to.equal(200)
    return (await res.json()) as AppStoreResponse
  }

  it('lists the catalog for an anonymous visitor', async function () {
    const store = await getStore()
    expect(store.available.map((a) => a.name)).to.include.members([
      INSTALLED,
      NOT_INSTALLED
    ])
  })

  for (const [who, token] of [
    ['an anonymous visitor', () => undefined],
    ['a read-only user', () => readToken]
  ] as const) {
    it(`does not tell ${who} what is installed`, async function () {
      const store = await getStore(token())
      expect(store.installed).to.deep.equal([])
      expect(store.updates).to.deep.equal([])
      expect(store.installing).to.deep.equal([])
      expect(store.canUpdateServer).to.equal(false)
      const entry = store.available.find((a) => a.name === INSTALLED)
      expect(entry).to.exist
      expect(entry!.installedVersion).to.equal(undefined)
      expect(entry!.id).to.equal(undefined)
    })
  }

  it('leaves install state out of a plugin detail for a read-only user', async function () {
    const res = await fetch(`${host}/skServer/appstore/plugin/${INSTALLED}`, {
      headers: headers(readToken)
    })
    expect(res.status).to.equal(200)
    const detail = (await res.json()) as Record<string, unknown>
    expect(detail.name).to.equal(INSTALLED)
    expect(detail).to.not.have.any.keys(
      'installedIconUrl',
      'installedScreenshotUrls'
    )
    for (const dep of [
      ...((detail.requires as object[]) ?? []),
      ...((detail.recommends as object[]) ?? [])
    ]) {
      expect(dep).to.not.have.property('installed')
    }
  })

  it('still tells the admin what is installed', async function () {
    const store = await getStore(adminToken)
    const installed = store.installed.find((a) => a.name === INSTALLED)
    expect(installed?.installedVersion).to.equal('1.0.0')
    expect(store.updates.map((a) => a.name)).to.include(INSTALLED)
  })

  it('refuses installs, removals and installed-plugin details to non-admins', async function () {
    const requests: Array<[string, string]> = [
      ['POST', `/skServer/appstore/install/${NOT_INSTALLED}/2.0.0`],
      ['POST', `/skServer/appstore/remove/${INSTALLED}`],
      ['POST', '/skServer/appstore/install-with-deps'],
      ['POST', '/skServer/appstore/refresh'],
      ['GET', `/skServer/appstore/datasize/${INSTALLED}`],
      ['GET', `/skServer/appstore/installLog/${INSTALLED}`]
    ]
    for (const token of [undefined, readToken]) {
      for (const [method, url] of requests) {
        const res = await fetch(`${host}${url}`, {
          method,
          headers: { ...headers(token), 'Content-Type': 'application/json' },
          body: method === 'POST' ? '{}' : undefined
        })
        expect(res.status, `${method} ${url}`).to.equal(401)
      }
    }
  })
})
