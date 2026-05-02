import { expect } from 'chai'
import {
  parseGithubSlug,
  parseReleasesFeed,
  renderReleasesAsChangelog
} from '../../dist/appstore/github-releases.js'

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:github.com,2008:Repository/1/v0.3.1</id>
    <updated>2026-04-19T18:36:49Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/SignalK/app-dock/releases/tag/v0.3.1"/>
    <title>v0.3.1</title>
    <content type="html">&lt;h2&gt;What&#39;s Changed&lt;/h2&gt;&#10;&lt;ul&gt;&#10;&lt;li&gt;Graceful fallback by &lt;a href=&quot;https://github.com/dirkwa&quot;&gt;@dirkwa&lt;/a&gt;&lt;/li&gt;&#10;&lt;/ul&gt;</content>
  </entry>
  <entry>
    <id>tag:github.com,2008:Repository/1/v0.3.0</id>
    <updated>2026-04-15T00:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/SignalK/app-dock/releases/tag/v0.3.0"/>
    <title>v0.3.0</title>
    <content type="html">&lt;p&gt;initial release&lt;/p&gt;</content>
  </entry>
</feed>`

describe('appstore/github-releases', () => {
  describe('parseGithubSlug', () => {
    it('parses https URL', () => {
      expect(parseGithubSlug('https://github.com/owner/repo')).to.deep.equal({
        owner: 'owner',
        repo: 'repo'
      })
    })
    it('strips .git suffix', () => {
      expect(
        parseGithubSlug('git+https://github.com/owner/repo.git')
      ).to.deep.equal({ owner: 'owner', repo: 'repo' })
    })
    it('parses ssh URL', () => {
      expect(parseGithubSlug('git@github.com:owner/repo.git')).to.deep.equal({
        owner: 'owner',
        repo: 'repo'
      })
    })
    it('returns undefined for non-github URLs', () => {
      expect(parseGithubSlug('https://gitlab.com/owner/repo')).to.equal(
        undefined
      )
    })
    it('returns undefined for empty input', () => {
      expect(parseGithubSlug(undefined)).to.equal(undefined)
      expect(parseGithubSlug('')).to.equal(undefined)
    })
  })

  describe('parseReleasesFeed + renderReleasesAsChangelog', () => {
    it('parses entries and renders markdown with version headings', async () => {
      const entries = await parseReleasesFeed(SAMPLE_FEED)
      expect(entries).to.have.length(2)
      expect(entries[0].tag).to.equal('v0.3.1')
      expect(entries[0].url).to.equal(
        'https://github.com/SignalK/app-dock/releases/tag/v0.3.1'
      )
      expect(entries[0].bodyMarkdown).to.match(/What's Changed/)
      expect(entries[0].bodyMarkdown).to.match(/Graceful fallback/)

      const md = renderReleasesAsChangelog(entries)
      expect(md).to.include('## [v0.3.1]')
      expect(md).to.include('## [v0.3.0]')
      expect(md).to.include('2026-04-19')
    })

    it('handles empty feed', async () => {
      const entries = await parseReleasesFeed('<feed></feed>')
      expect(entries).to.deep.equal([])
      expect(renderReleasesAsChangelog(entries)).to.equal('')
    })

    it('skips entries missing title or link', async () => {
      const feed = '<feed><entry><updated>2026-01-01</updated></entry></feed>'
      const entries = await parseReleasesFeed(feed)
      expect(entries).to.have.length(0)
    })
  })
})
