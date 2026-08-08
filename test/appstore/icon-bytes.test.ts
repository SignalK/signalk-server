import { expect } from 'chai'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { createIconBytesCache } from '../../dist/appstore/icon-bytes.js'

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
    let server: http.Server
    let origin: string

    beforeEach(async () => {
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'image/svg+xml' })
        res.end(`<svg id="${req.url}" />`)
      })
      await new Promise<void>((resolve) => server.listen(0, resolve))
      const addr = server.address() as { port: number }
      origin = `http://127.0.0.1:${addr.port}`
    })

    afterEach(async () => {
      await new Promise((resolve) => server.close(resolve))
    })

    it('replaces the previous version rather than accumulating icons', async () => {
      const dir = tmpDir()
      const cache = createIconBytesCache(dir)

      await cache.download('signalk-foo', '1.0.0', `${origin}/v1.svg`)
      expect(cache.read('signalk-foo')?.version).to.equal('1.0.0')

      await cache.download('signalk-foo', '2.0.0', `${origin}/v2.svg`)
      const stored = cache.read('signalk-foo')
      expect(stored?.version).to.equal('2.0.0')
      expect(fs.readFileSync(stored!.path, 'utf8')).to.contain('/v2.svg')
      expect(fs.readdirSync(path.join(dir, 'icon-bytes'))).to.deep.equal([
        'signalk-foo@2.0.0.svg'
      ])
    })
  })
})
