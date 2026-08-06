import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startServerP } = require('./servertestutilities')

const PLUGIN_NAME = 'pendingversionplugin'
const INSTALLED_VERSION = '1.0.0'
const AVAILABLE_VERSION = '2.0.0'

interface AppInfo {
  name: string
  version?: string
  installedVersion?: string
  pendingVersion?: string
  isInstalling?: boolean
  isWaiting?: boolean
  isRemove?: boolean
}

interface AppStoreResponse {
  installed: AppInfo[]
  available: AppInfo[]
  updates: AppInfo[]
  installing: AppInfo[]
}

// The install path shells out to `npm`. Putting a stub earlier on PATH keeps
// the whole server pipeline real — HTTP endpoint, install state machine,
// APP_STORE_CHANGED refresh — while the "install" itself is just a local
// package.json rewrite, so the test never touches the network.
function writeNpmStub(binDir: string, configDir: string) {
  fs.mkdirSync(binDir, { recursive: true })
  const stub = path.join(binDir, 'npm')
  const moduleDir = path.join(configDir, 'node_modules', PLUGIN_NAME)
  fs.writeFileSync(
    stub,
    `#!/bin/sh
# The server also probes "npm --version" at startup, so only an actual
# install may touch the plugin on disk.
for arg in "$@"; do
  if [ "$arg" = "install" ]; then
    # While the block file exists the install stays in flight, which lets a
    # test observe a second install sitting in the queue behind this one.
    while [ -f ${JSON.stringify(blockFilePath(binDir))} ]; do
      sleep 0.05
    done
    # Emulate "npm --save --ignore-scripts install <name>@<version>" by
    # bumping the on-disk package.json to the requested version.
    cat > ${JSON.stringify(path.join(moduleDir, 'package.json'))} <<'EOF'
${JSON.stringify(pluginPackageJson(AVAILABLE_VERSION), null, 2)}
EOF
    echo "added 1 package"
    exit 0
  fi
done
echo "0.0.0-npm-stub"
exit 0
`
  )
  fs.chmodSync(stub, 0o755)
}

function blockFilePath(binDir: string) {
  return path.join(binDir, 'block-install')
}

function pluginPackageJson(version: string) {
  return {
    name: PLUGIN_NAME,
    id: PLUGIN_NAME,
    version,
    description: 'Plugin used to verify pending-version reporting',
    keywords: ['signalk-node-server-plugin'],
    main: 'index.js'
  }
}

function seedConfigDir(configDir: string) {
  const moduleDir = path.join(configDir, 'node_modules', PLUGIN_NAME)
  fs.mkdirSync(moduleDir, { recursive: true })
  fs.writeFileSync(
    path.join(configDir, 'package.json'),
    JSON.stringify(
      {
        name: 'signalk-server-config',
        version: '0.0.1',
        dependencies: { [PLUGIN_NAME]: `^${INSTALLED_VERSION}` }
      },
      null,
      2
    )
  )
  fs.writeFileSync(
    path.join(moduleDir, 'package.json'),
    JSON.stringify(pluginPackageJson(INSTALLED_VERSION), null, 2)
  )
  fs.writeFileSync(
    path.join(moduleDir, 'index.js'),
    `module.exports = function (app) {
  return {
    id: '${PLUGIN_NAME}',
    name: '${PLUGIN_NAME}',
    start: function () {},
    stop: function () {},
    schema: function () { return {} }
  }
}
`
  )
}

// npm's search API is the only network dependency in the appstore read path;
// serve the plugin at the newer version so the server sees an update as
// available for the locally installed v1.
function stubNpmSearch() {
  const realFetch = global.fetch
  global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('https://registry.npmjs.org/-/v1/search')) {
      return Promise.resolve(
        Response.json({
          objects: url.includes('signalk-node-server-plugin')
            ? [
                {
                  package: {
                    name: PLUGIN_NAME,
                    version: AVAILABLE_VERSION,
                    description: 'Plugin used to verify pending-version report',
                    keywords: ['signalk-node-server-plugin'],
                    date: new Date().toISOString(),
                    links: {}
                  }
                }
              ]
            : [],
          total: url.includes('signalk-node-server-plugin') ? 1 : 0
        })
      )
    }
    // Everything else the appstore hydrators reach for (dist-tags, registry
    // metadata, icon probes) is optional enrichment - fail it fast rather
    // than letting the suite depend on being online.
    if (url.startsWith('https://registry.npmjs.org')) {
      return Promise.resolve(new Response('{}', { status: 404 }))
    }
    return realFetch(input, init)
  }) as typeof global.fetch
  return () => {
    global.fetch = realFetch
  }
}

async function getAppStore(host: string): Promise<AppStoreResponse> {
  const res = await fetch(`${host}/skServer/appstore/available/`)
  expect(res.status).to.equal(200)
  return (await res.json()) as AppStoreResponse
}

// npm runs in a child process, so the endpoints are polled rather than awaited.
const POLL_INTERVAL_MS = 100
const POLL_ATTEMPTS = 100
const SUITE_TIMEOUT_MS = 60000

