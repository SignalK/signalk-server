import { expect } from 'chai'
import { enrichEntry } from '../../dist/appstore/enrich.js'

describe('appstore/enrich', () => {
  const basePkg = {
    name: 'signalk-example',
    version: '1.2.3',
    keywords: ['signalk-node-server-plugin']
  }

  it('detects @signalk/* as official', () => {
    const r = enrichEntry({ ...basePkg, name: '@signalk/foo' })
    expect(r.official).to.equal(true)
  })

  it('treats non-signalk-scoped as not official', () => {
    const r = enrichEntry(basePkg)
    expect(r.official).to.equal(false)
  })

  it('detects deprecated via signalk.deprecated flag', () => {
    const r = enrichEntry({ ...basePkg, signalk: { deprecated: true } })
    expect(r.deprecated).to.equal(true)
  })

  it('detects deprecated via signalk-deprecated keyword', () => {
    const r = enrichEntry({
      ...basePkg,
      keywords: ['signalk-node-server-plugin', 'signalk-deprecated']
    })
    expect(r.deprecated).to.equal(true)
  })

  it('not deprecated by default', () => {
    const r = enrichEntry(basePkg)
    expect(r.deprecated).to.equal(false)
  })

  it('caps screenshots at 6', () => {
    const screenshots = Array.from({ length: 10 }, (_, i) => `./s${i}.png`)
    const r = enrichEntry({ ...basePkg, signalk: { screenshots } })
    expect(r.screenshots).to.have.length(6)
  })

  it('skips non-string screenshot entries', () => {
    const r = enrichEntry({
      ...basePkg,
      signalk: {
        // @ts-expect-error — intentionally invalid input to test guard
        screenshots: ['./ok.png', null, 42, './also.png']
      }
    })
    expect(r.screenshots).to.deep.equal([
      'https://unpkg.com/signalk-example@1.2.3/ok.png',
      'https://unpkg.com/signalk-example@1.2.3/also.png'
    ])
  })

  it('returns undefined screenshots when absent', () => {
    const r = enrichEntry(basePkg)
    expect(r.screenshots).to.equal(undefined)
  })

  it('resolves appIcon to CDN URL', () => {
    const r = enrichEntry({ ...basePkg, signalk: { appIcon: './icon.png' } })
    expect(r.appIcon).to.equal(
      'https://unpkg.com/signalk-example@1.2.3/icon.png'
    )
  })

  it('preserves absolute appIcon URL', () => {
    const absolute = 'https://example.com/icon.png'
    const r = enrichEntry({ ...basePkg, signalk: { appIcon: absolute } })
    expect(r.appIcon).to.equal(absolute)
  })

  it('surfaces displayName', () => {
    const r = enrichEntry({
      ...basePkg,
      signalk: { displayName: 'Example Plugin' }
    })
    expect(r.displayName).to.equal('Example Plugin')
  })

  it('derives githubUrl from repository.url', () => {
    const r = enrichEntry({
      ...basePkg,
      repository: { url: 'git+https://github.com/owner/repo.git' }
    })
    expect(r.githubUrl).to.equal('https://github.com/owner/repo')
  })

  it('derives githubUrl from SSH form', () => {
    const r = enrichEntry({
      ...basePkg,
      repository: { url: 'git@github.com:owner/repo.git' }
    })
    expect(r.githubUrl).to.equal('https://github.com/owner/repo')
  })

  it('returns readme and changelog URLs', () => {
    const r = enrichEntry(basePkg)
    expect(r.readmeUrl).to.equal(
      'https://unpkg.com/signalk-example@1.2.3/README.md'
    )
    expect(r.changelogUrl).to.equal(
      'https://unpkg.com/signalk-example@1.2.3/CHANGELOG.md'
    )
  })

  it('does not compute indicators unless requested', () => {
    const r = enrichEntry(basePkg)
    expect(r.indicators).to.equal(undefined)
  })

  it('computes indicators when requested', () => {
    const r = enrichEntry(
      { ...basePkg, description: 'hello' },
      { includeIndicators: true }
    )
    expect(r.indicators).to.exist
    expect(r.indicators?.checks.length).to.be.greaterThan(0)
  })

  it('extracts signalk.requires', () => {
    const r = enrichEntry({
      ...basePkg,
      signalk: { requires: ['signalk-charts-plugin'] }
    })
    expect(r.requires).to.deep.equal(['signalk-charts-plugin'])
  })

  it('extracts signalk.recommends', () => {
    const r = enrichEntry({
      ...basePkg,
      signalk: { recommends: ['@signalk/freeboard-sk'] }
    })
    expect(r.recommends).to.deep.equal(['@signalk/freeboard-sk'])
  })

  it('deduplicates and trims requires entries', () => {
    const r = enrichEntry({
      ...basePkg,
      signalk: {
        requires: ['  a  ', 'a', 'b', '']
      }
    })
    expect(r.requires).to.deep.equal(['a', 'b'])
  })

  it('returns undefined requires/recommends when absent', () => {
    const r = enrichEntry(basePkg)
    expect(r.requires).to.equal(undefined)
    expect(r.recommends).to.equal(undefined)
  })

  it('gracefully degrades when signalk key is malformed', () => {
    const r = enrichEntry({
      ...basePkg,
      signalk: {
        // @ts-expect-error — intentionally invalid shape
        screenshots: 'not-an-array',
        // @ts-expect-error — intentionally invalid shape
        requires: 42,
        displayName: 'Still Works'
      }
    })
    expect(r.displayName).to.equal('Still Works')
    expect(r.screenshots).to.equal(undefined)
    expect(r.requires).to.equal(undefined)
  })
})
