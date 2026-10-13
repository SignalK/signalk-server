import { expect } from 'chai'
import {
  cdnUrlsFor,
  changelogUrlFor,
  isAbsoluteUrl,
  readmeUrlFor,
  resolveScreenshotUrl
} from '../../dist/appstore/cdn'

describe('appstore/cdn', () => {
  describe('resolveScreenshotUrl', () => {
    it('strips leading ./', () => {
      expect(resolveScreenshotUrl('pkg', '1.0.0', './docs/shot.png')).to.equal(
        'https://cdn.jsdelivr.net/npm/pkg@1.0.0/docs/shot.png'
      )
    })

    it('strips leading /', () => {
      expect(resolveScreenshotUrl('pkg', '1.0.0', '/docs/shot.png')).to.equal(
        'https://cdn.jsdelivr.net/npm/pkg@1.0.0/docs/shot.png'
      )
    })

    it('leaves plain relative paths alone', () => {
      expect(resolveScreenshotUrl('pkg', '1.0.0', 'docs/shot.png')).to.equal(
        'https://cdn.jsdelivr.net/npm/pkg@1.0.0/docs/shot.png'
      )
    })

    it('handles scoped package names', () => {
      expect(
        resolveScreenshotUrl('@signalk/example', '2.3.4', './icon.png')
      ).to.equal('https://cdn.jsdelivr.net/npm/@signalk/example@2.3.4/icon.png')
    })

    it('preserves query strings', () => {
      expect(
        resolveScreenshotUrl('pkg', '1.0.0', 'docs/shot.png?v=2')
      ).to.equal('https://cdn.jsdelivr.net/npm/pkg@1.0.0/docs/shot.png?v=2')
    })

    it('folds backslashes to forward slashes before clamping', () => {
      expect(
        resolveScreenshotUrl('pkg', '1.0.0', '..\\..\\etc\\passwd')
      ).to.equal('https://cdn.jsdelivr.net/npm/pkg@1.0.0/etc/passwd')
    })

    it('clamps `..` so the path cannot escape the package root', () => {
      expect(resolveScreenshotUrl('pkg', '1.0.0', '../../etc/passwd')).to.equal(
        'https://cdn.jsdelivr.net/npm/pkg@1.0.0/etc/passwd'
      )
      expect(
        resolveScreenshotUrl('pkg', '1.0.0', 'a/../../b/shot.png')
      ).to.equal('https://cdn.jsdelivr.net/npm/pkg@1.0.0/b/shot.png')
    })
  })

  describe('cdnUrlsFor', () => {
    it('lists jsDelivr first and unpkg as the fallback', () => {
      expect(
        cdnUrlsFor('@signalk/example', '2.3.4', './icon.png')
      ).to.deep.equal([
        'https://cdn.jsdelivr.net/npm/@signalk/example@2.3.4/icon.png',
        'https://unpkg.com/@signalk/example@2.3.4/icon.png'
      ])
    })

    it('clamps the path on every CDN', () => {
      for (const url of cdnUrlsFor('pkg', '1.0.0', '../../etc/passwd')) {
        expect(url).to.match(/\/pkg@1\.0\.0\/etc\/passwd$/)
      }
    })
  })

  describe('readmeUrlFor / changelogUrlFor', () => {
    it('produces the README url on the preferred CDN', () => {
      expect(readmeUrlFor('pkg', '1.0.0')).to.equal(
        'https://cdn.jsdelivr.net/npm/pkg@1.0.0/README.md'
      )
    })

    it('produces the CHANGELOG url on the preferred CDN', () => {
      expect(changelogUrlFor('pkg', '1.0.0')).to.equal(
        'https://cdn.jsdelivr.net/npm/pkg@1.0.0/CHANGELOG.md'
      )
    })
  })

  describe('isAbsoluteUrl', () => {
    it('recognises http(s)', () => {
      expect(isAbsoluteUrl('https://example.com/x.png')).to.equal(true)
      expect(isAbsoluteUrl('http://example.com/x.png')).to.equal(true)
    })

    it('recognises protocol-relative', () => {
      expect(isAbsoluteUrl('//example.com/x.png')).to.equal(true)
    })

    it('recognises data: urls', () => {
      expect(isAbsoluteUrl('data:image/png;base64,AAAA')).to.equal(true)
    })

    it('rejects relative paths', () => {
      expect(isAbsoluteUrl('./x.png')).to.equal(false)
      expect(isAbsoluteUrl('docs/x.png')).to.equal(false)
    })
  })
})
