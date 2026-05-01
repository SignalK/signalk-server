import { SourceRef } from '@signalk/server-api'
import assert from 'assert'
import {
  getToPreferredDelta,
  PriorityGroupConfig,
  SourcePrioritiesData
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
    const toPreferredDelta = getToPreferredDelta({
      overrides: sourcePreferences,
      unknownSourceTimeout: 200
    })

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
    const toPreferredDelta = getToPreferredDelta({
      overrides: sourcePreferences,
      unknownSourceTimeout: 200
    })

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

describe('disabled source (timeout=-1)', () => {
  const PATH = 'environment.wind.speedApparent'

  it('disabled source in path-level config is always rejected', () => {
    const pathConfig: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: 'a' as SourceRef, timeout: 0 },
        { sourceRef: 'b' as SourceRef, timeout: -1 }
      ]
    }
    const toPreferred = getToPreferredDelta({ overrides: pathConfig })
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

  it('enabled siblings still work when a source is disabled', () => {
    const pathConfig: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: 'a' as SourceRef, timeout: 0 },
        { sourceRef: 'b' as SourceRef, timeout: -1 },
        { sourceRef: 'c' as SourceRef, timeout: 5000 }
      ]
    }
    const toPreferred = getToPreferredDelta({ overrides: pathConfig })
    const t = 1000000

    toPreferred(makeDelta('a', PATH, 1), new Date(t), 'self')

    const r1 = toPreferred(makeDelta('b', PATH, 2), new Date(t + 1), 'self')
    assert(!accepted(r1), 'disabled b rejected')

    const r2 = toPreferred(makeDelta('c', PATH, 3), new Date(t + 5001), 'self')
    assert(accepted(r2), 'enabled c accepted after timeout')
  })

  it('disabled preferred source allows next source to win', () => {
    const pathConfig: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: 'a' as SourceRef, timeout: -1 },
        { sourceRef: 'b' as SourceRef, timeout: 0 }
      ]
    }
    const toPreferred = getToPreferredDelta({ overrides: pathConfig })
    const t = 1000000

    const r1 = toPreferred(makeDelta('a', PATH, 1), new Date(t), 'self')
    assert(!accepted(r1), 'disabled preferred source a rejected')

    const r2 = toPreferred(makeDelta('b', PATH, 2), new Date(t), 'self')
    assert(accepted(r2), 'next source b accepted')

    const r3 = toPreferred(makeDelta('a', PATH, 3), new Date(t + 1), 'self')
    assert(!accepted(r3), 'disabled a still rejected')
  })
})

