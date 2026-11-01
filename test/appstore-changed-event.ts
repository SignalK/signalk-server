import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freeport } from './ts-servertestutilities'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startServerP } = require('./servertestutilities')

const PLUGIN_NAME = 'changed-event-plugin'
const PLUGIN_VERSION = '1.0.0'
const SUITE_TIMEOUT_MS = 60000
const EVENT_TIMEOUT_MS = 10000

// The search finds the plugin, and every other registry request fails, as
// it does when npm is unreachable for anything beyond a cached search.
function stubNpmRegistry() {
  const realFetch = global.fetch
  global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('https://registry.npmjs.org/-/v1/search')) {
      const found = url.includes('signalk-node-server-plugin')
      return Promise.resolve(
        Response.json({
          objects: found
            ? [
                {
                  package: {
                    name: PLUGIN_NAME,
                    version: PLUGIN_VERSION,
                    description: 'Plugin used to verify the change event',
                    keywords: ['signalk-node-server-plugin'],
                    date: new Date().toISOString(),
                    links: {}
                  }
                }
              ]
            : [],
          total: found ? 1 : 0
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

function writeNpmStub(binDir: string) {
  fs.mkdirSync(binDir, { recursive: true })
  const stub = path.join(binDir, 'npm')
  fs.writeFileSync(stub, '#!/bin/sh\necho "0.0.0-npm-stub"\nexit 0\n')
  fs.chmodSync(stub, 0o755)
}

describe('appstore change event', function () {
  this.timeout(SUITE_TIMEOUT_MS)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let host: string
  let configDir: string
  let originalPath: string | undefined
  let restoreFetch: (() => void) | undefined

  before(async function () {
    if (process.platform === 'win32') {
      this.skip()
    }
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-appstore-event-'))
    originalPath = process.env.PATH
    const binDir = path.join(configDir, 'bin')
    writeNpmStub(binDir)
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`
    restoreFetch = stubNpmRegistry()
    const port = await freeport()
    server = await startServerP(
      port,
      false,
      { settings: { interfaces: { plugins: true } } },
      undefined,
      configDir
    )
    host = `http://localhost:${port}`
  })

  after(async function () {
    try {
      if (server) await server.stop()
    } finally {
      if (restoreFetch) restoreFetch()
      process.env.PATH = originalPath
      if (configDir) fs.rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('reports an install although the server version cannot be fetched', async function () {
    const event = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('no APP_STORE_CHANGED event')),
        EVENT_TIMEOUT_MS
      )
      const onEvent = (e: { type: string }) => {
        if (e.type !== 'APP_STORE_CHANGED') return
        clearTimeout(timer)
        server.app.removeListener('serverevent', onEvent)
        resolve()
      }
      server.app.on('serverevent', onEvent)
    })

    const res = await fetch(
      `${host}/skServer/appstore/install/${PLUGIN_NAME}/${PLUGIN_VERSION}`,
      { method: 'POST' }
    )
    expect(res.status).to.equal(200)
    await event
  })
})
