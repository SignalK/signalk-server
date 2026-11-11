import { expect } from 'chai'

import { wildcardMatcher } from '../src/wildcard'

const MAX_MATCH_MS = 50

describe('wildcardMatcher', () => {
  const cases: [string, string, boolean][] = [
    ['*', '', true],
    ['*', 'navigation.position', true],
    ['navigation.position', 'navigation.position', true],
    ['navigation.position', 'navigation.positionX', false],
    ['navigation.*', 'navigation.position', true],
    ['navigation.*', 'navigation.', true],
    ['navigation.*', 'navigation', false],
    ['navigation.*', 'environment.wind', false],
    ['*.position', 'navigation.position', true],
    ['*.position', 'navigation.positionX', false],
    ['vessels.*', 'vessels.urn:mrn:imo:mmsi:230099999', true],
    ['vessels.*', 'atons.urn:mrn:imo:mmsi:992351234', false],
    ['a*b*c', 'abc', true],
    ['a*b*c', 'axxbyyc', true],
    ['a*b*c', 'acb', false],
    ['ab*ba', 'aba', false],
    ['ab*ba', 'abba', true],
    ['a**b', 'ab', true],
    ['propulsion.*.revolutions', 'propulsion.port.revolutions', true],
    ['propulsion.*.revolutions', 'propulsion.port.temperature', false],
    ['navigation.?osition', 'navigation.position', false],
    ['navigation.?osition', 'navigation.?osition', true],
    ['electrical.(x)+', 'electrical.(x)+', true],
    ['electrical.(x)+', 'electrical.xx', false]
  ]

  cases.forEach(([pattern, value, expected]) => {
    it(`${pattern} ${expected ? 'matches' : 'does not match'} ${value}`, () => {
      expect(wildcardMatcher(pattern)(value)).to.equal(expected)
    })
  })

  it('rejects the advisory proof of concept quickly', () => {
    const started = Date.now()
    expect(wildcardMatcher('*a'.repeat(30))('a'.repeat(40) + '!')).to.equal(
      false
    )
    expect(Date.now() - started).to.be.below(MAX_MATCH_MS)
  })

  it('matches chained wildcards without catastrophic backtracking', () => {
    const value = 'vessels.urn:mrn:imo:mmsi:' + 'a'.repeat(5000)
    const patterns = [
      '*'.repeat(1000) + 'x',
      '*a'.repeat(1000) + 'x',
      '*.'.repeat(1000) + 'x'
    ]
    for (const pattern of patterns) {
      const started = Date.now()
      expect(wildcardMatcher(pattern)(value)).to.equal(false)
      expect(Date.now() - started).to.be.below(MAX_MATCH_MS)
    }
  })
})
