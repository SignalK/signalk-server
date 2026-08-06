import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  createIconProbeCache,
  probeIconUrl
} from '../../dist/appstore/icon-probe.js'

// Mirrors PERSIST_DEBOUNCE_MS in src/appstore/icon-probe.ts. Kept as a
// local constant rather than exporting an internal purely for tests.
const PERSIST_DEBOUNCE_MS = 1_000

const tmpDirs: string[] = []
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appstore-iconprobe-'))
  tmpDirs.push(dir)
  return dir
}

describe('appstore/icon-probe cache', () => {
  afterEach(() => {
    while (tmpDirs.length > 0) {
      const dir = tmpDirs.pop()
      if (dir) fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns undefined for unknown entries', () => {
    const cache = createIconProbeCache(tmpDir())
    expect(cache.get('@signalk/foo', '1.0.0', './icon.svg')).to.equal(undefined)
  })

  it('persists resolved URLs across instances', () => {
    const dir = tmpDir()
    const a = createIconProbeCache(dir)
    const url = 'https://unpkg.com/@signalk/foo@1.0.0/public/icon.svg'
    a.set('@signalk/foo', '1.0.0', './icon.svg', url)
    a.flush()
    const b = createIconProbeCache(dir)
    expect(b.get('@signalk/foo', '1.0.0', './icon.svg')).to.equal(url)
  })

  it('coalesces writes instead of serializing on every set()', () => {
    const dir = tmpDir()
    const cache = createIconProbeCache(dir)
    const file = path.join(dir, 'iconUrls.json')
    for (let i = 0; i < 50; i++) {
      cache.set('pkg', '1.0.0', `./icon-${i}.svg`, `url-${i}`)
    }
    expect(fs.existsSync(file)).to.equal(false)
    cache.flush()
    const written = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(Object.keys(written)).to.have.lengthOf(50)
  })

  // Every other persistence case forces the write with flush(), which
  // bypasses the timer entirely — a broken debounce callback would still
  // pass those. This one waits the interval out instead.
  it('persists on the debounce timer without an explicit flush()', async function () {
    this.timeout(PERSIST_DEBOUNCE_MS * 4)
    const dir = tmpDir()
    const cache = createIconProbeCache(dir)
    const file = path.join(dir, 'iconUrls.json')
    cache.set('pkg', '1.0.0', './icon.svg', 'url')
    expect(fs.existsSync(file)).to.equal(false)
    await new Promise((resolve) => setTimeout(resolve, PERSIST_DEBOUNCE_MS * 2))
    expect(fs.existsSync(file)).to.equal(true)
    const written = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(Object.keys(written)).to.have.lengthOf(1)
  })

  it('flush() is a no-op when nothing is pending', () => {
    const dir = tmpDir()
    const cache = createIconProbeCache(dir)
    cache.set('pkg', '1.0.0', './icon.svg', 'url')
    cache.flush()
    const first = fs.statSync(path.join(dir, 'iconUrls.json')).mtimeMs
    cache.flush()
    expect(fs.statSync(path.join(dir, 'iconUrls.json')).mtimeMs).to.equal(first)
  })

  it('invalidate() drops a pending write instead of resurrecting entries', () => {
    const dir = tmpDir()
    const cache = createIconProbeCache(dir)
    cache.set('pkg', '1.0.0', './icon.svg', 'url')
    cache.invalidate()
    cache.flush()
    expect(fs.existsSync(path.join(dir, 'iconUrls.json'))).to.equal(false)
    expect(cache.get('pkg', '1.0.0', './icon.svg')).to.equal(undefined)
  })

  it('distinguishes null from undefined (null = probed, 404)', () => {
    const cache = createIconProbeCache(tmpDir())
    cache.set('@signalk/foo', '1.0.0', './icon.svg', null)
    const result = cache.get('@signalk/foo', '1.0.0', './icon.svg')
    expect(result).to.equal(null)
    expect(result).not.to.equal(undefined)
  })

  it('keys by package + version + declared path independently', () => {
    const cache = createIconProbeCache(tmpDir())
    cache.set('a', '1.0.0', './x', 'url-a')
    cache.set('a', '2.0.0', './x', 'url-b')
    cache.set('b', '1.0.0', './x', 'url-c')
    cache.set('a', '1.0.0', './y', 'url-d')
    expect(cache.get('a', '1.0.0', './x')).to.equal('url-a')
    expect(cache.get('a', '2.0.0', './x')).to.equal('url-b')
    expect(cache.get('b', '1.0.0', './x')).to.equal('url-c')
    expect(cache.get('a', '1.0.0', './y')).to.equal('url-d')
  })

  it('invalidate() clears memo and disk file', () => {
    const dir = tmpDir()
    const cache = createIconProbeCache(dir)
    cache.set('a', '1.0.0', './x', 'url')
    cache.invalidate()
    expect(cache.get('a', '1.0.0', './x')).to.equal(undefined)
    const other = createIconProbeCache(dir)
    expect(other.get('a', '1.0.0', './x')).to.equal(undefined)
  })
})

type FetchLike = (
  input: string | URL,
  init?: { method?: string }
) => Promise<Response>

function withStubbedFetch(
  handler: (url: string) => { ok: boolean; status?: number },
  fn: () => Promise<void>
): Promise<void> {
  const original = globalThis.fetch
  const stub: FetchLike = async (input) => {
    const url = typeof input === 'string' ? input : input.toString()
    const r = handler(url)
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 404)
    } as Response
  }
  ;(globalThis as unknown as { fetch: FetchLike }).fetch = stub
  return fn().finally(() => {
    ;(globalThis as unknown as { fetch: typeof original }).fetch = original
  })
}

