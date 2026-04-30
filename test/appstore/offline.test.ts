import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createCache } from '../../dist/appstore/cache.js'
import { buildOfflineResponse } from '../../dist/appstore/offline.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'appstore-offline-test-'))
}

describe('appstore/offline', () => {
  it('returns cached list when available and marks storeAvailable=false', () => {
    const dir = tmpDir()
    const cache = createCache(dir)
    cache.writeList({ available: [{ name: 'pkg' }], installed: [] })
    const app = { plugins: [] }
    const r = buildOfflineResponse(app, cache)
    expect(r.storeAvailable).to.equal(false)
    expect(r.fromCache).to.equal(true)
    expect(r.available).to.deep.equal([{ name: 'pkg' }])
  })

  it('builds a minimal response from local plugins when no cache exists', () => {
    const dir = tmpDir()
    const cache = createCache(dir)
    const app = {
      plugins: [
        { packageName: 'signalk-x', version: '1.0.0', id: 'x' },
        { packageName: 'signalk-y', version: '2.0.0', id: 'y' }
      ],
      webapps: [{ name: 'signalk-web', version: '3.0.0' }]
    }
    const r = buildOfflineResponse(app, cache) as Record<string, unknown>
    expect(r.storeAvailable).to.equal(false)
    expect(r.fromCache).to.equal(false)
    const installed = r.installed as Array<{ name: string; isPlugin: boolean }>
    expect(installed).to.have.length(3)
    expect(installed.find((i) => i.name === 'signalk-x')?.isPlugin).to.equal(
      true
    )
    expect(installed.find((i) => i.name === 'signalk-web')?.isPlugin).to.equal(
      false
    )
  })

  it('deduplicates across plugins/webapps/addons', () => {
    const dir = tmpDir()
    const cache = createCache(dir)
    const app = {
      plugins: [{ packageName: 'same', version: '1.0.0' }],
      addons: [{ name: 'same', version: '1.0.0' }]
    }
    const r = buildOfflineResponse(app, cache) as Record<string, unknown>
    expect((r.installed as unknown[]).length).to.equal(1)
  })

  it('skips entries with no name', () => {
    const dir = tmpDir()
    const cache = createCache(dir)
    const app = {
      plugins: [{ version: '1.0.0' }]
    }
    const r = buildOfflineResponse(app, cache) as Record<string, unknown>
    expect((r.installed as unknown[]).length).to.equal(0)
  })
})
