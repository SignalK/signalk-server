import { describe, it, expect } from 'vitest'
import * as streams from '../../../../streams/src/n2k-instance-groups'
import { deviceKeyFromCanName } from '../../utils/n2kDeviceKey'
import {
  FORBIDDEN_TARGET_SEGMENTS,
  GROUP_LABELS,
  MAPPABLE_PGNS,
  MAX_TARGET_LENGTH,
  MAX_TARGET_SEGMENTS,
  NOTIFICATIONS_ROOT
} from './n2kInstances'

// The admin UI keeps its own copy of the instance group ids and their PGNs,
// the target grammar and the device key decoding so it does not bundle
// canboat or server code; these tests fail when the copies drift from the
// server's.
describe('n2kInstances agrees with the server', () => {
  it('lists every PGN of the group table as mappable', () => {
    const pgns = streams.N2K_INSTANCE_GROUPS.flatMap((group) => group.pgns).map(
      String
    )
    expect([...MAPPABLE_PGNS].sort()).toEqual([...new Set(pgns)].sort())
  })

  it('labels exactly the server groups', () => {
    expect(Object.keys(GROUP_LABELS).sort()).toEqual(
      streams.N2K_INSTANCE_GROUPS.map((group) => group.id).sort()
    )
  })

  it('enforces the server target grammar', () => {
    expect({
      MAX_TARGET_LENGTH,
      MAX_TARGET_SEGMENTS,
      NOTIFICATIONS_ROOT,
      FORBIDDEN_TARGET_SEGMENTS: [...FORBIDDEN_TARGET_SEGMENTS].sort()
    }).toEqual({
      MAX_TARGET_LENGTH: streams.MAX_TARGET_LENGTH,
      MAX_TARGET_SEGMENTS: streams.MAX_TARGET_SEGMENTS,
      NOTIFICATIONS_ROOT: streams.NOTIFICATIONS_ROOT,
      FORBIDDEN_TARGET_SEGMENTS: [...streams.FORBIDDEN_TARGET_SEGMENTS].sort()
    })
  })

  it('decodes device keys as the server does', () => {
    // The NAMEs of utils/n2kDeviceKey.test.ts.
    const lowWord = (((137 << 21) | 656598) >>> 0).toString(16)
    const canNames = [
      'c0788c00' + lowWord.padStart(8, '0'),
      '788c00' + lowWord,
      'a0',
      'ffffffffffffffff',
      '',
      'xyz',
      '1'.repeat(17)
    ]
    for (const canName of canNames) {
      expect(deviceKeyFromCanName(canName), canName).toBe(
        streams.deviceKeyFromCanName(canName)
      )
    }
  })
})
