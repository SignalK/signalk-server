import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import { safeName } from '../src/appstore/safe-name'
import { serverTestConfigDirectory } from './servertestutilities'
import { startServer } from './ts-servertestutilities'

// Drives the real /skServer/appstore routes against a running server to
// cover the detail cache end to end: a repeat detail request is served
// from cache, and a cached entry for a superseded version is not.
const APPSTORE_E2E_TIMEOUT_MS = 60000
const REPEATED_LIST_REQUEST_COUNT = 3
const CONCURRENT_LIST_REQUEST_COUNT = 4

const PLUGIN_NAME = 'signalk-detail-cache-fixture'
const PLUGIN_VERSION = '2.1.0'
// Fixed so the fixture response is byte-identical on every call.
const PLUGIN_PUBLISHED_AT = '2026-01-01T00:00:00.000Z'
const NOT_FOUND = 404
const SEARCH_HIT_TOTAL = 1
const SEARCH_MISS_TOTAL = 0

// npm search is stubbed rather than called for real, so the assertions
// have a known package and version to seed the cache against and the
// suite runs identically with or without registry reachability.
function stubNpmSearch(): () => void {
  const realFetch = global.fetch
  const stub: typeof global.fetch = (input, init) => {
    // String(request) yields '[object Request]', which would match no
    // fixture branch and fall through to the real registry.
    const url = input instanceof Request ? input.url : String(input)
    if (url.startsWith('https://registry.npmjs.org/-/v1/search')) {
      const isPluginKeyword = url.includes('signalk-node-server-plugin')
      return Promise.resolve(
        Response.json({
          objects: isPluginKeyword
            ? [
                {
                  package: {
                    name: PLUGIN_NAME,
                    version: PLUGIN_VERSION,
                    description: 'Fixture for the appstore detail cache',
                    keywords: ['signalk-node-server-plugin'],
                    date: PLUGIN_PUBLISHED_AT,
                    links: {}
                  }
                }
              ]
            : [],
          total: isPluginKeyword ? SEARCH_HIT_TOTAL : SEARCH_MISS_TOTAL
        })
      )
    }
    // Everything else the detail builder reaches for — dist-tags, registry
    // metadata, readme/changelog, icon probes — is optional enrichment.
    // Fail it fast so the suite never depends on being online.
    if (
      url.startsWith('https://registry.npmjs.org') ||
      url.startsWith('https://unpkg.com') ||
      url.startsWith('https://api.github.com') ||
      url.startsWith('https://github.com') ||
      url.startsWith('https://raw.githubusercontent.com')
    ) {
      return Promise.resolve(new Response('{}', { status: NOT_FOUND }))
    }
    return realFetch(input, init)
  }
  global.fetch = stub
  return () => {
    global.fetch = realFetch
  }
}

describe('appstore detail cache', function () {
  this.timeout(APPSTORE_E2E_TIMEOUT_MS)

  let stop: (() => Promise<unknown>) | undefined
  let host: string
  let restoreFetch: (() => void) | undefined

  before(async function () {
    restoreFetch = stubNpmSearch()
    const s = await startServer()
    stop = s.stop
    host = s.host
  })

  after(async function () {
    // The stub is process-wide, so restore it even if the server fails to
    // stop — otherwise every later suite inherits it.
    try {
      if (stop) await stop()
    } finally {
      restoreFetch?.()
    }
  })

  function detailFileFor(name: string): string {
    return path.join(
      serverTestConfigDirectory(),
      'appstore-cache',
      'plugins',
      safeName(name),
      'detail.json'
    )
  }

  // The stubbed search always offers the fixture, so the detail route
  // reaches the branch where a match exists rather than the not-found
  // fallback — with or without registry reachability.
  async function anAvailablePlugin(): Promise<{
    name: string
    version: string
  }> {
    const res = await fetch(`${host}/skServer/appstore/available`)
    expect(res.status).to.equal(200)
    const body = (await res.json()) as {
      available?: Array<{ name: string; version: string }>
    }
    const candidate = (body.available || []).find((p) => p.name === PLUGIN_NAME)
    if (!candidate) {
      throw new Error(
        `stubbed npm search should offer ${PLUGIN_NAME}, got: ` +
          (body.available || []).map((p) => p.name).join(', ')
      )
    }
    return candidate
  }

  it('serves a matched plugin from cache instead of rebuilding it', async function () {
    const { name, version } = await anAvailablePlugin()

    // Seed the cache for the version npm is currently offering, with a
    // readme no network rebuild could produce. Returning it proves the
    // short-circuit fired; a rebuild would overwrite it with the real
    // readme fetched from the CDN.
    const marker = 'CACHED-README-MARKER'
    const file = detailFileFor(name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
      file,
      JSON.stringify({
        writtenAt: Date.now(),
        installed: false,
        payload: {
          name,
          version,
          readme: marker,
          readmeFormat: 'markdown',
          screenshots: [],
          official: false,
          deprecated: false,
          fromCache: true
        }
      }),
      'utf8'
    )

    const res = await fetch(`${host}/skServer/appstore/plugin/${name}`)
    expect(res.status).to.equal(200)
    const body = (await res.json()) as { name?: string; readme?: string }
    expect(body.name).to.equal(name)
    expect(body.readme).to.equal(marker)
  })

  it('rebuilds when the cached detail is for a superseded version', async function () {
    const { name, version } = await anAvailablePlugin()

    // Same marker, but stamped with a version npm is not offering. The
    // version check must reject this entry so a newly published release
    // still reaches the detail page.
    const file = detailFileFor(name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
      file,
      JSON.stringify({
        writtenAt: Date.now(),
        installed: false,
        payload: {
          name,
          version: '0.0.0-stale',
          readme: 'STALE-README-MARKER',
          readmeFormat: 'markdown',
          screenshots: [],
          official: false,
          deprecated: false,
          fromCache: true
        }
      }),
      'utf8'
    )

    const res = await fetch(`${host}/skServer/appstore/plugin/${name}`)
    expect(res.status).to.equal(200)
    const body = (await res.json()) as { version?: string; readme?: string }
    expect(body.version).to.equal(version)
    expect(body.readme).to.not.equal('STALE-README-MARKER')
  })

  it('keeps the appstore list responding across repeated requests', async function () {
    // The list route schedules the background detail refresh and icon
    // probe, both guarded by an in-flight flag and a cooldown. Repeated
    // and concurrent requests must still each get a full response.
    for (let i = 0; i < REPEATED_LIST_REQUEST_COUNT; i++) {
      const res = await fetch(`${host}/skServer/appstore/available`)
      expect(res.status).to.equal(200)
      expect(await res.json()).to.be.an('object')
    }

    const concurrent = await Promise.all(
      Array.from({ length: CONCURRENT_LIST_REQUEST_COUNT }, () =>
        fetch(`${host}/skServer/appstore/available`)
      )
    )
    for (const res of concurrent) {
      expect(res.status).to.equal(200)
      expect(await res.json()).to.be.an('object')
    }
  })

  it('still serves the list after a manual refresh clears the caches', async function () {
    // A refresh clears every cache mid-flight and reopens the probe
    // cooldown, so the next list request has to repopulate from cold.
    const refresh = await fetch(`${host}/skServer/appstore/refresh`, {
      method: 'POST'
    })
    expect(refresh.status).to.equal(200)

    const res = await fetch(`${host}/skServer/appstore/available`)
    expect(res.status).to.equal(200)
    expect(await res.json()).to.be.an('object')
  })
})
