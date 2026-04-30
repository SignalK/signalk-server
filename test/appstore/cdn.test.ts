import { expect } from 'chai'
import {
  changelogUrlFor,
  isAbsoluteUrl,
  readmeUrlFor,
  resolveScreenshotUrl,
  resolveScreenshotUrlJsdelivr
} from '../../dist/appstore/cdn'

describe('appstore/cdn', () => {
  describe('resolveScreenshotUrl', () => {
    it('strips leading ./', () => {
      expect(resolveScreenshotUrl('pkg', '1.0.0', './docs/shot.png')).to.equal(
        'https://unpkg.com/pkg@1.0.0/docs/shot.png'
      )
    })

    it('strips leading /', () => {
      expect(resolveScreenshotUrl('pkg', '1.0.0', '/docs/shot.png')).to.equal(
        'https://unpkg.com/pkg@1.0.0/docs/shot.png'
      )
    })

    it('leaves plain relative paths alone', () => {
      expect(resolveScreenshotUrl('pkg', '1.0.0', 'docs/shot.png')).to.equal(
        'https://unpkg.com/pkg@1.0.0/docs/shot.png'
      )
    })

    it('handles scoped package names', () => {
      expect(
        resolveScreenshotUrl('@signalk/example', '2.3.4', './icon.png')
      ).to.equal('https://unpkg.com/@signalk/example@2.3.4/icon.png')
    })

    it('preserves query strings', () => {
      expect(
        resolveScreenshotUrl('pkg', '1.0.0', 'docs/shot.png?v=2')
      ).to.equal('https://unpkg.com/pkg@1.0.0/docs/shot.png?v=2')
    })

    it('jsdelivr fallback uses npm CDN', () => {
      expect(
        resolveScreenshotUrlJsdelivr('pkg', '1.0.0', './icon.png')
      ).to.equal('https://cdn.jsdelivr.net/npm/pkg@1.0.0/icon.png')
    })
  })

  describe('readmeUrlFor / changelogUrlFor', () => {
    it('produces unpkg README url', () => {
      expect(readmeUrlFor('pkg', '1.0.0')).to.equal(
        'https://unpkg.com/pkg@1.0.0/README.md'
      )
    })

    it('produces unpkg CHANGELOG url', () => {
      expect(changelogUrlFor('pkg', '1.0.0')).to.equal(
        'https://unpkg.com/pkg@1.0.0/CHANGELOG.md'
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
