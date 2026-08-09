import { describe, it, expect } from 'vitest'
import { Check } from 'typebox/value'
import {
  applyWebappSort,
  mergeLastUsed,
  WebappSortDocSchema,
  type SortableWebapp
} from './webappSort'

const app = (name: string, displayName?: string): SortableWebapp =>
  displayName ? { name, signalk: { displayName } } : { name }

const names = (webapps: SortableWebapp[]) => webapps.map((w) => w.name)

describe('applyWebappSort', () => {
  describe('name mode', () => {
    it('sorts alphabetically, case-insensitive', () => {
      const result = applyWebappSort(
        [app('zulu'), app('Alpha'), app('mike')],
        'name',
        [],
        {}
      )
      expect(names(result)).toEqual(['Alpha', 'mike', 'zulu'])
    })

    it('sorts by displayName when present, package name otherwise', () => {
      const result = applyWebappSort(
        [app('a-package', 'Zebra App'), app('z-package', 'Anchor App')],
        'name',
        [],
        {}
      )
      expect(names(result)).toEqual(['z-package', 'a-package'])
    })
  })

  describe('custom mode', () => {
    it('orders by the stored order', () => {
      const result = applyWebappSort(
        [app('a'), app('b'), app('c')],
        'custom',
        ['c', 'a', 'b'],
        {}
      )
      expect(names(result)).toEqual(['c', 'a', 'b'])
    })

    it('appends webapps missing from the stored order as an alphabetical tail', () => {
      const result = applyWebappSort(
        [app('new-b'), app('ranked'), app('new-a')],
        'custom',
        ['ranked'],
        {}
      )
      expect(names(result)).toEqual(['ranked', 'new-a', 'new-b'])
    })

    it('tolerates stored names that are not installed (slot kept, no crash)', () => {
      const result = applyWebappSort(
        [app('b'), app('a')],
        'custom',
        ['gone', 'b', 'a'],
        {}
      )
      expect(names(result)).toEqual(['b', 'a'])
    })
  })

  describe('lastUsed mode', () => {
    it('sorts by most recent launch first', () => {
      const result = applyWebappSort(
        [app('old'), app('newest'), app('mid')],
        'lastUsed',
        [],
        { old: 100, newest: 300, mid: 200 }
      )
      expect(names(result)).toEqual(['newest', 'mid', 'old'])
    })

    it('puts never-launched webapps in an alphabetical tail', () => {
      const result = applyWebappSort(
        [app('n-zulu'), app('used'), app('n-alpha')],
        'lastUsed',
        [],
        { used: 100 }
      )
      expect(names(result)).toEqual(['used', 'n-alpha', 'n-zulu'])
    })

    it('is not confused by webapps named like Object.prototype members', () => {
      const result = applyWebappSort(
        [app('constructor'), app('used')],
        'lastUsed',
        [],
        { used: 100 }
      )
      expect(names(result)).toEqual(['used', 'constructor'])
    })
  })

  it('does not mutate its input', () => {
    const input = [app('b'), app('a')]
    applyWebappSort(input, 'name', [], {})
    expect(names(input)).toEqual(['b', 'a'])
  })
})

describe('mergeLastUsed', () => {
  it('takes the per-webapp maximum and unions both maps', () => {
    expect(mergeLastUsed({ a: 100, b: 500 }, { b: 200, c: 300 })).toEqual({
      a: 100,
      b: 500,
      c: 300
    })
  })

  it('handles empty maps', () => {
    expect(mergeLastUsed({}, { a: 1 })).toEqual({ a: 1 })
    expect(mergeLastUsed({ a: 1 }, {})).toEqual({ a: 1 })
    expect(mergeLastUsed({}, {})).toEqual({})
  })
})

describe('WebappSortDocSchema', () => {
  const valid = {
    sortMode: 'custom',
    customOrder: ['a', 'b'],
    lastUsed: { a: 123 }
  }

  it('accepts a valid document', () => {
    expect(Check(WebappSortDocSchema, valid)).toBe(true)
  })

  it('rejects an unknown sort mode', () => {
    expect(Check(WebappSortDocSchema, { ...valid, sortMode: 'frecency' })).toBe(
      false
    )
  })

  it('rejects non-string custom order entries', () => {
    expect(Check(WebappSortDocSchema, { ...valid, customOrder: [1, 2] })).toBe(
      false
    )
  })

  it('rejects non-numeric lastUsed timestamps', () => {
    expect(
      Check(WebappSortDocSchema, { ...valid, lastUsed: { a: '123' } })
    ).toBe(false)
  })

  it('rejects missing fields and non-objects', () => {
    expect(Check(WebappSortDocSchema, { sortMode: 'name' })).toBe(false)
    expect(Check(WebappSortDocSchema, null)).toBe(false)
    expect(Check(WebappSortDocSchema, 'name')).toBe(false)
  })
})
