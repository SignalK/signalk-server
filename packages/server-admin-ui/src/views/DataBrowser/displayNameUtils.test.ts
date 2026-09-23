import { describe, it, expect } from 'vitest'
import { notificationDataPath, resolveDisplayName } from './displayNameUtils'

describe('notificationDataPath', () => {
  it('maps a notification path to its data path', () => {
    expect(
      notificationDataPath('notifications.tanks.freshWater.2.currentLevel')
    ).toBe('tanks.freshWater.2.currentLevel')
  })

  it('returns undefined for data paths and the bare notifications root', () => {
    expect(
      notificationDataPath('tanks.freshWater.2.currentLevel')
    ).toBeUndefined()
    expect(notificationDataPath('notifications')).toBeUndefined()
  })
})

describe('resolveDisplayName', () => {
  const meta = {
    'tanks.freshWater.2.currentLevel': { displayName: 'Freshwater STB' },
    'tanks.freshWater.2': { displayName: 'Tank object name' },
    'electrical.switches.bank.10.1.state': { displayName: 'Anchor light' },
    'notifications.special': { displayName: 'Direct notification name' },
    'tanks.freshWater.9.currentLevel': { units: 'ratio' }
  }

  it('returns the displayName stored at the exact path', () => {
    expect(
      resolveDisplayName(meta, 'electrical.switches.bank.10.1.state')
    ).toEqual({
      name: 'Anchor light',
      metaPath: 'electrical.switches.bank.10.1.state'
    })
  })

  it('does NOT inherit from ancestor paths', () => {
    // tanks.freshWater.2 has a name; capacity must not pick it up.
    expect(resolveDisplayName(meta, 'tanks.freshWater.2.capacity')).toBeNull()
  })

  it('maps a notifications row to the data path it mirrors', () => {
    expect(
      resolveDisplayName(meta, 'notifications.tanks.freshWater.2.currentLevel')
    ).toEqual({
      name: 'Freshwater STB',
      metaPath: 'tanks.freshWater.2.currentLevel'
    })
  })

  it('prefers a name stored directly at the notification path', () => {
    expect(resolveDisplayName(meta, 'notifications.special')).toEqual({
      name: 'Direct notification name',
      metaPath: 'notifications.special'
    })
  })

  it('returns null for meta without displayName, missing meta and empty input', () => {
    expect(
      resolveDisplayName(meta, 'tanks.freshWater.9.currentLevel')
    ).toBeNull()
    expect(resolveDisplayName(meta, 'navigation.position')).toBeNull()
    expect(
      resolveDisplayName(undefined, 'tanks.freshWater.2.currentLevel')
    ).toBeNull()
    expect(resolveDisplayName(meta, '')).toBeNull()
  })

  it('treats a non-string or empty displayName as unset', () => {
    expect(resolveDisplayName({ p: { displayName: 42 } }, 'p')).toBeNull()
    expect(resolveDisplayName({ p: { displayName: '' } }, 'p')).toBeNull()
    expect(resolveDisplayName({ p: { displayName: null } }, 'p')).toBeNull()
  })
})
