import { describe, it, expect } from 'vitest'
import { fromCenterFor, sideOfFromCenter } from './fromCenterSide'

describe('sideOfFromCenter', () => {
  it('reads a positive value as starboard', () => {
    expect(sideOfFromCenter(1.5, 'port')).toBe('starboard')
  })

  it('reads a negative value as port', () => {
    expect(sideOfFromCenter(-1.5, 'starboard')).toBe('port')
  })

  it('uses the fallback on the centerline, including -0', () => {
    expect(sideOfFromCenter(0, 'starboard')).toBe('starboard')
    expect(sideOfFromCenter(-0, 'starboard')).toBe('starboard')
    expect(sideOfFromCenter(-0, 'port')).toBe('port')
  })

  it('uses the fallback when unset', () => {
    expect(sideOfFromCenter(null, 'starboard')).toBe('starboard')
  })
})

describe('fromCenterFor', () => {
  it('makes a starboard distance positive', () => {
    expect(fromCenterFor(1.5, 'starboard')).toBe(1.5)
  })

  it('makes a port distance negative', () => {
    expect(fromCenterFor(1.5, 'port')).toBe(-1.5)
  })

  it('never returns -0', () => {
    expect(Object.is(fromCenterFor(0, 'port'), 0)).toBe(true)
  })

  it('round-trips through sideOfFromCenter', () => {
    for (const side of ['port', 'starboard'] as const) {
      const other = side === 'port' ? 'starboard' : 'port'
      expect(sideOfFromCenter(fromCenterFor(2, side), other)).toBe(side)
    }
  })
})
