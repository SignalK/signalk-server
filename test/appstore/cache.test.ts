import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createCache } from '../../dist/appstore/cache.js'
import type { PluginDetailPayload } from '../../dist/appstore/types.js'

const tmpDirs: string[] = []
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appstore-cache-test-'))
  tmpDirs.push(dir)
  return dir
}

function samplePayload(name: string): PluginDetailPayload {
  return {
    name,
    version: '1.0.0',
    screenshots: [],
    official: false,
    deprecated: false,
    readme: '# hi',
    changelog: '',
    readmeFormat: 'markdown',
    changelogFormat: 'synthesized',
    fetchedAt: Date.now(),
    fromCache: false
  }
}

describe('appstore/cache', () => {
  afterEach(() => {
    while (tmpDirs.length > 0) {
      const dir = tmpDirs.pop()
      if (dir) fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes and reads the list snapshot', () => {
    const dir = tmpDir()
    const cache = createCache(dir)
    cache.writeList({ available: [1, 2] })
    const back = cache.readList<{ available: number[] }>()
    expect(back?.payload.available).to.deep.equal([1, 2])
    expect(back?.writtenAt).to.be.a('number')
  })

  it('returns undefined when list cache missing', () => {
    const dir = tmpDir()
    const cache = createCache(dir)
    expect(cache.readList()).to.equal(undefined)
  })

  it('invalidates list cache', () => {
    const dir = tmpDir()
    const cache = createCache(dir)
    cache.writeList({ x: 1 })
    cache.invalidateList()
    expect(cache.readList()).to.equal(undefined)
  })

  it('retains installed plugin detail indefinitely', () => {
    const dir = tmpDir()
    const cache = createCache(dir)
    const payload = samplePayload('signalk-example')
    cache.writePluginDetail(payload, true)
    const file = path.join(
      dir,
      'appstore-cache',
      'plugins',
      'signalk-example',
      'detail.json'
    )
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    raw.writtenAt = Date.now() - 30 * 24 * 3600 * 1000 // 30 days ago
    fs.writeFileSync(file, JSON.stringify(raw), 'utf8')
    const back = cache.readPluginDetail('signalk-example')
    expect(back?.payload.name).to.equal('signalk-example')
  })

  it('expires non-installed plugin detail after TTL', () => {
    const dir = tmpDir()
    const cache = createCache(dir)
    const payload = samplePayload('signalk-other')
    cache.writePluginDetail(payload, false)
    const file = path.join(
      dir,
      'appstore-cache',
      'plugins',
      'signalk-other',
      'detail.json'
    )
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    raw.writtenAt = Date.now() - 10 * 60 * 60 * 1000 // 10 hours ago
    fs.writeFileSync(file, JSON.stringify(raw), 'utf8')
    expect(cache.readPluginDetail('signalk-other')).to.equal(undefined)
  })

  it('safely stores scoped package names', () => {
    const dir = tmpDir()
    const cache = createCache(dir)
    const payload = samplePayload('@signalk/foo')
    cache.writePluginDetail(payload, true)
    expect(cache.readPluginDetail('@signalk/foo')?.payload.name).to.equal(
      '@signalk/foo'
    )
  })

  it('marks cached detail payloads with fromCache=true', () => {
    const dir = tmpDir()
    const cache = createCache(dir)
    const payload = samplePayload('x')
    cache.writePluginDetail(payload, true)
    const back = cache.readPluginDetail('x')
    expect(back?.payload.fromCache).to.equal(true)
  })

  it('invalidates a specific plugin detail', () => {
    const dir = tmpDir()
    const cache = createCache(dir)
    cache.writePluginDetail(samplePayload('x'), true)
    cache.invalidatePluginDetail('x')
    expect(cache.readPluginDetail('x')).to.equal(undefined)
  })
})
