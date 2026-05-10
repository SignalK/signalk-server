import { expect } from 'chai'
import { isDeviceStale } from '../src/n2k-discovery-staleness'

const NOW = 1_000_000_000_000
const THRESHOLD = 90_000

describe('isDeviceStale', function () {
  it('returns false when sourceMeta is fresh and no frame info', function () {
    expect(isDeviceStale(NOW - 1_000, undefined, NOW, THRESHOLD)).to.equal(
      false
    )
  })

  it('returns false when frameLastSeen is fresh and no sourceMeta', function () {
    // Mirrors a device that emits only Heartbeat / Address Claim — no
    // value-bearing deltas — but is alive on the bus. The Online badge
    // shows it; Reset Stale must agree.
    expect(isDeviceStale(undefined, NOW - 1_000, NOW, THRESHOLD)).to.equal(
      false
    )
  })

  it('returns false when both signals are fresh', function () {
    expect(isDeviceStale(NOW - 5_000, NOW - 1_000, NOW, THRESHOLD)).to.equal(
      false
    )
  })

  it('returns false when only the newer of two signals is fresh', function () {
    // sourceMeta is well past the threshold but the frame was seen
    // 1 s ago — exactly the case that broke before this fix.
    expect(isDeviceStale(NOW - 200_000, NOW - 1_000, NOW, THRESHOLD)).to.equal(
      false
    )
  })

  it('returns true when both signals are past the threshold', function () {
    expect(
      isDeviceStale(NOW - 200_000, NOW - 200_000, NOW, THRESHOLD)
    ).to.equal(true)
  })

  it('returns true when both signals are absent', function () {
    expect(isDeviceStale(undefined, undefined, NOW, THRESHOLD)).to.equal(true)
  })

  it('returns true when meta is fresh-ish but past threshold and no frame', function () {
    expect(
      isDeviceStale(NOW - (THRESHOLD + 1), undefined, NOW, THRESHOLD)
    ).to.equal(true)
  })
})
