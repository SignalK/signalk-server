import { Delta, Path } from './deltas'

/**
 * Type-check tests - verify Delta types compile correctly.
 * These are exported to satisfy noUnusedLocals while serving as type examples.
 * @ignore
 */
export const _typeCheckMetaDelta: Delta = {
  updates: [
    {
      meta: [
        {
          path: 'foo.bar' as Path,
          value: {
            displayName: 'Foo Bar'
          }
        }
      ]
    }
  ]
}

/** @ignore */
export const _typeCheckValuesDelta: Delta = {
  updates: [
    {
      values: [
        {
          path: 'foo.bar' as Path,
          value: {
            displayName: 'Foo Bar'
          }
        }
      ]
    }
  ]
}

/** @ignore */
export const _typeCheckCombinedDelta: Delta = {
  updates: [
    {
      meta: [
        {
          path: 'foo.bar' as Path,
          value: {
            displayName: 'Foo Bar'
          }
        }
      ]
    },
    {
      values: [
        {
          path: 'foo.bar' as Path,
          value: {
            displayName: 'Foo Bar'
          }
        }
      ]
    }
  ]
}
