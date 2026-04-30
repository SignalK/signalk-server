import { expect } from 'chai'
import { buildSrcToCanonicalMap } from '../src/deltacache'

// The Signal K sources summary tree is keyed by `[label][src]` with
// optional `n2k.canName`. With useCanName on, the canName is recorded
// once PGN 60928 has been observed; collapseToCanonical() uses that to
// rewrite stale `<label>.<src>` refs to the canonical
// `<label>.<canName>` form.

describe('buildSrcToCanonicalMap', function () {
  it('maps every src that has a known canName', function () {
    const sources = {
      YDEN02: {
        type: 'NMEA2000',
        label: 'YDEN02',
        '226': { n2k: { canName: 'c032820059a81e3f', pgns: {} } },
        '159': { n2k: { canName: 'c0788c00e7e04312', pgns: {} } }
      }
    }
    const map = buildSrcToCanonicalMap(sources)
    expect(map.get('YDEN02.226')).to.equal('YDEN02.c032820059a81e3f')
    expect(map.get('YDEN02.159')).to.equal('YDEN02.c0788c00e7e04312')
    expect(map.size).to.equal(2)
  })

  it('skips entries whose canName has not yet resolved', function () {
    const sources = {
      YDEN02: {
        type: 'NMEA2000',
        '226': { n2k: { canName: 'c032820059a81e3f' } },
        '159': { n2k: {} }
      }
    }
    const map = buildSrcToCanonicalMap(sources)
    expect(map.get('YDEN02.226')).to.equal('YDEN02.c032820059a81e3f')
    expect(map.has('YDEN02.159')).to.equal(false)
  })

  it('returns an empty map when no provider uses canName', function () {
    // useCanName: false — n2k.canName never written
    const sources = {
      can0: {
        type: 'NMEA2000',
        '44': { n2k: { pgns: { '127508': '2026-04-26T19:00:00.000Z' } } }
      }
    }
    expect(buildSrcToCanonicalMap(sources).size).to.equal(0)
  })

  it('tolerates a missing or malformed sources object', function () {
    expect(buildSrcToCanonicalMap(undefined).size).to.equal(0)
    expect(buildSrcToCanonicalMap(null).size).to.equal(0)
    expect(buildSrcToCanonicalMap('nope').size).to.equal(0)
    expect(buildSrcToCanonicalMap({ broken: 'string' }).size).to.equal(0)
  })

  it('ignores schema metadata keys (type, label) at the connection level', function () {
    const sources = {
      YDEN02: {
        type: 'NMEA2000',
        label: 'YDEN02',
        '90': { n2k: { canName: 'c1789101e7e0b32b' } }
      }
    }
    const map = buildSrcToCanonicalMap(sources)
    expect(Array.from(map.keys())).to.deep.equal(['YDEN02.90'])
  })
})
