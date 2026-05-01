import { describe, it, expect } from 'vitest'
import { computeGroups, reconcileGroups } from './sourceGroups'

describe('computeGroups', () => {
  it('returns empty array for empty input', () => {
    expect(computeGroups({})).toEqual([])
  })

  it('skips single-source paths', () => {
    const groups = computeGroups({
      'environment.wind.speedTrue': ['plugin.derived-data']
    })
    expect(groups).toEqual([])
  })

  it('groups two sources sharing a single path', () => {
    const groups = computeGroups({
      'navigation.position': ['gps.furuno', 'gps.garmin']
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].sources).toEqual(['gps.furuno', 'gps.garmin'])
    expect(groups[0].paths).toEqual(['navigation.position'])
  })

  it('produces two disjoint groups when source sets do not overlap', () => {
    const groups = computeGroups({
      'navigation.position': ['gps.a', 'gps.b'],
      'environment.wind.speedApparent': ['wind.x', 'wind.y']
    })
    expect(groups).toHaveLength(2)
    const gpsGroup = groups.find((g) => g.sources.includes('gps.a'))
    const windGroup = groups.find((g) => g.sources.includes('wind.x'))
    expect(gpsGroup?.sources).toEqual(['gps.a', 'gps.b'])
    expect(windGroup?.sources).toEqual(['wind.x', 'wind.y'])
  })

  it('merges a chain A-B, B-C, C-D into a single group', () => {
    const groups = computeGroups({
      p1: ['a', 'b'],
      p2: ['b', 'c'],
      p3: ['c', 'd']
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].sources).toEqual(['a', 'b', 'c', 'd'])
    expect(groups[0].paths).toEqual(['p1', 'p2', 'p3'])
  })

  it('merges a star A-B, A-C, A-D into a single group', () => {
    const groups = computeGroups({
      p1: ['a', 'b'],
      p2: ['a', 'c'],
      p3: ['a', 'd']
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].sources).toEqual(['a', 'b', 'c', 'd'])
  })

  it('produces a stable id derived from the sorted sources', () => {
    const a = computeGroups({ p: ['x', 'y'] })
    const b = computeGroups({ p: ['y', 'x'] })
    expect(a[0].id).toEqual(b[0].id)
  })
})

describe('reconcileGroups', () => {
  it('returns matchedSavedId null when no saved group matches', () => {
    const derived = computeGroups({ p: ['a', 'b'] })
    const result = reconcileGroups(derived, [])
    expect(result[0].matchedSavedId).toBeNull()
    expect(result[0].sources).toEqual(['a', 'b'])
  })

  it('preserves saved ordering for fully-overlapping group', () => {
    const derived = computeGroups({ p: ['a', 'b', 'c'] })
    const saved = [{ id: 'g1', sources: ['c', 'a', 'b'] }]
    const result = reconcileGroups(derived, saved)
    expect(result[0].sources).toEqual(['c', 'a', 'b'])
    expect(result[0].matchedSavedId).toBe('g1')
  })

  it('appends newcomers at the end in alphabetical order', () => {
    const derived = computeGroups({ p: ['a', 'b', 'c', 'z'] })
    const saved = [{ id: 'g1', sources: ['c', 'a'] }]
    const result = reconcileGroups(derived, saved)
    expect(result[0].sources).toEqual(['c', 'a', 'b', 'z'])
    expect(result[0].newcomerSources).toEqual(['b', 'z'])
  })

  it('reports no newcomers when saved ranking already covers the live group', () => {
    const derived = computeGroups({ p: ['a', 'b'] })
    const saved = [{ id: 'g1', sources: ['b', 'a'] }]
    const result = reconcileGroups(derived, saved)
    expect(result[0].newcomerSources).toEqual([])
  })

  it('reports no newcomers for unranked groups (matchedSavedId null)', () => {
    const derived = computeGroups({ p: ['a', 'b'] })
    const result = reconcileGroups(derived, [])
    expect(result[0].matchedSavedId).toBeNull()
    expect(result[0].newcomerSources).toEqual([])
  })

  it('picks the saved group with maximal overlap', () => {
    const derived = computeGroups({ p: ['a', 'b', 'c'] })
    const saved = [
      { id: 'small', sources: ['a', 'z'] },
      { id: 'big', sources: ['c', 'b', 'a'] }
    ]
    const result = reconcileGroups(derived, saved)
    expect(result[0].matchedSavedId).toBe('big')
    expect(result[0].sources).toEqual(['c', 'b', 'a'])
  })
})