describe('path-level displaces unknown incumbent', () => {
  const PATH = 'environment.wind.speedApparent'

  it('configured source displaces unknown incumbent immediately', () => {
    // An unknown (unconfigured) source publishes the path first and
    // becomes 'latest'. When the user's configured source arrives, it
    // must win immediately — otherwise the configured source gets
    // permanently shadowed by the unconfigured one.
    const pathConfig: SourcePrioritiesData = {
      [PATH]: [{ sourceRef: 'venus' as SourceRef, timeout: 60000 }]
    }
    const toPreferred = getToPreferredDelta({ overrides: pathConfig })
    const t = 1000000

    const r1 = toPreferred(makeDelta('n2k', PATH, 1), new Date(t), 'self')
    assert(accepted(r1), 'first n2k delta accepted (nothing else seen yet)')

    const r2 = toPreferred(
      makeDelta('venus', PATH, 2),
      new Date(t + 100),
      'self'
    )
    assert(accepted(r2), 'configured venus displaces unconfigured n2k')

    const r3 = toPreferred(makeDelta('n2k', PATH, 3), new Date(t + 200), 'self')
    assert(!accepted(r3), 'n2k rejected while configured venus is winning')
  })

  it("configured source's timeout holds off unknown competitors", () => {
    // With a 60s timeout configured, an unknown source must not steal
    // the slot after just unknownSourceTimeout.
    const pathConfig: SourcePrioritiesData = {
      [PATH]: [{ sourceRef: 'plugin' as SourceRef, timeout: 60000 }]
    }
    const toPreferred = getToPreferredDelta({
      overrides: pathConfig,
      unknownSourceTimeout: 10000
    })
    const t = 1000000

    toPreferred(makeDelta('plugin', PATH, 1), new Date(t), 'self')

    const r1 = toPreferred(
      makeDelta('n2k', PATH, 2),
      new Date(t + 11000),
      'self'
    )
    assert(
      !accepted(r1),
      'unknown n2k rejected within configured timeout even past unknownSourceTimeout'
    )

    const r2 = toPreferred(
      makeDelta('n2k', PATH, 3),
      new Date(t + 60001),
      'self'
    )
    assert(accepted(r2), 'unknown n2k accepted after configured timeout')
  })

  it('unknown source that briefly won does not self-renew forever', () => {
    // If the configured source goes silent just long enough for an
    // unknown source to squeeze in, the unknown source must not then
    // self-renew via the "latest.sourceRef === sourceRef" rule —
    // otherwise a transient gap permanently shadows the configured
    // preference.
    const pathConfig: SourcePrioritiesData = {
      [PATH]: [{ sourceRef: 'plugin' as SourceRef, timeout: 1000 }]
    }
    const toPreferred = getToPreferredDelta({
      overrides: pathConfig,
      unknownSourceTimeout: 500
    })
    const t = 1000000

    toPreferred(makeDelta('plugin', PATH, 1), new Date(t), 'self')

    const r1 = toPreferred(
      makeDelta('n2k', PATH, 2),
      new Date(t + 1500),
      'self'
    )
    assert(accepted(r1), 'n2k accepted after plugin goes silent')

    const r2 = toPreferred(
      makeDelta('plugin', PATH, 3),
      new Date(t + 1501),
      'self'
    )
    assert(accepted(r2), 'plugin reclaims the slot from unknown incumbent')
  })
})

describe('notifications bypass priority', () => {
  const NOTI = 'notifications.instrument.NoFix'

  it('notification from low-priority source is accepted', () => {
    const pathConfig: SourcePrioritiesData = {
      [NOTI]: [
        { sourceRef: 'plotter' as SourceRef, timeout: 5000 },
        { sourceRef: 'i70' as SourceRef, timeout: 5000 }
      ]
    }
    const toPreferred = getToPreferredDelta({ overrides: pathConfig })
    const t = 1000000

    toPreferred(makeDelta('plotter', NOTI, 1), new Date(t), 'self')
    const r = toPreferred(makeDelta('i70', NOTI, 2), new Date(t + 1), 'self')
    assert(
      accepted(r),
      'i70 notification accepted despite plotter being higher priority'
    )
  })

  it('notification from disabled source is still accepted', () => {
    const pathConfig: SourcePrioritiesData = {
      [NOTI]: [{ sourceRef: 'i70' as SourceRef, timeout: -1 }]
    }
    const toPreferred = getToPreferredDelta({ overrides: pathConfig })
    const r = toPreferred(makeDelta('i70', NOTI, 1), new Date(1000000), 'self')
    assert(accepted(r), 'disabled source notification still accepted')
  })

  it('path-level config on a notification path is ignored', () => {
    const pathConfig: SourcePrioritiesData = {
      [NOTI]: [{ sourceRef: 'plotter' as SourceRef, timeout: 5000 }]
    }
    const toPreferred = getToPreferredDelta({ overrides: pathConfig })
    const t = 1000000

    toPreferred(makeDelta('plotter', NOTI, 1), new Date(t), 'self')
    const r = toPreferred(makeDelta('i70', NOTI, 2), new Date(t + 1), 'self')
    assert(accepted(r), 'unconfigured source still wins on notification path')
  })

  it('non-notification path in same scenario still respects priority', () => {
    const pathConfig: SourcePrioritiesData = {
      'environment.wind.speedApparent': [
        { sourceRef: 'plotter' as SourceRef, timeout: 5000 },
        { sourceRef: 'i70' as SourceRef, timeout: 5000 }
      ]
    }
    const toPreferred = getToPreferredDelta({ overrides: pathConfig })
    const PATH = 'environment.wind.speedApparent'
    const t = 1000000

    toPreferred(makeDelta('plotter', PATH, 1), new Date(t), 'self')
    const r = toPreferred(makeDelta('i70', PATH, 2), new Date(t + 1), 'self')
    assert(
      !accepted(r),
      'i70 rejected on regular path because plotter is higher priority'
    )
  })
})

