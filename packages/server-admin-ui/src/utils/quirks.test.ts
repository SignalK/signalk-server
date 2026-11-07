import { describe, it, expect } from 'vitest'
import { splitQuirksField } from './quirks'

describe('splitQuirksField', () => {
  it('splits entries on whitespace', () => {
    expect(splitQuirksField('gps-rollover   gps-rollover=all')).toEqual([
      'gps-rollover',
      'gps-rollover=all'
    ])
  })

  it('keeps whitespace next to a comma inside the device list', () => {
    expect(splitQuirksField('gps-rollover=4,   1851:491603 x')).toEqual([
      'gps-rollover=4,   1851:491603',
      'x'
    ])
    expect(splitQuirksField('gps-rollover=4\t ,1851:491603')).toEqual([
      'gps-rollover=4\t ,1851:491603'
    ])
  })

  it('keeps the empty entries typing leaves', () => {
    expect(splitQuirksField('')).toEqual([''])
    expect(splitQuirksField('gps-rollover ')).toEqual(['gps-rollover', ''])
    expect(splitQuirksField(' gps-rollover')).toEqual(['', 'gps-rollover'])
  })
})