// Poll the same endpoint the Admin UI reads until the entry satisfies
// `settled`, i.e. the operation is no longer in flight.
async function waitForEntry(
  host: string,
  settled: (entry: AppInfo) => boolean,
  description: string
): Promise<AppInfo> {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const store = await getAppStore(host)
    const entry = store.installing.find((a) => a.name === PLUGIN_NAME)
    if (entry && settled(entry)) {
      return entry
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw new Error(`${description} did not complete`)
}

describe('appstore reports the just-installed version (issue #2791)', function () {
  // Real npm-stub subprocess plus a full server start.
  this.timeout(SUITE_TIMEOUT_MS)

  let stop: (() => Promise<unknown>) | undefined
  let restoreFetch: (() => void) | undefined
  let configDir: string
  let binDir: string
  let host: string
  let originalPath: string | undefined

  before(async function () {
    if (process.platform === 'win32') {
      this.skip()
    }
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-pending-version-'))
    seedConfigDir(configDir)

    binDir = path.join(configDir, 'bin')
    writeNpmStub(binDir, configDir)
    originalPath = process.env.PATH
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`

    restoreFetch = stubNpmSearch()

    const port = await freeport()
    host = 'http://localhost:' + port
    const server = await startServerP(
      port,
      false,
      { settings: { interfaces: { plugins: true } } },
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

  it('offers the newer version as an update for the running plugin', async function () {
    const store = await getAppStore(host)
    const installed = store.installed.find((a) => a.name === PLUGIN_NAME)
    expect(installed, 'plugin should be reported as installed').to.exist
    // `version` is the latest version npm offers; `installedVersion` is what
    // the running plugin was loaded from.
    expect(installed!.installedVersion).to.equal(INSTALLED_VERSION)
    expect(installed!.version).to.equal(AVAILABLE_VERSION)

    const update = store.updates.find((a) => a.name === PLUGIN_NAME)
    expect(update, 'newer version should be offered as an update').to.exist
    expect(update!.version).to.equal(AVAILABLE_VERSION)
  })

  it('rejects an install request carrying a bogus version', async function () {
    const res = await fetch(
      `${host}/skServer/appstore/install/${PLUGIN_NAME}/not-a-version`,
      { method: 'POST' }
    )
    expect(res.status).to.equal(400)

    // Nothing may be recorded as in-flight, otherwise the bogus version would
    // reach the Admin UI as a pending version.
    const store = await getAppStore(host)
    expect(store.installing.find((a) => a.name === PLUGIN_NAME)).to.equal(
      undefined
    )
  })

  it('reports the installed version as pending while the old one still runs', async function () {
    const res = await fetch(
      `${host}/skServer/appstore/install/${PLUGIN_NAME}/${AVAILABLE_VERSION}`,
      { method: 'POST' }
    )
    expect(res.status).to.equal(200)

    const entry = await waitForEntry(host, (e) => !e.isInstalling, 'install')

    // The regression in #2791: the Installs & Removes screen rendered
    // installedVersion, which is the version the *running* plugin was loaded
    // from and stays stale until restart. pendingVersion carries what npm
    // actually put on disk.
    expect(entry.pendingVersion).to.equal(AVAILABLE_VERSION)
    expect(entry.installedVersion).to.equal(INSTALLED_VERSION)
    expect(entry.isRemove).to.not.equal(true)

    // Sanity-check that the stub really wrote the new version to disk, so the
    // assertion above cannot pass against an install that never happened.
    const onDisk = JSON.parse(
      fs.readFileSync(
        path.join(configDir, 'node_modules', PLUGIN_NAME, 'package.json'),
        'utf8'
      )
    )
    expect(onDisk.version).to.equal(AVAILABLE_VERSION)
  })

  it('reports the target version of an install still sitting in the queue', async function () {
    // Hold the first install open so the second one has to queue behind it.
    fs.writeFileSync(blockFilePath(binDir), '')
    try {
      const first = await fetch(
        `${host}/skServer/appstore/install/${PLUGIN_NAME}/${AVAILABLE_VERSION}`,
        { method: 'POST' }
      )
      expect(first.status).to.equal(200)
      const inFlight = await waitForEntry(
        host,
        (e) => !!e.isInstalling,
        'first install start'
      )
      expect(inFlight.pendingVersion).to.equal(AVAILABLE_VERSION)

      const second = await fetch(
        `${host}/skServer/appstore/install/${PLUGIN_NAME}/${AVAILABLE_VERSION}`,
        { method: 'POST' }
      )
      expect(second.status).to.equal(200)

      const queued = await waitForEntry(host, (e) => !!e.isWaiting, 'queueing')
      expect(queued.pendingVersion).to.equal(AVAILABLE_VERSION)
    } finally {
      fs.rmSync(blockFilePath(binDir), { force: true })
    }

    await waitForEntry(host, (e) => !e.isInstalling && !e.isWaiting, 'install')
  })

  it('does not report a pending version for a removal', async function () {
    const res = await fetch(`${host}/skServer/appstore/remove/${PLUGIN_NAME}`, {
      method: 'POST'
    })
    expect(res.status).to.equal(200)

    const entry = await waitForEntry(
      host,
      (e) => !!e.isRemove && !e.isInstalling,
      'removal'
    )

    // Removals carry a null version through the install machinery; the field
    // must stay absent rather than serialize as null.
    expect(entry.pendingVersion).to.equal(undefined)
  })
})