describe('non-self context', () => {
  it('non-self context deltas pass through unchanged', () => {
    const pathConfig: SourcePrioritiesData = {
      'environment.wind.speedApparent': [
        { sourceRef: 'a' as SourceRef, timeout: 0 },
        { sourceRef: 'b' as SourceRef, timeout: -1 }
      ]
    }
    const toPreferred = getToPreferredDelta({ overrides: pathConfig })
    const PATH = 'environment.wind.speedApparent'

    // Even disabled source b passes through for non-self context
    const delta = makeDelta('b', PATH, 1)
    delta.context = 'vessels.urn:mrn:imo:1234567'
    const r = toPreferred(delta, new Date(1000000), 'self')
    assert(accepted(r), 'non-self context should pass through unchanged')
  })
})

describe('transport-agnostic CAN Name matching', () => {
  const CAN = 'c0788c00e7e04312'
  const PATH = 'navigation.speedOverGround'

  it('accepts same CAN Name under a different provider', () => {
    const cfg: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: `YDEN02.${CAN}` as SourceRef, timeout: 0 },
        { sourceRef: 'derived-data' as SourceRef, timeout: 5000 }
      ]
    }
    const toPreferred = getToPreferredDelta({ overrides: cfg })
    // Delta arrives via a remote Signal K server with the remote
    // providerId baked into $source.
    const r = toPreferred(
      makeDelta(`canhat.${CAN}`, PATH, 5),
      new Date(1000000),
      'self'
    )
    assert(
      accepted(r),
      'same CAN Name under a different provider should be treated as the ranked source'
    )
  })

  it('blocks a disabled CAN Name across providers', () => {
    const cfg: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: 'derived-data' as SourceRef, timeout: 0 },
        { sourceRef: `YDEN02.${CAN}` as SourceRef, timeout: -1 }
      ]
    }
    const toPreferred = getToPreferredDelta({ overrides: cfg })
    const r = toPreferred(
      makeDelta(`canhat.${CAN}`, PATH, 5),
      new Date(1000000),
      'self'
    )
    assert(
      !accepted(r),
      'blacklisting a CAN Name under one provider should block it under any provider'
    )
  })

  it('does not conflate NMEA 0183 talkers across providers', () => {
    const cfg: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: 'serial0.GP' as SourceRef, timeout: 0 },
        { sourceRef: 'tcp.GP' as SourceRef, timeout: -1 }
      ]
    }
    const toPreferred = getToPreferredDelta({ overrides: cfg })
    // serial0.GP is the preferred source; tcp.GP is disabled.
    // Both share the suffix "GP" but that is not a unique identity.
    const rDisabled = toPreferred(
      makeDelta('tcp.GP', PATH, 1),
      new Date(1000000),
      'self'
    )
    assert(!accepted(rDisabled), 'tcp.GP is disabled, so blocked')
    const rAllowed = toPreferred(
      makeDelta('serial0.GP', PATH, 2),
      new Date(1000100),
      'self'
    )
    assert(accepted(rAllowed), 'serial0.GP is allowed')
  })
})

