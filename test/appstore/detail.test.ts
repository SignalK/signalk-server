import { expect } from 'chai'
import { buildPluginDetail } from '../../dist/appstore/detail.js'

// GitHub's releases.atom emits a synthetic entry per git tag even when no
// Release was published; the body is an auto-generated "Release <tag>".
const TAG_ONLY_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>1.4.0</title>
    <updated>2026-01-01T00:00:00Z</updated>
    <link rel="alternate" href="https://github.com/owner/repo/releases/tag/1.4.0"/>
    <content type="html">&lt;p&gt;Release 1.4.0&lt;/p&gt;</content>
  </entry>
</feed>`

const REAL_RELEASE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>v2.0.0</title>
    <updated>2026-01-01T00:00:00Z</updated>
    <link rel="alternate" href="https://github.com/owner/repo/releases/tag/v2.0.0"/>
    <content type="html">&lt;p&gt;Notes from GitHub Releases&lt;/p&gt;</content>
  </entry>
</feed>`

describe('appstore/detail', () => {
  const summaryBase = {
    name: 'signalk-example',
    version: '1.0.0',
    screenshots: [] as string[],
    official: false,
    deprecated: false,
    description: 'x',
    keywords: [],
    npmReadme: '# hi'
  }

  describe('changelog source', () => {
    const realFetch = globalThis.fetch
    // Each test sets which assets "exist"; the stub 404s everything else.
    let changelogBody: string | undefined
    let releasesAtom: string | undefined

    beforeEach(() => {
      changelogBody = undefined
      releasesAtom = undefined
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/CHANGELOG.md')) {
          return changelogBody === undefined
            ? new Response('Not found', { status: 404 })
            : new Response(changelogBody, { status: 200 })
        }
        if (url.includes('releases.atom')) {
          return releasesAtom === undefined
            ? new Response('Not found', { status: 404 })
            : new Response(releasesAtom, { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }) as typeof fetch
    })

    afterEach(() => {
      globalThis.fetch = realFetch
    })

    const withGithub = {
      ...summaryBase,
      githubUrl: 'https://github.com/owner/repo'
    }

    it('ignores tag-only release entries and falls back to CHANGELOG.md', async () => {
      changelogBody = '# Changelog\n## 1.4.0\n- curated entry'
      releasesAtom = TAG_ONLY_ATOM
      const detail = await buildPluginDetail(withGithub)
      expect(detail.changelog).to.contain('curated entry')
      expect(detail.changelog).to.not.contain('Release 1.4.0')
      expect(detail.changelogFormat).to.equal('markdown')
    })

    it('renders nothing when the feed is only tags and no CHANGELOG.md exists', async () => {
      releasesAtom = TAG_ONLY_ATOM
      const detail = await buildPluginDetail(withGithub)
      expect(detail.changelog).to.equal('')
      expect(detail.changelogFormat).to.equal('synthesized')
    })

    it('uses GitHub Releases when the feed has real release notes', async () => {
      releasesAtom = REAL_RELEASE_ATOM
      const detail = await buildPluginDetail(withGithub)
      expect(detail.changelog).to.contain('Notes from GitHub Releases')
      expect(detail.changelogFormat).to.equal('markdown')
    })

    it('keeps GitHub Releases ahead of CHANGELOG.md when both are real', async () => {
      changelogBody = '# Changelog\n## 2.0.0\n- curated entry'
      releasesAtom = REAL_RELEASE_ATOM
      const detail = await buildPluginDetail(withGithub)
      expect(detail.changelog).to.contain('Notes from GitHub Releases')
      expect(detail.changelog).to.not.contain('curated entry')
    })
  })

  it('hydrates required deps against resolver', async () => {
    const detail = await buildPluginDetail(
      { ...summaryBase, requires: ['signalk-charts-plugin', 'missing-pkg'] },
      (name) => {
        if (name === 'signalk-charts-plugin') {
          return {
            displayName: 'Charts',
            appIcon: 'https://x/y.png',
            installed: true
          }
        }
        return undefined
      }
    )
    expect(detail.requires).to.have.length(2)
    expect(detail.requires[0]).to.deep.equal({
      name: 'signalk-charts-plugin',
      displayName: 'Charts',
      appIcon: 'https://x/y.png',
      installed: true
    })
    expect(detail.requires[1]).to.deep.equal({
      name: 'missing-pkg',
      displayName: undefined,
      appIcon: undefined,
      installed: false
    })
  })

  it('hydrates recommends similarly', async () => {
    const detail = await buildPluginDetail(
      { ...summaryBase, recommends: ['r1'] },
      (name) =>
        name === 'r1' ? { displayName: 'R', installed: false } : undefined
    )
    expect(detail.recommends).to.have.length(1)
    expect(detail.recommends[0].installed).to.equal(false)
  })

  it('returns empty arrays when no deps present', async () => {
    const detail = await buildPluginDetail(summaryBase)
    expect(detail.requires).to.deep.equal([])
    expect(detail.recommends).to.deep.equal([])
  })

  it('marks readme from summary as already-fetched', async () => {
    const detail = await buildPluginDetail(summaryBase)
    expect(detail.readme).to.equal('# hi')
    expect(detail.readmeFormat).to.equal('markdown')
  })
})
