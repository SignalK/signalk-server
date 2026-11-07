import { expect } from 'chai'
import {
  cdnUrlsFor,
  changelogUrlFor,
  fetchFromCdn,
  isAbsoluteUrl,
  isCdnUrl,
  readmeUrlFor,
  resolveScreenshotUrl
} from '../../dist/appstore/cdn'
import { redirectTo, withFetch } from './fetch-stub'

async function expectRejection(promise: Promise<unknown>): Promise<void> {
  try {
    await promise
  } catch {
    return
  }
  expect.fail('expected the promise to reject')
}

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

  describe('isCdnUrl', () => {
    it('accepts https URLs on the package CDNs', () => {
      for (const url of [
        'https://cdn.jsdelivr.net/npm/x@1.0.0/icon.png',
        'https://cdn.jsdelivr.net/npm/@scope/x@1.0.0/public/icon.svg',
        'https://unpkg.com/x@1.0.0/icon.png',
        'https://unpkg.com/@scope/x@1.0.0/public/icon.svg',
        'https://UNPKG.com/x@1.0.0/icon.png'
      ]) {
        expect(isCdnUrl(url), url).to.equal(true)
      }
    })

    it('rejects any other host, scheme, port or credentials', () => {
      for (const url of [
        'http://unpkg.com/x@1.0.0/icon.png',
        'http://cdn.jsdelivr.net/npm/x@1.0.0/icon.png',
        'https://jsdelivr.net/npm/x@1.0.0/icon.png',
        'https://cdn.jsdelivr.net.evil.example/npm/x.png',
        'https://unpkg.com.evil.example/x.png',
        'https://unpkg.com./x.png',
        'https://unpkg.com:8443/x.png',
        'https://unpkg.com@127.0.0.1/x.png',
        'https://user@unpkg.com/x.png',
        'http://127.0.0.1:3000/x.png',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::ffff:169.254.169.254]/latest/meta-data/',
        '//unpkg.com/x.png',
        'data:image/svg+xml,<svg/>',
        'file:///etc/passwd',
        './icon.png',
        ''
      ]) {
        expect(isCdnUrl(url), url).to.equal(false)
      }
    })
  })

  describe('fetchFromCdn', () => {
    const icon = 'https://unpkg.com/x@1.0.0/icon.png'
    const moved = 'https://unpkg.com/x@1.0.0/public/icon.png'

    it('refuses a non-CDN URL without requesting it', async () => {
      await withFetch(
        () => new Response('internal'),
        async (calls) => {
          await expectRejection(fetchFromCdn('http://127.0.0.1/icon.png'))
          expect(calls).to.deep.equal([])
        }
      )
    })

    it('follows a redirect that stays on the CDN', async () => {
      await withFetch(
        (url) =>
          url === icon
            ? redirectTo('/x@1.0.0/public/icon.png')
            : new Response('png'),
        async (calls) => {
          const res = await fetchFromCdn(icon)
          expect(await res.text()).to.equal('png')
          expect(calls.map((c) => c.url)).to.deep.equal([icon, moved])
        }
      )
    })

    it('refuses a redirect off the CDN without requesting its target', async () => {
      await withFetch(
        (url) =>
          url === icon
            ? redirectTo('http://127.0.0.1/secret.png')
            : new Response('secret'),
        async (calls) => {
          await expectRejection(fetchFromCdn(icon))
          expect(calls.map((c) => c.url)).to.deep.equal([icon])
        }
      )
    })

    it('gives up on a redirect loop', async () => {
      await withFetch(
        (url) => redirectTo(url),
        async (calls) => {
          await expectRejection(fetchFromCdn(icon))
          expect(calls.length).to.be.below(10)
        }
      )
    })

    it("applies the caller's method and signal to every hop", async () => {
      const { signal } = new AbortController()
      await withFetch(
        (url) =>
          url === icon
            ? redirectTo('/x@1.0.0/public/icon.png')
            : new Response(null),
        async (calls) => {
          await fetchFromCdn(icon, { method: 'HEAD', signal })
          expect(calls).to.have.length(2)
          for (const { init } of calls) {
            expect(init?.method).to.equal('HEAD')
            expect(init?.signal).to.equal(signal)
          }
        }
      )
    })
  })
})
