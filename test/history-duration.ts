import { expect } from 'chai'
import { parseTimeRangeParams } from '../dist/api/history/index.js'

const callParse = (query: Record<string, unknown>) => {
  try {
    return parseTimeRangeParams(query)
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

describe('parseTimeRangeParams duration handling', () => {
  it('parses an ISO 8601 duration string', () => {
    const result = callParse({ duration: 'PT15M' })
    expect(result).to.have.property('timeRangeParams')
    if (result instanceof Error) throw result
    expect(result.timeRangeParams.duration?.toString()).to.equal('PT15M')
  })

  it('parses an integer number of seconds passed as a string', () => {
    const result = callParse({ duration: '900' })
    if (result instanceof Error) throw result
    const total = result.timeRangeParams.duration?.total({
      unit: 'seconds'
    })
    expect(total).to.equal(900)
  })

  it('parses zero seconds as a valid duration', () => {
    const result = callParse({ duration: '0', from: '2025-01-01T00:00:00Z' })
    if (result instanceof Error) throw result
    expect(
      result.timeRangeParams.duration?.total({ unit: 'seconds' })
    ).to.equal(0)
  })

  it('rejects fractional duration strings', () => {
    // Spec calls for an integer number of seconds; reject 1.5 etc.
    const result = callParse({ duration: '1.5' })
    expect(result).to.be.instanceOf(Error)
    expect((result as Error).message).to.contain('duration')
  })

  it('rejects non-numeric, non-ISO duration strings', () => {
    const result = callParse({ duration: 'not-a-duration' })
    expect(result).to.be.instanceOf(Error)
    expect((result as Error).message).to.contain('ISO 8601')
  })

  it('treats an empty duration as missing', () => {
    // No duration AND no from/to is invalid; assert the error mentions the
    // missing time range, not the duration format.
    const result = callParse({ duration: '' })
    expect(result).to.be.instanceOf(Error)
    expect((result as Error).message).to.contain(
      'Either from or duration parameter is required'
    )
  })

  it('returns equivalent Temporal.Duration values for ISO and integer-seconds forms', () => {
    const iso = callParse({ duration: 'PT15M' })
    const seconds = callParse({ duration: '900' })
    if (iso instanceof Error) throw iso
    if (seconds instanceof Error) throw seconds
    const isoSec = iso.timeRangeParams.duration?.total({ unit: 'seconds' })
    const intSec = seconds.timeRangeParams.duration?.total({ unit: 'seconds' })
    expect(isoSec).to.equal(intSec)
  })

  it('parses ISO 8601 from and to', () => {
    const result = callParse({
      from: '2025-01-01T00:00:00Z',
      to: '2025-01-02T00:00:00Z'
    })
    if (result instanceof Error) throw result
    expect(result.timeRangeParams.from?.toString()).to.equal(
      '2025-01-01T00:00:00Z'
    )
    expect(result.timeRangeParams.to?.toString()).to.equal(
      '2025-01-02T00:00:00Z'
    )
  })
})
