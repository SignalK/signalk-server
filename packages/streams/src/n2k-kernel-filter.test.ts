import { expect } from 'chai'
import { kernelExcludePgns } from './n2k-kernel-filter'

describe('kernelExcludePgns', () => {
  const filters = [
    { source: '', pgn: '127251' },
    { source: '35', pgn: '127250' },
    { source: '12', pgn: '' },
    { pgn: '129029' },
    { source: '', pgn: '' }
  ]

  it('passes the PGN-only rows when the filters and filtersInKernel are on', () => {
    expect(
      kernelExcludePgns({
        filters,
        filtersEnabled: true,
        filtersInKernel: true
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
      kernelExcludePgns({
        filters: odd,
        filtersEnabled: true,
        filtersInKernel: true
      })
    ).to.deep.equal([])
  })

  it('counts a source of 0 as no source, as the filter after decoding does', () => {
    expect(
      kernelExcludePgns({
        filters: [{ source: 0 as unknown as string, pgn: '127251' }],
        filtersEnabled: true,
        filtersInKernel: true
      })
    ).to.deep.equal(['127251'])
  })

  it('passes the given excludePgns when there are no rows', () => {
    expect(
      kernelExcludePgns({
        filtersEnabled: true,
        filtersInKernel: true,
        excludePgns: [65350]
      })
    ).to.deep.equal([65350])
  })

  it('passes nothing new when filtersInKernel is off', () => {
    expect(kernelExcludePgns({ filters, filtersEnabled: true })).to.equal(
      undefined
    )
  })

  it('passes nothing new when the filters are off', () => {
    expect(
      kernelExcludePgns({
        filters,
        filtersEnabled: false,
        filtersInKernel: true
      })
    ).to.equal(undefined)
  })

  it('keeps an excludePgns given in the options', () => {
    expect(kernelExcludePgns({ excludePgns: [65350] })).to.deep.equal([65350])
    expect(kernelExcludePgns({ excludePgns: '65350' })).to.equal('65350')
    expect(
      kernelExcludePgns({
        filters,
        filtersEnabled: true,
        filtersInKernel: true,
        excludePgns: '65350, 127245'
      })
    ).to.deep.equal(['65350', '127245', '127251', '129029'])
    expect(
      kernelExcludePgns({
        filters,
        filtersEnabled: true,
        filtersInKernel: true,
        excludePgns: 65350
      })
    ).to.deep.equal([65350, '127251', '129029'])
  })
})
