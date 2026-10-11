import { describe, it, expect } from 'vitest'
import { deviceKeyFromCanName } from './n2kDeviceKey'

// NAME with manufacturer code 137 and unique number 656598 in the low word.
const LOW_WORD = ((137 << 21) | 656598) >>> 0

describe('deviceKeyFromCanName', () => {
  it('decodes manufacturer code and unique number from the low word', () => {
    const canName = 'c0788c00' + LOW_WORD.toString(16).padStart(8, '0')
    expect(deviceKeyFromCanName(canName)).toBe('137:656598')
  })

  it('decodes a NAME with fewer than 16 hex digits', () => {
    expect(deviceKeyFromCanName('788c00' + LOW_WORD.toString(16))).toBe(
      '137:656598'
    )
    expect(deviceKeyFromCanName('a0')).toBe('0:160')
  })

  it('decodes the highest manufacturer code and unique number', () => {
    expect(deviceKeyFromCanName('ffffffffffffffff')).toBe('2047:2097151')
  })

  it('rejects a value that is not a hex NAME', () => {
    expect(deviceKeyFromCanName('')).toBeUndefined()
    expect(deviceKeyFromCanName('xyz')).toBeUndefined()
    expect(deviceKeyFromCanName('1'.repeat(17))).toBeUndefined()
  })
})
