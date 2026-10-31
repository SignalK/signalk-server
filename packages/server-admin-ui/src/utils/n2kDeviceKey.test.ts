import { describe, it, expect } from 'vitest'
import { deviceKeyFromCanName, devicesSharingKey } from './n2kDeviceKey'

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

describe('devicesSharingKey', () => {
  const nameWith = (deviceInstance: number) =>
    deviceInstance.toString(16).padStart(8, '0') +
    LOW_WORD.toString(16).padStart(8, '0')
  const device = (sourceRef: string, canName: string) => ({
    sourceRef,
    canName
  })
  const A = device('can0.a', nameWith(1))
  const KEY = '137:656598'
  const online = () => true

  it('finds an online device with the same key under another NAME', () => {
    const B = device('can0.b', nameWith(2))
    expect(devicesSharingKey(A, KEY, [A, B], online)).toEqual([B])
  })

  it('lists a NAME seen on two connections once', () => {
    const B = device('can0.b', nameWith(2))
    const B2 = device('can1.b', nameWith(2))
    expect(devicesSharingKey(A, KEY, [A, B, B2], online)).toEqual([B])
  })

  it('treats the same NAME on another connection as the same device', () => {
    expect(
      devicesSharingKey(A, KEY, [A, device('can1.a', nameWith(1))], online)
    ).toEqual([])
  })

  it('ignores devices that are not online, or when the device is not', () => {
    const B = device('can0.b', nameWith(2))
    expect(
      devicesSharingKey(A, KEY, [A, B], (d) => d.sourceRef !== 'can0.b')
    ).toEqual([])
    expect(
      devicesSharingKey(A, KEY, [A, B], (d) => d.sourceRef !== 'can0.a')
    ).toEqual([])
  })

  it('ignores devices with another key or no NAME', () => {
    const other = device('can0.c', 'ffffffff00000001')
    const unnamed = { sourceRef: 'can0.d' }
    expect(devicesSharingKey(A, KEY, [A, other, unnamed], online)).toEqual([])
  })
})
