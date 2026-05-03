import { expect } from 'chai'
import { parseResolution } from '../dist/api/history/index.js'

describe('parseResolution', () => {
  it('is exported as a function (sanity check that the build is current)', () => {
    expect(parseResolution).to.be.a('function')
  })

  it('returns undefined for missing values', () => {
    expect(parseResolution(undefined)).to.equal(undefined)
    expect(parseResolution(null)).to.equal(undefined)
    expect(parseResolution('')).to.equal(undefined)
  })

  it('returns undefined for non-string, non-number values', () => {
    // Express may parse `?resolution[]=1m` as an array; preserve the
    // existing tolerant behavior rather than throwing.
    expect(parseResolution(['1m'])).to.equal(undefined)
    expect(parseResolution({})).to.equal(undefined)
  })

  it('passes through numbers as seconds', () => {
    expect(parseResolution(0)).to.equal(0)
    expect(parseResolution(1)).to.equal(1)
    expect(parseResolution(60)).to.equal(60)
  })

  it('parses numeric strings as seconds', () => {
    expect(parseResolution('60')).to.equal(60)
    expect(parseResolution('1000')).to.equal(1000)
  })

  it('parses time expressions to seconds', () => {
    expect(parseResolution('1s')).to.equal(1)
    expect(parseResolution('1m')).to.equal(60)
    expect(parseResolution('1h')).to.equal(3_600)
    expect(parseResolution('1d')).to.equal(86_400)
  })

  it('parses time expressions with multi-digit values', () => {
    expect(parseResolution('15m')).to.equal(900)
    expect(parseResolution('2h')).to.equal(7_200)
    expect(parseResolution('30s')).to.equal(30)
  })

  it('parses zero time expressions', () => {
    expect(parseResolution('0s')).to.equal(0)
  })

  it('trims surrounding whitespace', () => {
    expect(parseResolution('  1s  ')).to.equal(1)
    expect(parseResolution(' 60 ')).to.equal(60)
    // Tabs and newlines are also whitespace per String.prototype.trim.
    expect(parseResolution('\t1m\n')).to.equal(60)
  })

  it('throws for unparseable strings', () => {
    expect(() => parseResolution('abc')).to.throw(/resolution/)
    expect(() => parseResolution('1y')).to.throw(/resolution/)
  })

  it('rejects fractional time expressions', () => {
    // Spec lists only integer time expressions ('1s', '1m', '1h', '1d').
    expect(() => parseResolution('1.5s')).to.throw(/resolution/)
    expect(() => parseResolution('0.5h')).to.throw(/resolution/)
  })

  it('rejects uppercase unit suffixes', () => {
    // Spec only documents lowercase suffixes; pinning case sensitivity
    // here so the contract cannot regress silently.
    expect(() => parseResolution('1S')).to.throw(/resolution/)
    expect(() => parseResolution('1H')).to.throw(/resolution/)
  })
})