describe('canonicalise sourceRef (useCanName=false providers)', () => {
  const CAN = 'c0788c00e7e04312'
  const PATH = 'navigation.headingMagnetic'

  it('matches a saved canName ranking against numeric-form deltas', () => {
    // Provider has useCanName off so $source is "can0.4" but the admin
    // UI saved the priority in canName form (because multiSourcePaths
    // canonicalised on read). The canonicalise getter is what closes
    // the loop.
    const canonical = (ref: string) => (ref === 'can0.4' ? `can0.${CAN}` : ref)
    const cfg: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: `can0.${CAN}` as SourceRef, timeout: 0 },
        { sourceRef: 'derived-data' as SourceRef, timeout: 5000 }
      ]
    }
    const toPreferred = getToPreferredDelta({
      overrides: cfg,
      canonicalise: canonical
    })
    const r = toPreferred(
      makeDelta('can0.4', PATH, 5),
      new Date(1000000),
      'self'
    )
    assert(
      accepted(r),
      'numeric-form delta should match canName-form ranking via canonicalise'
    )
  })

  it('still respects rank order across canonicalised sources', () => {
    // Two canName devices both publish; rank-2 must wait for rank-1
    // to go silent past the timeout. Identity matching is required for
    // the timeout rule to engage at all.
    const CAN_A = 'c1111111111aaaaa'
    const CAN_B = 'c2222222222bbbbb'
    const canonical = (ref: string) => {
      if (ref === 'can0.5') return `can0.${CAN_A}`
      if (ref === 'can0.7') return `can0.${CAN_B}`
      return ref
    }
    const cfg: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: `can0.${CAN_A}` as SourceRef, timeout: 0 },
        { sourceRef: `can0.${CAN_B}` as SourceRef, timeout: 5000 }
      ]
    }
    const toPreferred = getToPreferredDelta({
      overrides: cfg,
      canonicalise: canonical
    })
    // Rank-1 wins immediately.
    let r = toPreferred(makeDelta('can0.5', PATH, 1), new Date(1000000), 'self')
    assert(accepted(r), 'rank-1 should win')
    // Rank-2 within the timeout window: rejected.
    r = toPreferred(makeDelta('can0.7', PATH, 2), new Date(1001000), 'self')
    assert(!accepted(r), 'rank-2 should be held off while rank-1 is fresh')
    // Rank-2 after the timeout window: accepted.
    r = toPreferred(makeDelta('can0.7', PATH, 3), new Date(1010000), 'self')
    assert(accepted(r), 'rank-2 should take over after rank-1 timeout')
  })

  it('fan-out path passes every source unchanged regardless of ranking', () => {
    // Path is configured with the FANOUT sentinel; the engine must
    // deliver every source's value, including unconfigured ones,
    // without identity matching.
    const FAN_PATH = 'navigation.gnss.satellitesInView'
    const cfg: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: `can0.${CAN}` as SourceRef, timeout: 0 },
        { sourceRef: 'derived-data' as SourceRef, timeout: 5000 }
      ],
      [FAN_PATH]: [{ sourceRef: '*' as SourceRef, timeout: 0 }]
    }
    const toPreferred = getToPreferredDelta({ overrides: cfg })
    const r1 = toPreferred(
      makeDelta('can0.4', FAN_PATH, 5),
      new Date(1000000),
      'self'
    )
    const r2 = toPreferred(
      makeDelta('can0.7', FAN_PATH, 8),
      new Date(1000010),
      'self'
    )
    const r3 = toPreferred(
      makeDelta('whatever', FAN_PATH, 12),
      new Date(1000020),
      'self'
    )
    assert(accepted(r1), 'first source delivered')
    assert(accepted(r2), 'second source delivered')
    assert(accepted(r3), 'unconfigured source delivered too')
  })

  it('fan-out marker on one path does not affect other paths', () => {
    const FAN_PATH = 'navigation.gnss.satellitesInView'
    const cfg: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: `can0.${CAN}` as SourceRef, timeout: 0 },
        { sourceRef: 'other' as SourceRef, timeout: 5000 }
      ],
      [FAN_PATH]: [{ sourceRef: '*' as SourceRef, timeout: 0 }]
    }
    const canonical = (ref: string) => (ref === 'can0.9' ? `can0.${CAN}` : ref)
    const toPreferred = getToPreferredDelta({
      overrides: cfg,
      canonicalise: canonical
    })
    // PATH should still respect rank-1.
    const r1 = toPreferred(
      makeDelta('can0.9', PATH, 5),
      new Date(1000000),
      'self'
    )
    assert(accepted(r1), 'rank-1 wins on the non-fan-out path')
    // Unranked source on PATH within the timeout window is rejected.
    const r2 = toPreferred(
      makeDelta('whatever', PATH, 6),
      new Date(1001000),
      'self'
    )
    assert(!accepted(r2), 'unranked competitor blocked on non-fan-out path')
  })

  it('falls through unchanged when canonicalise has no translation', () => {
    // Cold-boot: address claim hasn't arrived yet, canonical map empty.
    // Engine must treat the delta as an unknown source per existing
    // semantics, not crash.
    const canonical = (ref: string) => ref
    const cfg: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: `can0.${CAN}` as SourceRef, timeout: 0 },
        { sourceRef: 'derived-data' as SourceRef, timeout: 5000 }
      ]
    }
    const toPreferred = getToPreferredDelta({
      overrides: cfg,
      canonicalise: canonical
    })
    const r = toPreferred(
      makeDelta('can0.4', PATH, 5),
      new Date(1000000),
      'self'
    )
    // Path is configured, the only known source has not appeared; the
    // unknown delta sneaks in as the first arrival per existing
    // "unknown that briefly wins" semantics. No fix from us — just
    // confirming we don't crash on missing translation.
    assert(accepted(r), 'unknown first-arrival is accepted (existing rule)')
  })
})

