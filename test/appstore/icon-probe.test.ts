import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  createIconProbeCache,
  probeIconUrl
} from '../../dist/appstore/icon-probe.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'appstore-iconprobe-'))
}

describe('appstore/icon-probe cache', () => {
  it('returns undefined for unknown entries', () => {
    const cache = createIconProbeCache(tmpDir())
    expect(cache.get('@signalk/foo', '1.0.0', './icon.svg')).to.equal(undefined)
  })

  it('persists resolved URLs across instances', () => {
    const dir = tmpDir()
    const a = createIconProbeCache(dir)
    const url = 'https://unpkg.com/@signalk/foo@1.0.0/public/icon.svg'
    a.set('@signalk/foo', '1.0.0', './icon.svg', url)
    const b = createIconProbeCache(dir)
    expect(b.get('@signalk/foo', '1.0.0', './icon.svg')).to.equal(url)
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
