import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startServerP } = require('./servertestutilities')

const PLUGIN_NAME = 'removestopsplugin'

interface Dirs {
  stopMarker: string
  sawAtRemove: string
}

// npm removes a package from disk but leaves its running instance alone, so
// the plugin has to be stopped first or it keeps running until the next
// restart. The plugin's stop() writes a marker; the npm stub records whether
// that marker already existed when `npm remove` ran.
function writeNpmStub(binDir: string, configDir: string, dirs: Dirs) {
  fs.mkdirSync(binDir, { recursive: true })
  const stub = path.join(binDir, 'npm')
  fs.writeFileSync(
    stub,
    `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "remove" ]; then
    if [ -f ${JSON.stringify(dirs.stopMarker)} ]; then
      echo stopped > ${JSON.stringify(dirs.sawAtRemove)}
    else
      echo running > ${JSON.stringify(dirs.sawAtRemove)}
    fi
    rm -rf ${JSON.stringify(path.join(configDir, 'node_modules', PLUGIN_NAME))}
    exit 0
  fi
done
echo "0.0.0-npm-stub"
exit 0
`
  )
  fs.chmodSync(stub, 0o755)
}

function seedConfigDir(configDir: string, dirs: Dirs) {
  const moduleDir = path.join(configDir, 'node_modules', PLUGIN_NAME)
  fs.mkdirSync(moduleDir, { recursive: true })
  fs.writeFileSync(
    path.join(configDir, 'package.json'),
    JSON.stringify({
      name: 'signalk-server-config',
      version: '0.0.1',
      dependencies: { [PLUGIN_NAME]: '^1.0.0' }
    })
  )
  fs.writeFileSync(
    path.join(moduleDir, 'package.json'),
    JSON.stringify({
      name: PLUGIN_NAME,
      version: '1.0.0',
      keywords: ['signalk-node-server-plugin'],
      main: 'index.js'
    })
  )
  fs.writeFileSync(
    path.join(moduleDir, 'index.js'),
    `const fs = require('fs')
module.exports = function () {
  return {
    id: '${PLUGIN_NAME}',
    name: '${PLUGIN_NAME}',
    start: function () {},
    stop: function () {
      fs.writeFileSync(${JSON.stringify(dirs.stopMarker)}, 'stopped')
    },
    schema: function () { return {} }
  }
}
`
  )
  const pluginConfigDir = path.join(configDir, 'plugin-config-data')
  fs.mkdirSync(pluginConfigDir, { recursive: true })
  fs.writeFileSync(
    path.join(pluginConfigDir, `${PLUGIN_NAME}.json`),
    JSON.stringify({ enabled: true, configuration: {} })
  )
}

// The remove endpoint only accepts a package the App Store lists, and the
// listing comes from npm search; serve the plugin from it and fail the
// optional enrichment lookups fast so the suite never needs the network.
function stubNpmSearch() {
  const realFetch = global.fetch
  global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('https://registry.npmjs.org/-/v1/search')) {
      const listed = url.includes('signalk-node-server-plugin')
      return Promise.resolve(
        Response.json({
          objects: listed
            ? [
                {
                  package: {
                    name: PLUGIN_NAME,
                    version: '1.0.0',
                    keywords: ['signalk-node-server-plugin'],
                    date: new Date().toISOString(),
                    links: {}
                  }
                }
              ]
            : [],
          total: listed ? 1 : 0
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

const POLL_INTERVAL_MS = 100
const POLL_ATTEMPTS = 100
const SUITE_TIMEOUT_MS = 60000

describe('appstore remove', function () {
  this.timeout(SUITE_TIMEOUT_MS)

  let stop: (() => Promise<unknown>) | undefined
  let restoreFetch: (() => void) | undefined
  let configDir: string
  let dirs: Dirs
  let host: string
  let originalPath: string | undefined

  before(async function () {
    if (process.platform === 'win32') {
      this.skip()
    }
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-remove-stops-'))
    dirs = {
      stopMarker: path.join(configDir, 'stopped-marker'),
      sawAtRemove: path.join(configDir, 'saw-at-remove')
    }
    seedConfigDir(configDir, dirs)
    const binDir = path.join(configDir, 'bin')
    writeNpmStub(binDir, configDir, dirs)
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

  it('stops a running plugin before npm removes it', async function () {
    expect(fs.existsSync(dirs.stopMarker), 'plugin stopped too early').to.equal(
      false
    )

    const res = await fetch(`${host}/skServer/appstore/remove/${PLUGIN_NAME}`, {
      method: 'POST'
    })
    expect(res.status).to.equal(200)

    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      if (fs.existsSync(dirs.sawAtRemove)) break
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    expect(fs.readFileSync(dirs.sawAtRemove, 'utf8').trim()).to.equal('stopped')
  })
})
