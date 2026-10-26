import { expect } from 'chai'
import {
  canboatjsSupportsExcludePgns,
  excludePgnsFromFilters
} from './n2k-exclude-pgns'

describe('excludePgnsFromFilters', () => {
  const filters = [
    { source: '', pgn: '127251' },
    { source: '35', pgn: '127250' },
    { source: '12', pgn: '' },
    { pgn: '129029' },
    { source: '', pgn: '' }
  ]

  it('passes the PGN-only rows when the filters and filtersBeforeDecoding are on', () => {
    expect(
      excludePgnsFromFilters({
        filters,
        filtersEnabled: true,
        filtersBeforeDecoding: true
      })
    ).to.deep.equal(['127251', '129029'])
  })

  it('passes only rows that the filter after decoding matches the same way', () => {
    // n2k-signalk compares String(filter.pgn) with the decimal PGN and
    // takes a source of spaces as a source, so none of these filter anything
    // there.
    const odd = [
      { source: '', pgn: ' 127251 ' },
      { source: '', pgn: '0x1F801' },
      { source: '', pgn: '0127251' },
      { source: '  ', pgn: '127250' },
      { source: '', pgn: 127245 as unknown as string }
    ]
    expect(
      excludePgnsFromFilters({
        filters: odd,
        filtersEnabled: true,
        filtersBeforeDecoding: true
      })
    ).to.deep.equal([])
  })

  it('counts a source of 0 as no source, as the filter after decoding does', () => {
    expect(
      excludePgnsFromFilters({
        filters: [{ source: 0 as unknown as string, pgn: '127251' }],
        filtersEnabled: true,
        filtersBeforeDecoding: true
      })
    ).to.deep.equal(['127251'])
  })

  it('passes the given excludePgns when there are no rows', () => {
    expect(
      excludePgnsFromFilters({
        filtersEnabled: true,
        filtersBeforeDecoding: true,
        excludePgns: [65350]
      })
    ).to.deep.equal([65350])
  })

  it('passes nothing new when filtersBeforeDecoding is off', () => {
    expect(excludePgnsFromFilters({ filters, filtersEnabled: true })).to.equal(
      undefined
    )
  })

  it('passes nothing new when the filters are off', () => {
    expect(
      excludePgnsFromFilters({
        filters,
        filtersEnabled: false,
        filtersBeforeDecoding: true
      })
    ).to.equal(undefined)
  })

  it('keeps an excludePgns given in the options', () => {
    expect(excludePgnsFromFilters({ excludePgns: [65350] })).to.deep.equal([
      65350
    ])
    expect(excludePgnsFromFilters({ excludePgns: '65350' })).to.equal('65350')
    expect(
      excludePgnsFromFilters({
        filters,
        filtersEnabled: true,
        filtersBeforeDecoding: true,
        excludePgns: '65350, 127245'
      })
    ).to.deep.equal(['65350', '127245', '127251', '129029'])
    expect(
      excludePgnsFromFilters({
        filters,
        filtersEnabled: true,
        filtersBeforeDecoding: true,
        excludePgns: 65350
      })
    ).to.deep.equal([65350, '127251', '129029'])
  })
})

describe('canboatjsSupportsExcludePgns', () => {
  it('is true for a canboatjs that exports parseExcludePgns', () => {
    expect(canboatjsSupportsExcludePgns({ parseExcludePgns: () => ({}) })).to.be
      .true
  })

  it('is false for an older canboatjs', () => {
    expect(canboatjsSupportsExcludePgns({ FromPgn: class {} })).to.be.false
  })
})