describe('appstore/icon-probe probeIconUrl', () => {
  it('returns the declared URL when it HEADs 200', async () => {
    const cache = createIconProbeCache(tmpDir())
    await withStubbedFetch(
      () => ({ ok: true }),
      async () => {
        const r = await probeIconUrl('@signalk/x', '1.0.0', './icon.svg', cache)
        expect(r).to.equal('https://unpkg.com/@signalk/x@1.0.0/icon.svg')
      }
    )
  })

  it('preserves subpath under ./public/ when declared path 404s (freeboard-sk case)', async () => {
    const cache = createIconProbeCache(tmpDir())
    const target =
      'https://unpkg.com/@signalk/freeboard-sk@2.21.0/public/assets/icons/icon-72x72.png'
    await withStubbedFetch(
      (url) => ({ ok: url === target }),
      async () => {
        const r = await probeIconUrl(
          '@signalk/freeboard-sk',
          '2.21.0',
          './assets/icons/icon-72x72.png',
          cache
        )
        expect(r).to.equal(target)
      }
    )
  })

  it('falls back to basename under ./public/ for flat layouts (app-dock case)', async () => {
    const cache = createIconProbeCache(tmpDir())
    const target =
      'https://unpkg.com/@signalk/app-dock@1.0.0/public/app-icon.svg'
    await withStubbedFetch(
      (url) => ({ ok: url === target }),
      async () => {
        const r = await probeIconUrl(
          '@signalk/app-dock',
          '1.0.0',
          './app-icon.svg',
          cache
        )
        expect(r).to.equal(target)
      }
    )
  })

  it('returns null when no candidate works and caches the negative', async () => {
    const cache = createIconProbeCache(tmpDir())
    await withStubbedFetch(
      () => ({ ok: false, status: 404 }),
      async () => {
        const r = await probeIconUrl(
          '@signalk/missing',
          '1.0.0',
          './icon.svg',
          cache
        )
        expect(r).to.equal(null)
        expect(cache.get('@signalk/missing', '1.0.0', './icon.svg')).to.equal(
          null
        )
      }
    )
  })

  it('skips probe and returns absolute URL untouched', async () => {
    const cache = createIconProbeCache(tmpDir())
    let called = false
    await withStubbedFetch(
      () => {
        called = true
        return { ok: true }
      },
      async () => {
        const r = await probeIconUrl(
          'x',
          '1',
          'https://example.com/icon.svg',
          cache
        )
        expect(r).to.equal('https://example.com/icon.svg')
        expect(called).to.equal(false)
      }
    )
  })
})
