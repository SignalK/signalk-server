import { SourceRef } from '@signalk/server-api'
import assert from 'assert'
import {
  getToPreferredDelta,
  SourcePrioritiesData,
  SourceRankingEntry
} from '../src/deltaPriority'
import chai from 'chai'
chai.should()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDelta(sourceRef: string, path: string, value: number): any {
  return {
    context: 'self',
    updates: [
      {
        $source: sourceRef,
        values: [{ path, value }]
      }
    ]
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function accepted(result: any): boolean {
  return result.updates[0].values.length > 0
}

describe('toPreferredDelta logic', () => {
  it('handles undefined values', () => {
    const sourcePreferences: SourcePrioritiesData = {}
    const toPreferredDelta = getToPreferredDelta(
      sourcePreferences,
      undefined,
      200
    )

    const delta = toPreferredDelta(
      {
        context: 'self',
        updates: [
          {
            meta: [
              {
                path: 'environment.wind.speedApparent',
                value: { units: 'A' }
              }
            ]
          }
        ]
      },
      new Date(),
      'self'
    )
    assert(delta.updates[0].values === undefined)
  })

  it('works', () => {
    const sourcePreferences: SourcePrioritiesData = {
      'environment.wind.speedApparent': [
        {
          sourceRef: 'a' as SourceRef,
          timeout: 0
        },
        {
          sourceRef: 'b' as SourceRef,
          timeout: 150
        },
        {
          sourceRef: 'c' as SourceRef,
          timeout: 150
        }
      ]
    }
    const toPreferredDelta = getToPreferredDelta(
      sourcePreferences,
      undefined,
      200
    )

    let totalDelay = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any[] = []
    const expectedResult: string[] = []
    let n = 0
    function push(sourceRef: string, delay: number, shouldBeEmitted: boolean) {
      totalDelay += delay
      if (shouldBeEmitted) {
        expectedResult.push(sourceRef)
      }
      setTimeout(() => {
        result.push(
          toPreferredDelta(
            {
              context: 'self',
              updates: [
                {
                  $source: sourceRef,
                  values: [
                    {
                      path: 'environment.wind.speedApparent',
                      value: n++
                    }
                  ]
                }
              ]
            },
            new Date(),
            'self'
          )
        )
      }, totalDelay)
    }

    push('a', 0, true)
    push('b', 50, false)
    push('c', 50, false)
    push('b', 100, true)
    push('a', 0, true)
    push('b', 10, false)
    push('c', 10, false)
    push('c', 150, true)
    push('b', 10, true)
    push('c', 10, false)
    push('c', 150, true)
    push('a', 10, true)
    push('b', 10, false)
    push('d', 0, false)
    push('c', 10, false)
    push('c', 150, true)
    push('d', 205, true)

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          result
            .filter((r) => r.updates[0].values.length > 0)
            .map((r) => r.updates[0].$source)
            .should.eql(expectedResult)
          resolve(undefined)
        } catch (err) {
          reject(err)
        }
      }, totalDelay + 10)
    })
  })
})

