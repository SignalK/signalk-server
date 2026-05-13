import { expect } from 'chai'
import type {
  Context,
  NormalizedDelta,
  Path,
  SourceRef,
  Timestamp
} from '@signalk/server-api'
import { toDelta } from '../dist/streambundle'

function makeValueDelta(): NormalizedDelta {
  return {
    context: 'vessels.self' as Context,
    $source: 'test-source' as SourceRef,
    source: { label: 'test-source' },
    path: 'navigation.speedOverGround' as Path,
    timestamp: '2024-01-15T10:30:00.000Z' as Timestamp,
    value: 5.5,
    isMeta: false
  }
}

function makeMetaDelta(): NormalizedDelta {
  return {
    context: 'vessels.self' as Context,
    $source: 'test-source' as SourceRef,
    source: { label: 'test-source' },
    path: 'navigation.speedOverGround' as Path,
    timestamp: '2024-01-15T10:30:00.000Z' as Timestamp,
    value: { units: 'm/s' },
    isMeta: true
  }
}

describe('toDelta', function () {
  describe('shape', function () {
    it('produces a values delta from a NormalizedValueDelta', function () {
      const nd = makeValueDelta()
      const delta = toDelta(nd)

      expect(delta).to.have.property('context', 'vessels.self')
      expect(delta.updates).to.have.lengthOf(1)
      const update = delta.updates[0] as {
        values: Array<unknown>
        source: unknown
      }
      expect(update).to.have.property('$source', 'test-source')
      expect(update)
        .to.have.property('source')
        .that.deep.equals({ label: 'test-source' })
      expect(update).to.have.property('timestamp', '2024-01-15T10:30:00.000Z')
      expect(update.values).to.deep.equal([
        { path: 'navigation.speedOverGround', value: 5.5 }
      ])
    })

    it('produces a meta delta from a NormalizedMetaDelta', function () {
      const nd = makeMetaDelta()
      const delta = toDelta(nd)

      expect(delta).to.have.property('context', 'vessels.self')
      expect(delta.updates).to.have.lengthOf(1)
      const update = delta.updates[0] as {
        meta: Array<unknown>
        source: unknown
      }
      expect(update).to.have.property('$source', 'test-source')
      expect(update)
        .to.have.property('source')
        .that.deep.equals({ label: 'test-source' })
      expect(update).to.have.property('timestamp', '2024-01-15T10:30:00.000Z')
      expect(update.meta).to.deep.equal([
        { path: 'navigation.speedOverGround', value: { units: 'm/s' } }
      ])
    })
  })

  describe('memoization', function () {
    it('returns the same Delta reference on repeated calls for one NormalizedDelta', function () {
      const nd = makeValueDelta()

      const first = toDelta(nd)
      const second = toDelta(nd)
      const third = toDelta(nd)

      expect(second).to.equal(first)
      expect(third).to.equal(first)
    })

    it('keeps caches per-NormalizedDelta and never collides on identical content', function () {
      const a = makeValueDelta()
      const b = makeValueDelta()

      const aFirst = toDelta(a)
      const bFirst = toDelta(b)

      expect(aFirst).to.not.equal(bFirst)
      expect(toDelta(a)).to.equal(aFirst)
      expect(toDelta(b)).to.equal(bFirst)
    })

    it('memoizes meta deltas as well as value deltas', function () {
      const nd = makeMetaDelta()

      expect(toDelta(nd)).to.equal(toDelta(nd))
    })
  })

  describe('immutability', function () {
    // Subscribers downstream of toDelta share the cached Delta by reference.
    // Freezing converts an attempted mutation into a thrown TypeError instead
    // of silent cross-subscriber corruption.
    it('freezes the returned Delta, its updates array, the inner Update, and the values array', function () {
      const delta = toDelta(makeValueDelta())
      const update = delta.updates[0] as { values: Array<unknown> }

      expect(Object.isFrozen(delta)).to.equal(true)
      expect(Object.isFrozen(delta.updates)).to.equal(true)
      expect(Object.isFrozen(update)).to.equal(true)
      expect(Object.isFrozen(update.values)).to.equal(true)
      expect(Object.isFrozen(update.values[0])).to.equal(true)
    })

    it('freezes the meta variant equivalently', function () {
      const delta = toDelta(makeMetaDelta())
      const update = delta.updates[0] as { meta: Array<unknown> }

      expect(Object.isFrozen(delta)).to.equal(true)
      expect(Object.isFrozen(update)).to.equal(true)
      expect(Object.isFrozen(update.meta)).to.equal(true)
      expect(Object.isFrozen(update.meta[0])).to.equal(true)
    })

    // Leaves owned by the upstream delta — see toDelta comment. Pinned so a
    // future "freeze everything" change has to consciously revisit this.
    it('leaves source and value unfrozen as upstream-owned leaves', function () {
      const nd = makeValueDelta()
      const delta = toDelta(nd)
      const update = delta.updates[0] as {
        source: object
        values: Array<{ value: unknown }>
      }

      expect(update.source).to.equal(nd.source)
      expect(Object.isFrozen(update.source)).to.equal(false)
      expect(update.values[0].value).to.equal(nd.value)
    })

    // Defensive: a future spread or Object.assign on the NormalizedDelta
    // would otherwise carry the cached Delta into the copy and serve stale
    // memoized state from a different instance.
    it('stores the memoization slot as a non-enumerable own property', function () {
      const nd = makeValueDelta()
      toDelta(nd)

      const enumerableSymbols = Object.getOwnPropertySymbols(nd).filter(
        (s) => Object.getOwnPropertyDescriptor(nd, s)?.enumerable === true
      )
      expect(enumerableSymbols).to.have.lengthOf(0)
    })
  })
})
