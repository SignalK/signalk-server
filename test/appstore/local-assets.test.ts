import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  buildLocalAssetUrl,
  buildLocalAssetUrls,
  getInstalledServedRoot,
  packageNameIs
} from '../../dist/appstore/local-assets'

// buildLocalAssetUrl stats the filesystem when a served root is known,
// so the existence-dependent cases need real files on disk.
let tmpRoot: string

function makeFile(relative: string): void {
  const full = path.join(tmpRoot, relative)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, 'x')
}

describe('appstore/local-assets', () => {
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-local-assets-'))
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  describe('buildLocalAssetUrl', () => {
    it('builds a URL under the package mount', () => {
      expect(buildLocalAssetUrl('pkg', 'icon.png', undefined)).to.equal(
        '/pkg/icon.png'
      )
    })

    it('strips a leading ./', () => {
      expect(buildLocalAssetUrl('pkg', './docs/icon.png', undefined)).to.equal(
        '/pkg/docs/icon.png'
      )
    })

    it('passes absolute http(s) URLs through untouched', () => {
      expect(
        buildLocalAssetUrl('pkg', 'https://example.com/i.png', undefined)
      ).to.equal('https://example.com/i.png')
      expect(
        buildLocalAssetUrl('pkg', '//example.com/i.png', undefined)
      ).to.equal('//example.com/i.png')
    })

    it('passes data: URLs through untouched', () => {
      expect(
        buildLocalAssetUrl('pkg', 'data:image/png;base64,AAAA', undefined)
      ).to.equal('data:image/png;base64,AAAA')
      expect(
        buildLocalAssetUrl('pkg', 'DATA:image/png;base64,AAAA', undefined)
      ).to.equal('DATA:image/png;base64,AAAA')
    })

    it('returns undefined for empty or non-string paths', () => {
      expect(buildLocalAssetUrl('pkg', '', undefined)).to.be.undefined
      expect(buildLocalAssetUrl('pkg', undefined, undefined)).to.be.undefined
      expect(buildLocalAssetUrl('pkg', 42, undefined)).to.be.undefined
    })

    // A hostile or buggy plugin controls declaredPath via its own
    // package.json, so escaping the mount must not be possible.
    it('rejects a server-absolute path', () => {
      expect(buildLocalAssetUrl('pkg', '/admin', undefined)).to.be.undefined
    })

    it('rejects parent-directory traversal', () => {
      expect(buildLocalAssetUrl('pkg', '../foo.png', undefined)).to.be.undefined
      expect(buildLocalAssetUrl('pkg', './../foo.png', undefined)).to.be
        .undefined
      expect(buildLocalAssetUrl('pkg', 'a/../../foo.png', undefined)).to.be
        .undefined
    })

    it('allows ".." inside a path segment name', () => {
      expect(buildLocalAssetUrl('pkg', 'a..b/icon.png', undefined)).to.equal(
        '/pkg/a..b/icon.png'
      )
    })

    it('drops paths whose target is missing under the served root', () => {
      expect(buildLocalAssetUrl('pkg', 'missing.png', tmpRoot)).to.be.undefined
    })

    it('keeps paths whose target exists under the served root', () => {
      makeFile('icon.png')
      expect(buildLocalAssetUrl('pkg', 'icon.png', tmpRoot)).to.equal(
        '/pkg/icon.png'
      )
    })
  })

  describe('getInstalledServedRoot', () => {
    it('returns undefined without a package location', () => {
      expect(getInstalledServedRoot('pkg', undefined)).to.be.undefined
    })

    it('prefers public/ when it exists', () => {
      makeFile('pkg/public/index.html')
      expect(getInstalledServedRoot('pkg', tmpRoot)).to.equal(
        path.join(tmpRoot, 'pkg', 'public')
      )
    })

    it('falls back to the package root without public/', () => {
      makeFile('pkg/index.html')
      expect(getInstalledServedRoot('pkg', tmpRoot)).to.equal(
        path.join(tmpRoot, 'pkg')
      )
    })

    // The webapps mount tests `<pkg>/public/`, which a regular file named
    // public fails, so the served root stays at the package root.
    it('ignores a regular file named public', () => {
      makeFile('pkg/public')
      expect(getInstalledServedRoot('pkg', tmpRoot)).to.equal(
        path.join(tmpRoot, 'pkg')
      )
    })
  })

  describe('buildLocalAssetUrls', () => {
    it('returns undefined when the package declares no signalk block', () => {
      expect(buildLocalAssetUrls('pkg', {}, undefined)).to.be.undefined
      expect(buildLocalAssetUrls('pkg', undefined, undefined)).to.be.undefined
    })

    it('returns undefined when nothing usable is declared', () => {
      expect(buildLocalAssetUrls('pkg', { signalk: {} }, undefined)).to.be
        .undefined
    })

    it('builds the appIcon URL', () => {
      const result = buildLocalAssetUrls(
        'pkg',
        { signalk: { appIcon: './icon.png' } },
        undefined
      )
      expect(result?.appIcon).to.equal('/pkg/icon.png')
    })

    it('builds screenshot URLs and drops unusable entries', () => {
      const result = buildLocalAssetUrls(
        'pkg',
        { signalk: { screenshots: ['a.png', '../escape.png', '', 7] } },
        undefined
      )
      expect(result?.screenshots).to.deep.equal(['/pkg/a.png'])
    })

    it('resolves against the installed public/ directory', () => {
      makeFile('pkg/public/icon.png')
      const result = buildLocalAssetUrls(
        'pkg',
        { signalk: { appIcon: 'icon.png', screenshots: ['nope.png'] } },
        tmpRoot
      )
      expect(result?.appIcon).to.equal('/pkg/icon.png')
      expect(result?.screenshots).to.deep.equal([])
    })
  })

  describe('packageNameIs', () => {
    it('matches by package name', () => {
      const entries = [{ package: { name: 'a' } }, { package: { name: 'b' } }]
      expect(entries.find(packageNameIs('b'))).to.equal(entries[1])
      expect(entries.find(packageNameIs('missing'))).to.be.undefined
    })
  })
})
