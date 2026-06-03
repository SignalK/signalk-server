import { expect } from 'chai'

import { getSourceId } from './sourceutil'

describe('getSourceId', () => {
  it('returns no_source for a missing source', () => {
    expect(getSourceId(undefined)).to.equal('no_source')
    expect(getSourceId(null)).to.equal('no_source')
  })

  it('uses label.canName for an N2K source with a CAN Name', () => {
    expect(
      getSourceId({ label: 'canhat', canName: 'c0509635e7664732', src: '172' })
    ).to.equal('canhat.c0509635e7664732')
  })

  it('uses label.src for an N2K source without a CAN Name', () => {
    expect(getSourceId({ label: 'n2k-sample-data', src: '43' })).to.equal(
      'n2k-sample-data.43'
    )
  })

  it('uses label.talker for an NMEA 0183 source', () => {
    expect(
      getSourceId({ label: 'gps', type: 'NMEA0183', talker: 'GP' })
    ).to.equal('gps.GP')
  })

  it('falls back to label.XX for an NMEA 0183 source with no talker', () => {
    expect(getSourceId({ label: 'gps', type: 'NMEA0183' })).to.equal('gps.XX')
  })

  it('returns the bare label for a plugin source', () => {
    // A plugin emitting `source: { label: pluginId, type: 'plugin' }` must
    // resolve to the bare plugin id so it matches the `excludeSelf` ranking
    // entry (which is the bare plugin id) and a correcter plugin does not
    // see its own output back on a self-subscription.
    expect(
      getSourceId({ label: 'my-correcter-plugin', type: 'plugin' })
    ).to.equal('my-correcter-plugin')
  })

  it('returns unknown_source for a plugin source without a label', () => {
    expect(getSourceId({ type: 'plugin' })).to.equal('unknown_source')
  })

  it('passes a plain $source string through unchanged', () => {
    expect(getSourceId('n2k-sample-data.43')).to.equal('n2k-sample-data.43')
  })
})
