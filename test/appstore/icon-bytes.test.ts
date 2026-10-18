import { expect } from 'chai'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { createIconBytesCache } from '../../dist/appstore/icon-bytes.js'
import { redirectTo, withFetch } from './fetch-stub'

const tmpDirs: string[] = []
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appstore-iconbytes-'))
  tmpDirs.push(dir)
  return dir
}

function writeIcon(root: string, filename: string) {
  fs.mkdirSync(path.join(root, 'icon-bytes'), { recursive: true })
  fs.writeFileSync(path.join(root, 'icon-bytes', filename), 'x')
}

describe('appstore/icon-bytes cache', () => {
  afterEach(() => {
    while (tmpDirs.length > 0) {
      const dir = tmpDirs.pop()
      if (dir) fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns undefined when nothing is stored', () => {
    expect(createIconBytesCache(tmpDir()).read('signalk-foo')).to.equal(
      undefined
    )
  })

  it('reports the version the stored icon was downloaded for', () => {
    const dir = tmpDir()
    writeIcon(dir, 'signalk-foo@0.10.1.svg')
    const stored = createIconBytesCache(dir).read('signalk-foo')
    expect(stored?.version).to.equal('0.10.1')
    expect(stored?.contentType).to.equal('image/svg+xml')
  })

  it('reports the version for scoped packages', () => {
    const dir = tmpDir()
    writeIcon(dir, '@scope__signalk-foo@1.2.3.png')
    const stored = createIconBytesCache(dir).read('@scope/signalk-foo')
    expect(stored?.version).to.equal('1.2.3')
  })

  it('reports a prerelease version containing dots and dashes', () => {
    const dir = tmpDir()
    writeIcon(dir, 'signalk-foo@1.0.0-beta.2.svg')
    expect(createIconBytesCache(dir).read('signalk-foo')?.version).to.equal(
      '1.0.0-beta.2'
    )
  })

  it('does not match a different package sharing a name prefix', () => {
    const dir = tmpDir()
    writeIcon(dir, 'signalk-foo-extra@1.0.0.svg')
    expect(createIconBytesCache(dir).read('signalk-foo')).to.equal(undefined)
  })

  describe('download', () => {
    const svgFor = (url: string) =>
      new Response(`<svg id="${url}" />`, {
        headers: { 'content-type': 'image/svg+xml' }
      })

    it('replaces the previous version rather than accumulating icons', async () => {
      const dir = tmpDir()
      const cache = createIconBytesCache(dir)

      await withFetch(svgFor, async () => {
        await cache.download(
          'signalk-foo',
          '1.0.0',
          'https://unpkg.com/signalk-foo@1.0.0/icon.svg'
        )
        expect(cache.read('signalk-foo')?.version).to.equal('1.0.0')

        await cache.download(
          'signalk-foo',
          '2.0.0',
          'https://unpkg.com/signalk-foo@2.0.0/icon.svg'
        )
      })
      const stored = cache.read('signalk-foo')
      expect(stored?.version).to.equal('2.0.0')
      expect(fs.readFileSync(stored!.path, 'utf8')).to.contain(
        'signalk-foo@2.0.0'
      )
      expect(fs.readdirSync(path.join(dir, 'icon-bytes'))).to.deep.equal([
        'signalk-foo@2.0.0.svg'
      ])
    })

    describe('with an image server off the CDN', () => {
      let server: http.Server
      let origin: string
      let hits: string[]

      beforeEach(async () => {
        hits = []
        server = http.createServer((req, res) => {
          hits.push(req.url ?? '')
          res.writeHead(200, { 'content-type': 'image/png' })
          res.end('internal')
        })
        await new Promise<void>((resolve) =>
          server.listen(0, '127.0.0.1', resolve)
        )
        const addr = server.address() as { port: number }
        origin = `http://127.0.0.1:${addr.port}`
      })

      afterEach(async () => {
        await new Promise((resolve) => server.close(resolve))
      })

      it('does not request it', async () => {
        const cache = createIconBytesCache(tmpDir())

        const stored = await cache.download(
          'evil-plugin',
          '1.0.0',
          `${origin}/latest/meta-data/iam`
        )

        expect(stored).to.equal(null)
        expect(hits).to.deep.equal([])
        expect(cache.read('evil-plugin')).to.equal(undefined)
      })

      it('does not follow a CDN redirect to it', async () => {
        const cache = createIconBytesCache(tmpDir())
        const realFetch = globalThis.fetch
        const target = `${origin}/secret.png`

        // A stubbed fetch has no built-in redirect handling, so stand in for
        // it: only a caller that asked for manual redirects sees the 302.
        const cdnRedirectingToTarget = (url: string, init?: RequestInit) => {
          if (!url.startsWith('https://unpkg.com/')) return realFetch(url, init)
          return init?.redirect === 'manual'
            ? redirectTo(target)
            : realFetch(target, init)
        }

        await withFetch(cdnRedirectingToTarget, async () => {
          const stored = await cache.download(
            'evil-plugin',
            '1.0.0',
            'https://unpkg.com/evil-plugin@1.0.0/icon.png'
          )
          expect(stored).to.equal(null)
        })
        expect(hits).to.deep.equal([])
        expect(cache.read('evil-plugin')).to.equal(undefined)
      })
    })
  })
})