describe('source ranking', () => {
  const PATH = 'environment.wind.speedApparent'

  it('preferred ranked source wins over lower-ranked source', () => {
    const ranking: SourceRankingEntry[] = [
      { sourceRef: 'a' as SourceRef, timeout: 0 },
      { sourceRef: 'b' as SourceRef, timeout: 10000 }
    ]
    const toPreferred = getToPreferredDelta({}, ranking)
    const t = 1000000

    const r1 = toPreferred(makeDelta('a', PATH, 1), new Date(t), 'self')
    assert(accepted(r1), 'preferred source a should be accepted')

    const r2 = toPreferred(makeDelta('b', PATH, 2), new Date(t + 1), 'self')
    assert(!accepted(r2), 'lower-ranked source b should be rejected')
  })

  it('lower-ranked source wins when higher-ranked source times out', () => {
    const ranking: SourceRankingEntry[] = [
      { sourceRef: 'a' as SourceRef, timeout: 0 },
      { sourceRef: 'b' as SourceRef, timeout: 10000 }
    ]
    const toPreferred = getToPreferredDelta({}, ranking)
    const t = 1000000

    toPreferred(makeDelta('a', PATH, 1), new Date(t), 'self')
    const r = toPreferred(makeDelta('b', PATH, 2), new Date(t + 10001), 'self')
    assert(accepted(r), 'b should be accepted after timeout')
  })

  it('unranked source is treated as lowest priority with default timeout', () => {
    const ranking: SourceRankingEntry[] = [
      { sourceRef: 'a' as SourceRef, timeout: 0 }
    ]
    const toPreferred = getToPreferredDelta({}, ranking, 200)
    const t = 1000000

    toPreferred(makeDelta('a', PATH, 1), new Date(t), 'self')

    const r1 = toPreferred(makeDelta('c', PATH, 2), new Date(t + 1), 'self')
    assert(!accepted(r1), 'unranked c should be rejected within timeout')

    const r2 = toPreferred(makeDelta('c', PATH, 3), new Date(t + 201), 'self')
    assert(accepted(r2), 'unranked c should be accepted after default timeout')
  })

  it('ranking applies across multiple paths', () => {
    const ranking: SourceRankingEntry[] = [
      { sourceRef: 'a' as SourceRef, timeout: 0 },
      { sourceRef: 'b' as SourceRef, timeout: 5000 }
    ]
    const toPreferred = getToPreferredDelta({}, ranking)
    const t = 1000000

    // path1: a wins
    toPreferred(makeDelta('a', 'path1', 1), new Date(t), 'self')
    const r1 = toPreferred(makeDelta('b', 'path1', 2), new Date(t + 1), 'self')
    assert(!accepted(r1), 'b rejected on path1')

    // path2: a also wins (ranking is global)
    toPreferred(makeDelta('a', 'path2', 3), new Date(t), 'self')
    const r2 = toPreferred(makeDelta('b', 'path2', 4), new Date(t + 1), 'self')
    assert(!accepted(r2), 'b rejected on path2')
  })

  it('first update for a path is always accepted regardless of ranking', () => {
    const ranking: SourceRankingEntry[] = [
      { sourceRef: 'a' as SourceRef, timeout: 0 },
      { sourceRef: 'b' as SourceRef, timeout: 5000 }
    ]
    const toPreferred = getToPreferredDelta({}, ranking)

    const r = toPreferred(makeDelta('b', PATH, 1), new Date(1000000), 'self')
    assert(
      accepted(r),
      'first update from lower-ranked source should be accepted'
    )
  })
})

describe('disabled source (timeout=-1)', () => {
  const PATH = 'environment.wind.speedApparent'

  it('disabled source in ranking is always rejected', () => {
    const ranking: SourceRankingEntry[] = [
      { sourceRef: 'a' as SourceRef, timeout: 0 },
      { sourceRef: 'b' as SourceRef, timeout: -1 }
    ]
    const toPreferred = getToPreferredDelta({}, ranking)
    const t = 1000000

    const r1 = toPreferred(makeDelta('b', PATH, 1), new Date(t), 'self')
    assert(!accepted(r1), 'disabled b rejected initially')

    const r2 = toPreferred(
      makeDelta('b', PATH, 2),
      new Date(t + 999999),
      'self'
    )
    assert(!accepted(r2), 'disabled b rejected even after long delay')
  })

  it('disabled source in path-level config is always rejected', () => {
    const pathConfig: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: 'a' as SourceRef, timeout: 0 },
        { sourceRef: 'b' as SourceRef, timeout: -1 }
      ]
    }
    const toPreferred = getToPreferredDelta(pathConfig, undefined)
    const t = 1000000

    const r = toPreferred(makeDelta('b', PATH, 1), new Date(t), 'self')
    assert(!accepted(r), 'disabled b rejected via path-level config')
  })

  it('enabled siblings still work when a source is disabled', () => {
    const ranking: SourceRankingEntry[] = [
      { sourceRef: 'a' as SourceRef, timeout: 0 },
      { sourceRef: 'b' as SourceRef, timeout: -1 },
      { sourceRef: 'c' as SourceRef, timeout: 5000 }
    ]
    const toPreferred = getToPreferredDelta({}, ranking)
    const t = 1000000

    toPreferred(makeDelta('a', PATH, 1), new Date(t), 'self')

    const r1 = toPreferred(makeDelta('b', PATH, 2), new Date(t + 1), 'self')
    assert(!accepted(r1), 'disabled b rejected')

    const r2 = toPreferred(makeDelta('c', PATH, 3), new Date(t + 5001), 'self')
    assert(accepted(r2), 'enabled c accepted after timeout')
  })

  it('disabled preferred source allows next source to win', () => {
    const ranking: SourceRankingEntry[] = [
      { sourceRef: 'a' as SourceRef, timeout: -1 },
      { sourceRef: 'b' as SourceRef, timeout: 0 }
    ]
    const toPreferred = getToPreferredDelta({}, ranking)
    const t = 1000000

    const r1 = toPreferred(makeDelta('a', PATH, 1), new Date(t), 'self')
    assert(!accepted(r1), 'disabled preferred source a rejected')

    const r2 = toPreferred(makeDelta('b', PATH, 2), new Date(t), 'self')
    assert(accepted(r2), 'next source b accepted')

    const r3 = toPreferred(makeDelta('a', PATH, 3), new Date(t + 1), 'self')
    assert(!accepted(r3), 'disabled a still rejected')
  })
})

