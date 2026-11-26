import { expect } from 'chai'
import {
  Delta,
  hasForbiddenPathSegment,
  hasUnsafeSourceKey,
  Path,
  Timestamp
} from './deltas'

// Type-check tests - verify Delta types compile correctly
const _typeCheckMetaDelta: Delta = {
  updates: [
    {
      meta: [
        {
          path: 'foo.bar' as Path,
          value: {
            displayName: 'Foo Bar'
          }
        }
      ]
    }
  ]
}
void _typeCheckMetaDelta

const _typeCheckValuesDelta: Delta = {
  updates: [
    {
      values: [
        {
          path: 'foo.bar' as Path,
          value: {
            displayName: 'Foo Bar'
          }
        }
      ]
    }
  ]
}
void _typeCheckValuesDelta

const _typeCheckCombinedDelta: Delta = {
  updates: [
    {
      meta: [
        {
          path: 'foo.bar' as Path,
          value: {
            displayName: 'Foo Bar'
          }
        }
      ]
    },
    {
      values: [
        {
          path: 'foo.bar' as Path,
          value: {
            displayName: 'Foo Bar'
          }
        }
      ]
    }
  ]
}
void _typeCheckCombinedDelta

describe('hasForbiddenPathSegment', function () {
  it('rejects a forbidden segment anywhere in the path', function () {
    expect(hasForbiddenPathSegment('__proto__')).to.equal(true)
    expect(hasForbiddenPathSegment('vessels.constructor')).to.equal(true)
    expect(hasForbiddenPathSegment('a.prototype.b')).to.equal(true)
  })

  it('accepts a segment that only contains a forbidden word', function () {
    expect(hasForbiddenPathSegment('navigation.constructorX')).to.equal(false)
    expect(hasForbiddenPathSegment('a.__proto__x')).to.equal(false)
    expect(hasForbiddenPathSegment('navigation.position')).to.equal(false)
  })
})

describe('hasUnsafeSourceKey', function () {
  it('rejects an unsafe $source every time it is seen', function () {
    for (let i = 0; i < 3; i++) {
      expect(hasUnsafeSourceKey({ $source: '__proto__.x' })).to.equal(true)
      expect(hasUnsafeSourceKey({ $source: 'can0.toString' })).to.equal(true)
    }
  })

  it('accepts a safe $source every time it is seen', function () {
    for (let i = 0; i < 3; i++) {
      expect(hasUnsafeSourceKey({ $source: 'can0.c0789182e765cef5' })).to.equal(
        false
      )
    }
  })

  it('rejects a non-string value whose string form is unsafe', function () {
    expect(hasUnsafeSourceKey({ $source: '__proto__.safe' })).to.equal(true)
    expect(hasUnsafeSourceKey({ $source: ['__proto__'] })).to.equal(true)
    expect(
      hasUnsafeSourceKey({ source: { label: 'can0', src: ['constructor'] } })
    ).to.equal(true)
  })

  it('accepts numeric source fields', function () {
    expect(
      hasUnsafeSourceKey({
        source: { label: 'can0', src: 3, pgn: 129025, instance: 0 }
      })
    ).to.equal(false)
  })

  it('rejects an unsafe source field', function () {
    for (const field of [
      'label',
      'src',
      'canName',
      'talker',
      'instance',
      'pgn',
      'sentence'
    ]) {
      expect(
        hasUnsafeSourceKey({ source: { label: 'ok', [field]: 'valueOf' } }),
        field
      ).to.equal(true)
    }
  })

  it('keeps its verdicts after more distinct sources than it remembers', function () {
    for (let i = 0; i < 25000; i++) {
      expect(hasUnsafeSourceKey({ $source: `conn.${i}` })).to.equal(false)
    }
    expect(hasUnsafeSourceKey({ $source: '__proto__' })).to.equal(true)
    expect(hasUnsafeSourceKey({ $source: 'conn.1' })).to.equal(false)
  })
})

const _typeCheckTimedOutDelta: Delta = {
  updates: [
    {
      values: [
        {
          path: 'navigation.speedOverGround' as Path,
          value: null,
          state: {
            timedOut: true,
            lastValue: {
              timestamp: '2026-03-28T10:00:00Z' as Timestamp,
              value: 5.5
            }
          }
        }
      ]
    }
  ]
}
void _typeCheckTimedOutDelta

const _typeCheckUpdateContractMeta: Delta = {
  updates: [
    {
      meta: [
        {
          path: 'notifications.mob' as Path,
          value: {
            updateContract: 'event'
          }
        },
        {
          path: 'navigation.speedOverGround' as Path,
          value: {
            timeout: 'auto',
            updateContract: 'periodic'
          }
        },
        {
          path: 'environment.depth.belowKeel' as Path,
          value: {
            timeout: 5
          }
        }
      ]
    }
  ]
}
void _typeCheckUpdateContractMeta
