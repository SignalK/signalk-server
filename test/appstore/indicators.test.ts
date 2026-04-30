import { expect } from 'chai'
import { computeIndicators } from '../../dist/appstore/indicators.js'

describe('appstore/indicators', () => {
  it('produces six checks', () => {
    const r = computeIndicators({})
    expect(r.checks).to.have.length(6)
  })

  it('returns a score between 0 and 100', () => {
    const r = computeIndicators({})
    expect(r.score).to.be.within(0, 100)
  })

  it('never exposes weights on check objects', () => {
    const r = computeIndicators({
      lastReleaseDate: new Date().toISOString(),
      readme: 'x'.repeat(3000)
    })
    for (const c of r.checks) {
      expect(Object.prototype.hasOwnProperty.call(c, 'weight')).to.equal(false)
    }
  })

  it('marks unknown signals with unknown:true and a neutral status', () => {
    const r = computeIndicators({})
    const testsCheck = r.checks.find((c) => c.id === 'tests-pass')
    expect(testsCheck?.unknown).to.equal(true)
    expect(testsCheck?.subtitle).to.match(/unable to determine/i)
  })

  it('does not boost the score with unknown checks', () => {
    // With no inputs every check that depends on a signal is unknown
    // and excluded; only the always-evaluable visual-assets check
    // contributes. That single warn is half-weight, so the score
    // reflects "we know one check, half-passed" rather than "we know
    // everything, all passed".
    const r = computeIndicators({})
    expect(r.score).to.equal(50)
  })

  it('passes tests-pass when testsPass=true', () => {
    const r = computeIndicators({ testsPass: true })
    const c = r.checks.find((x) => x.id === 'tests-pass')
    expect(c?.status).to.equal('ok')
    expect(c?.subtitle).to.match(/passes/i)
  })

  it('fails tests-pass when testsPass=false', () => {
    const r = computeIndicators({ testsPass: false })
    const c = r.checks.find((x) => x.id === 'tests-pass')
    expect(c?.status).to.equal('fail')
  })

  it('flags stale maintenance', () => {
    const old = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString()
    const r = computeIndicators({ lastReleaseDate: old })
    const c = r.checks.find((x) => x.id === 'actively-maintained')
    expect(c?.status).to.equal('fail')
  })

  it('warns on mid-range maintenance', () => {
    const mid = new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString()
    const r = computeIndicators({ lastReleaseDate: mid })
    const c = r.checks.find((x) => x.id === 'actively-maintained')
    expect(c?.status).to.equal('warn')
  })

  it('scores README length into documentation check', () => {
    const r = computeIndicators({ readme: 'x'.repeat(3000) })
    const c = r.checks.find((x) => x.id === 'documentation')
    expect(c?.status).to.equal('ok')
  })

  it('warns on short README', () => {
    const r = computeIndicators({ readme: 'x'.repeat(600) })
    const c = r.checks.find((x) => x.id === 'documentation')
    expect(c?.status).to.equal('warn')
  })

  it('grants visual-assets when icon or screenshots present', () => {
    const r = computeIndicators({ hasAppIcon: true })
    const c = r.checks.find((x) => x.id === 'visual-assets')
    expect(c?.status).to.equal('ok')
  })

  it('warns visual-assets when neither icon nor screenshots', () => {
    const r = computeIndicators({ hasAppIcon: false, hasScreenshots: false })
    const c = r.checks.find((x) => x.id === 'visual-assets')
    expect(c?.status).to.equal('warn')
  })

  it('skips GitHub-dependent checks cleanly when no repo', () => {
    const r = computeIndicators({ hasRepository: false })
    const c = r.checks.find((x) => x.id === 'no-critical-issues')
    expect(c?.subtitle).to.match(/unable to determine/i)
  })

  it('returns raw metrics unchanged', () => {
    const r = computeIndicators({
      stars: 100,
      downloadsPerWeek: 2000,
      openIssues: 3,
      contributors: 5
    })
    expect(r.rawMetrics.stars).to.equal(100)
    expect(r.rawMetrics.downloadsPerWeek).to.equal(2000)
  })
})