describe('path-level overrides source ranking', () => {
  const PATH = 'environment.wind.speedApparent'

  it('path-level config takes precedence over source ranking', () => {
    const ranking: SourceRankingEntry[] = [
      { sourceRef: 'a' as SourceRef, timeout: 0 },
      { sourceRef: 'b' as SourceRef, timeout: 5000 }
    ]
    const pathConfig: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: 'b' as SourceRef, timeout: 0 },
        { sourceRef: 'a' as SourceRef, timeout: 5000 }
      ]
    }
    const toPreferred = getToPreferredDelta(pathConfig, ranking)
    const t = 1000000

    // b is preferred for this path (path-level), even though a is preferred globally
    toPreferred(makeDelta('b', PATH, 1), new Date(t), 'self')
    const r1 = toPreferred(makeDelta('a', PATH, 2), new Date(t + 1), 'self')
    assert(!accepted(r1), 'a rejected because path-level prefers b')

    // On a different path without path-level config, ranking applies: a > b
    toPreferred(makeDelta('a', 'other.path', 3), new Date(t), 'self')
    const r2 = toPreferred(
      makeDelta('b', 'other.path', 4),
      new Date(t + 1),
      'self'
    )
    assert(!accepted(r2), 'b rejected on other path because ranking prefers a')
  })

  it('path-level disabled overrides ranking enabled', () => {
    const ranking: SourceRankingEntry[] = [
      { sourceRef: 'a' as SourceRef, timeout: 0 }
    ]
    const pathConfig: SourcePrioritiesData = {
      [PATH]: [{ sourceRef: 'a' as SourceRef, timeout: -1 }]
    }
    const toPreferred = getToPreferredDelta(pathConfig, ranking)
    const t = 1000000

    // a is disabled for this specific path
    const r1 = toPreferred(makeDelta('a', PATH, 1), new Date(t), 'self')
    assert(!accepted(r1), 'a rejected on path where it is disabled')

    // a is still enabled on other paths via ranking
    const r2 = toPreferred(makeDelta('a', 'other.path', 2), new Date(t), 'self')
    assert(accepted(r2), 'a accepted on other path via ranking')
  })
})

describe('non-self context', () => {
  it('non-self context deltas pass through unchanged', () => {
    const ranking: SourceRankingEntry[] = [
      { sourceRef: 'a' as SourceRef, timeout: 0 },
      { sourceRef: 'b' as SourceRef, timeout: -1 }
    ]
    const toPreferred = getToPreferredDelta({}, ranking)
    const PATH = 'environment.wind.speedApparent'

    // Even disabled source b passes through for non-self context
    const delta = makeDelta('b', PATH, 1)
    delta.context = 'vessels.urn:mrn:imo:1234567'
    const r = toPreferred(delta, new Date(1000000), 'self')
    assert(accepted(r), 'non-self context should pass through unchanged')
  })
})
