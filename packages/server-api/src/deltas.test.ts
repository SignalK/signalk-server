import { Delta, Path } from './deltas'

// Type-check tests - verify Delta types compile correctly
const _typeCheckMetaDelta: Delta = {
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
void _typeCheckMetaDelta

const _typeCheckValuesDelta: Delta = {
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
void _typeCheckValuesDelta

const _typeCheckCombinedDelta: Delta = {
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
void _typeCheckCombinedDelta
