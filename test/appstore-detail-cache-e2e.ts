import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import { safeName } from '../src/appstore/safe-name'
import { serverTestConfigDirectory } from './servertestutilities'
import { startServer } from './ts-servertestutilities'

// Drives the real /skServer/appstore routes against a running server to
// cover the detail cache end to end: a repeat detail request is served
// from cache, and a cached entry for a superseded version is not.
// Each case drives live npm search plus a detail rebuild, so the default
// mocha timeout is not enough.
const APPSTORE_E2E_TIMEOUT_MS = 60000

describe('appstore detail cache', function () {
  this.timeout(APPSTORE_E2E_TIMEOUT_MS)

  let stop: (() => Promise<unknown>) | undefined
  let host: string

  before(async function () {
    const s = await startServer()
    stop = s.stop
    host = s.host
  })

  after(async function () {
    if (stop) await stop()
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

  // Picks a plugin the live npm search actually returns, so the request
  // reaches the branch where a match exists rather than the not-found
  // fallback.
  async function anAvailablePlugin(
    ctx: Mocha.Context
  ): Promise<{ name: string; version: string }> {
    const res = await fetch(`${host}/skServer/appstore/available`)
    expect(res.status).to.equal(200)
    const body = (await res.json()) as {
      available?: Array<{ name: string; version: string }>
    }
    const candidate = (body.available || []).find((p) => p.name && p.version)
    // No npm reachability in this environment: nothing to assert about a
    // cache short-circuit that never gets a match to short-circuit on.
    if (!candidate) ctx.skip()
    return candidate as { name: string; version: string }
  }

  it('serves a matched plugin from cache instead of rebuilding it', async function () {
    const { name, version } = await anAvailablePlugin(this)

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
    const { name, version } = await anAvailablePlugin(this)

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
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${host}/skServer/appstore/available`)
      expect(res.status).to.equal(200)
      expect(await res.json()).to.be.an('object')
    }

    const concurrent = await Promise.all(
      [0, 1, 2, 3].map(() => fetch(`${host}/skServer/appstore/available`))
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
