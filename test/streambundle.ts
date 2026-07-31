import {
  Context,
  Delta,
  MetaValue,
  Path,
  SourceRef,
  Timestamp,
  Value
} from '@signalk/server-api'
import { expect } from 'chai'
import { StreamBundle } from '../src/streambundle'

const SELF_ID = 'self-uuid'
const SELF_CONTEXT = `vessels.${SELF_ID}` as Context
const TIMESTAMP = '2026-01-01T00:00:00.000Z' as Timestamp
const SOURCE_REF = 'test.1' as SourceRef

const SOG_PATH = 'navigation.speedOverGround' as Path
const HEADING_PATH = 'navigation.headingTrue' as Path
const WATER_TEMP_PATH = 'environment.water.temperature' as Path

const SOG_FIRST = 3.4
const SOG_SECOND = 3.5
const SOG_THIRD = 3.6
const HEADING = 1.2
const WATER_TEMP = 285.4

const WATER_TEMP_META: MetaValue = { units: 'K' }

function valueDelta(path: Path, value: Value): Delta {
  return {
    context: SELF_CONTEXT,
    updates: [
      { $source: SOURCE_REF, timestamp: TIMESTAMP, values: [{ path, value }] }
    ]
  }
}

function metaDelta(path: Path, value: MetaValue): Delta {
  return {
    context: SELF_CONTEXT,
    updates: [
      { $source: SOURCE_REF, timestamp: TIMESTAMP, meta: [{ path, value }] }
    ]
  }
}

// index.ts emits `unfilteredDelta` before `delta`, and registers
// pushUnfilteredDelta / pushDelta as permanent listeners on both, so every
// delta reaches the unfiltered bus first. Replicate that order here.
function dispatch(bundle: StreamBundle, delta: Delta) {
  bundle.pushUnfilteredDelta(delta)
  bundle.pushDelta(delta)
}

describe('StreamBundle path announcements', () => {
  let bundle: StreamBundle
  let announced: Path[]

  beforeEach(() => {
    bundle = new StreamBundle(SELF_ID)
    announced = []
    bundle.keys.onValue((path) => {
      announced.push(path)
    })
  })

  it('announces a new value path exactly once', () => {
    dispatch(bundle, valueDelta(SOG_PATH, SOG_FIRST))

    expect(announced).to.deep.equal([SOG_PATH])
  })

  it('announces a path only once across repeated deltas', () => {
    dispatch(bundle, valueDelta(SOG_PATH, SOG_FIRST))
    dispatch(bundle, valueDelta(SOG_PATH, SOG_SECOND))
    dispatch(bundle, valueDelta(SOG_PATH, SOG_THIRD))

    expect(announced).to.deep.equal([SOG_PATH])
  })

  // pushUnfilteredDelta skips updates carrying no `values`, so a path whose
  // first appearance is meta-only gets its bus from pushDelta instead. It
  // still has to be announced, and still only once when a value follows.
  it('announces a meta-first path once, including when a value follows', () => {
    dispatch(bundle, metaDelta(WATER_TEMP_PATH, WATER_TEMP_META))
    expect(announced).to.deep.equal([WATER_TEMP_PATH])

    dispatch(bundle, valueDelta(WATER_TEMP_PATH, WATER_TEMP))
    expect(announced).to.deep.equal([WATER_TEMP_PATH])
  })

  it('announces each distinct path once', () => {
    dispatch(bundle, valueDelta(SOG_PATH, SOG_FIRST))
    dispatch(bundle, valueDelta(HEADING_PATH, HEADING))
    dispatch(bundle, valueDelta(SOG_PATH, SOG_SECOND))

    expect(announced).to.deep.equal([SOG_PATH, HEADING_PATH])
  })

  // A single announcement must still leave both buses usable: the delta cache
  // subscribes via getBus(), live subscriptions with sourcePolicy 'all' via
  // getUnfilteredBus(). Neither may lose values.
  it('delivers values on both the filtered and unfiltered bus for an announced path', () => {
    const filtered: unknown[] = []
    const unfiltered: unknown[] = []

    bundle.keys.onValue((announcedPath) => {
      bundle.getBus(announcedPath).onValue((d) => filtered.push(d.value))
      bundle
        .getUnfilteredBus(announcedPath)
        .onValue((d) => unfiltered.push(d.value))
    })

    dispatch(bundle, valueDelta(SOG_PATH, SOG_FIRST))
    dispatch(bundle, valueDelta(SOG_PATH, SOG_SECOND))

    // Only the unfiltered bus announces the path, and it does so before
    // receiving the delta that created it. The listener attaches to both buses
    // at that point, so each delivers every value exactly once.
    expect(filtered).to.deep.equal([SOG_FIRST, SOG_SECOND])
    expect(unfiltered).to.deep.equal([SOG_FIRST, SOG_SECOND])
  })
})
