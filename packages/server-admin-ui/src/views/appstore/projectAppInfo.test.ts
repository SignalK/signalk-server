import { describe, it, expect } from 'vitest'
import { hasPendingInstall } from './projectAppInfo'
import type { AppInfo } from '../../store/types'

const app = (extra: Partial<AppInfo>): AppInfo => ({
  name: 'plugin-a',
  ...extra
})

describe('hasPendingInstall', () => {
  it('is true once an install has settled successfully', () => {
    expect(
      hasPendingInstall(app({ installing: true, pendingVersion: '2.0.0' }))
    ).toBe(true)
  })

  it('is false while the install is still running or queued', () => {
    expect(
      hasPendingInstall(
        app({ installing: true, pendingVersion: '2.0.0', isInstalling: true })
      )
    ).toBe(false)
    expect(
      hasPendingInstall(
        app({ installing: true, pendingVersion: '2.0.0', isWaiting: true })
      )
    ).toBe(false)
  })

  it('is false when the install failed', () => {
    expect(
      hasPendingInstall(
        app({ installing: true, pendingVersion: '2.0.0', installFailed: true })
      )
    ).toBe(false)
  })

  it('is false for removals', () => {
    expect(
      hasPendingInstall(
        app({ installing: true, pendingVersion: '2.0.0', isRemove: true })
      )
    ).toBe(false)
    expect(
      hasPendingInstall(
        app({ installing: true, pendingVersion: '2.0.0', isRemoving: true })
      )
    ).toBe(false)
  })

  it('is false without an install in progress or a pending version', () => {
    expect(hasPendingInstall(app({ pendingVersion: '2.0.0' }))).toBe(false)
    expect(hasPendingInstall(app({ installing: true }))).toBe(false)
  })
})
