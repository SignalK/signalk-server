import { SourceRef } from '@signalk/server-api'
import assert from 'assert'
import { getToPreferredDelta, SourcePrioritiesData } from '../src/deltaPriority'
import chai from 'chai'
chai.should()

describe('toPreferredDelta logic', () => {
  it('handles undefined values', () => {
    const sourcePreferences: SourcePrioritiesData = {}
    const toPreferredDelta = getToPreferredDelta(sourcePreferences, 200)

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
    const toPreferredDelta = getToPreferredDelta(sourcePreferences, 200)

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

  describe('multi-value updates', () => {
    // Each scenario below exercises one branch of the lazy-copy filter inside
    // getToPreferredDelta. Setup paths p1/p2/p3 with `high` as the preferred
    // source and a long timeout on `low` so deltas from `low` are dropped
    // unless their path is unknown to the priorities map (then preferred=true).

    function setup() {
      const sourcePreferences: SourcePrioritiesData = {
        p1: [
          { sourceRef: 'high' as SourceRef, timeout: 0 },
          { sourceRef: 'low' as SourceRef, timeout: 60_000 }
        ],
        p2: [
          { sourceRef: 'high' as SourceRef, timeout: 0 },
          { sourceRef: 'low' as SourceRef, timeout: 60_000 }
        ],
        p3: [
          { sourceRef: 'high' as SourceRef, timeout: 0 },
          { sourceRef: 'low' as SourceRef, timeout: 60_000 }
        ]
      }
      const toPreferredDelta = getToPreferredDelta(sourcePreferences, 200)
      // Establish `high` as latest for all three paths at t=0.
      toPreferredDelta(
        {
          context: 'self',
          updates: [
            {
              $source: 'high',
              values: [
                { path: 'p1', value: 1 },
                { path: 'p2', value: 2 },
                { path: 'p3', value: 3 }
              ]
            }
          ]
        },
        new Date(0),
        'self'
      )
      return toPreferredDelta
    }

    it('keeps the original values reference when nothing is dropped', () => {
      const toPreferredDelta = getToPreferredDelta({}, 200)
      const inputValues = [
        { path: 'a', value: 1 },
        { path: 'b', value: 2 },
        { path: 'c', value: 3 }
      ]
      const delta = {
        context: 'self',
        updates: [{ $source: 'src', values: inputValues }]
      }
      const result = toPreferredDelta(delta, new Date(), 'self')
      result.updates[0].values.should.eql(inputValues)
      assert.strictEqual(
        result.updates[0].values,
        inputValues,
        'lazy-copy must not allocate a new array when no value is dropped'
      )
    })

    it('tolerates an empty values array', () => {
      const toPreferredDelta = getToPreferredDelta({}, 200)
      const delta = {
        context: 'self',
        updates: [{ $source: 'src', values: [] }]
      }
      const result = toPreferredDelta(delta, new Date(), 'self')
      result.updates[0].values.should.eql([])
    })

    it('drops the first value, keeps the rest', () => {
      const toPreferredDelta = setup()
      const result = toPreferredDelta(
        {
          context: 'self',
          updates: [
            {
              $source: 'low',
              values: [
                { path: 'p1', value: 100 },
                { path: 'unknown1', value: 200 },
                { path: 'unknown2', value: 300 }
              ]
            }
          ]
        },
        new Date(100),
        'self'
      )
      result.updates[0].values.should.eql([
        { path: 'unknown1', value: 200 },
        { path: 'unknown2', value: 300 }
      ])
    })

    it('drops the last value, keeps the rest', () => {
      const toPreferredDelta = setup()
      const result = toPreferredDelta(
        {
          context: 'self',
          updates: [
            {
              $source: 'low',
              values: [
                { path: 'unknown1', value: 200 },
                { path: 'unknown2', value: 300 },
                { path: 'p1', value: 100 }
              ]
            }
          ]
        },
        new Date(100),
        'self'
      )
      result.updates[0].values.should.eql([
        { path: 'unknown1', value: 200 },
        { path: 'unknown2', value: 300 }
      ])
    })

    it('drops the middle value, preserves order of the rest', () => {
      const toPreferredDelta = setup()
      const result = toPreferredDelta(
        {
          context: 'self',
          updates: [
            {
              $source: 'low',
              values: [
                { path: 'unknown1', value: 200 },
                { path: 'p1', value: 100 },
                { path: 'unknown2', value: 300 }
              ]
            }
          ]
        },
        new Date(100),
        'self'
      )
      result.updates[0].values.should.eql([
        { path: 'unknown1', value: 200 },
        { path: 'unknown2', value: 300 }
      ])
    })

    it('returns an empty values array when every value is dropped', () => {
      const toPreferredDelta = setup()
      const result = toPreferredDelta(
        {
          context: 'self',
          updates: [
            {
              $source: 'low',
              values: [
                { path: 'p1', value: 100 },
                { path: 'p2', value: 200 },
                { path: 'p3', value: 300 }
              ]
            }
          ]
        },
        new Date(100),
        'self'
      )
      result.updates[0].values.should.eql([])
    })
  })
})