describe('group-aware resolution', () => {
  const PATH = 'environment.wind.speedApparent'

  it('group ranking applies dynamically when path has no override', () => {
    const groups: PriorityGroupConfig[] = [{ id: 'g1', sources: ['a', 'b'] }]
    const toPreferred = getToPreferredDelta({
      groups,
      fallbackMs: 5000
    })
    const t = 1000000

    // a wins immediately as rank-1
    let r = toPreferred(makeDelta('a', PATH, 1), new Date(t), 'self')
    assert(accepted(r), 'rank-1 a accepted')

    // b within fallback window: rejected
    r = toPreferred(makeDelta('b', PATH, 2), new Date(t + 1000), 'self')
    assert(!accepted(r), 'rank-2 b held off while a is fresh')

    // b after fallback: accepted
    r = toPreferred(makeDelta('b', PATH, 3), new Date(t + 6000), 'self')
    assert(accepted(r), 'rank-2 b takes over after fallback')
  })

  it('override outranks group ranking on the same path', () => {
    const groups: PriorityGroupConfig[] = [{ id: 'g1', sources: ['a', 'b'] }]
    const overrides: SourcePrioritiesData = {
      [PATH]: [
        { sourceRef: 'c' as SourceRef, timeout: 0 },
        { sourceRef: 'a' as SourceRef, timeout: 5000 }
      ]
    }
    const toPreferred = getToPreferredDelta({
      groups,
      overrides,
      fallbackMs: 5000
    })
    const t = 1000000

    // c wins (override rank-1)
    let r = toPreferred(makeDelta('c', PATH, 1), new Date(t), 'self')
    assert(accepted(r), 'override rank-1 c accepted')

    // b is in the group but the override doesn't list it; resolver hits
    // the override (because path is in overrides) so b is unknown to that
    // precedences map. With a known incumbent (c), b is rejected.
    r = toPreferred(makeDelta('b', PATH, 2), new Date(t + 100), 'self')
    assert(!accepted(r), 'b in group but not in override is unknown')
  })

  it('inactive group is excluded from resolution', () => {
    const groups: PriorityGroupConfig[] = [
      { id: 'g1', sources: ['a', 'b'], inactive: true }
    ]
    const toPreferred = getToPreferredDelta({
      groups,
      fallbackMs: 5000
    })
    const t = 1000000

    // Both a and b accepted as they arrive — no active config.
    let r = toPreferred(makeDelta('a', PATH, 1), new Date(t), 'self')
    assert(accepted(r), 'a accepted (group inactive)')
    r = toPreferred(makeDelta('b', PATH, 2), new Date(t + 100), 'self')
    assert(accepted(r), 'b accepted (group inactive)')
  })

  it('source not in any group passes through', () => {
    const groups: PriorityGroupConfig[] = [{ id: 'g1', sources: ['a', 'b'] }]
    const toPreferred = getToPreferredDelta({
      groups,
      fallbackMs: 5000
    })
    const r = toPreferred(makeDelta('z', PATH, 1), new Date(1000000), 'self')
    assert(accepted(r), 'unconfigured source passes through')
  })

  it('group ranking applies dynamically as new publishers join', () => {
    // The frozen-snapshot bug: under the old engine, a path with one
    // publisher at save time got dropped from priorities entirely;
    // a second publisher joining later flowed through unfiltered.
    // With group-aware resolution, the group ranking applies the
    // moment the second source emits.
    const groups: PriorityGroupConfig[] = [{ id: 'g1', sources: ['a', 'b'] }]
    const toPreferred = getToPreferredDelta({
      groups,
      fallbackMs: 5000
    })
    const t = 1000000

    // Only a publishes for a while.
    let r = toPreferred(makeDelta('a', PATH, 1), new Date(t), 'self')
    assert(accepted(r), 'a accepted (sole publisher)')

    // Now b joins — it must be ranked behind a per the group order.
    r = toPreferred(makeDelta('b', PATH, 2), new Date(t + 100), 'self')
    assert(!accepted(r), 'b held off — group ranking applied dynamically')
  })

  it('group ranking honours canonicalise for canName matching', () => {
    const CAN_A = 'c1111111111aaaaa'
    const CAN_B = 'c2222222222bbbbb'
    const canonical = (ref: string) => {
      if (ref === 'can0.5') return `can0.${CAN_A}`
      if (ref === 'can0.7') return `can0.${CAN_B}`
      return ref
    }
    const groups: PriorityGroupConfig[] = [
      {
        id: 'g1',
        sources: [`YDEN02.${CAN_A}`, `YDEN02.${CAN_B}`]
      }
    ]
    const toPreferred = getToPreferredDelta({
      groups,
      canonicalise: canonical,
      fallbackMs: 5000
    })
    const t = 1000000

    // Numeric-form delta resolves via canonicalise + canName identity to
    // the group's rank-1 entry.
    let r = toPreferred(makeDelta('can0.5', PATH, 1), new Date(t), 'self')
    assert(accepted(r), 'rank-1 (canName) wins via canonicalise')

    r = toPreferred(makeDelta('can0.7', PATH, 2), new Date(t + 1000), 'self')
    assert(!accepted(r), 'rank-2 held off')
  })

  it('fan-out override on a path bypasses group ranking', () => {
    const groups: PriorityGroupConfig[] = [{ id: 'g1', sources: ['a', 'b'] }]
    const overrides: SourcePrioritiesData = {
      [PATH]: [{ sourceRef: '*' as SourceRef, timeout: 0 }]
    }
    const toPreferred = getToPreferredDelta({
      groups,
      overrides
    })
    const t = 1000000
    const r1 = toPreferred(makeDelta('a', PATH, 1), new Date(t), 'self')
    const r2 = toPreferred(makeDelta('b', PATH, 2), new Date(t + 100), 'self')
    const r3 = toPreferred(makeDelta('z', PATH, 3), new Date(t + 200), 'self')
    assert(accepted(r1) && accepted(r2) && accepted(r3), 'all sources fan out')
  })

  it('overlapping group sources: first match wins', () => {
    // The validator on the server rejects this, but the engine must
    // not crash if the config slips through. First-found-wins.
    const groups: PriorityGroupConfig[] = [
      { id: 'g1', sources: ['a', 'b'] },
      { id: 'g2', sources: ['a', 'c'] }
    ]
    const toPreferred = getToPreferredDelta({
      groups,
      fallbackMs: 5000
    })
    const t = 1000000

    // a is in g1 (first occurrence). g1's ranking [a, b] applies to its
    // paths; a wins, b would be rank-2.
    let r = toPreferred(makeDelta('a', PATH, 1), new Date(t), 'self')
    assert(accepted(r), 'a accepted as g1 rank-1')
    r = toPreferred(makeDelta('b', PATH, 2), new Date(t + 100), 'self')
    assert(!accepted(r), 'b held off as g1 rank-2')
  })
})
