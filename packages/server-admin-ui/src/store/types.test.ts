import { describe, it, expect } from 'vitest'
import { sanitizeWebappStatusMap } from './types'

describe('sanitizeWebappStatusMap', () => {
  it('keeps entries with finite numeric counts', () => {
    const input = {
      'app-a': {
        warnCount: 2,
        errorCount: 1,
        timeStamp: '2026-07-17T00:00:00Z'
      },
      'app-b': { warnCount: 0, errorCount: 3 }
    }
    expect(sanitizeWebappStatusMap(input)).toEqual({
      'app-a': {
        warnCount: 2,
        errorCount: 1,
        timeStamp: '2026-07-17T00:00:00Z'
      },
      'app-b': { warnCount: 0, errorCount: 3, timeStamp: undefined }
    })
  })

  it('drops null and malformed entries so badge renderers never read off null', () => {
    const input = {
      'null-entry': null,
      'missing-counts': { timeStamp: 'x' },
      'string-count': { warnCount: '2', errorCount: 1 },
      'nan-count': { warnCount: NaN, errorCount: 1 },
      good: { warnCount: 1, errorCount: 0 }
    }
    expect(sanitizeWebappStatusMap(input)).toEqual({
      good: { warnCount: 1, errorCount: 0, timeStamp: undefined }
    })
  })

  it('returns an empty map for non-object payloads', () => {
    expect(sanitizeWebappStatusMap(null)).toEqual({})
    expect(sanitizeWebappStatusMap(undefined)).toEqual({})
    expect(sanitizeWebappStatusMap('nope')).toEqual({})
  })
})
