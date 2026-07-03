import { Delta, Path, Timestamp } from './deltas'

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

const _typeCheckTimedOutDelta: Delta = {
  updates: [
    {
      values: [
        {
          path: 'navigation.speedOverGround' as Path,
          value: null,
          state: {
            timedOut: true,
            lastValue: {
              timestamp: '2026-03-28T10:00:00Z' as Timestamp,
              value: 5.5
            }
          }
        }
      ]
    }
  ]
}
void _typeCheckTimedOutDelta

const _typeCheckUpdateContractMeta: Delta = {
  updates: [
    {
      meta: [
        {
          path: 'notifications.mob' as Path,
          value: {
            updateContract: 'event'
          }
        },
        {
          path: 'navigation.speedOverGround' as Path,
          value: {
            timeout: 'auto',
            updateContract: 'periodic'
          }
        },
        {
          path: 'environment.depth.belowKeel' as Path,
          value: {
            timeout: 5
          }
        }
      ]
    }
  ]
}
void _typeCheckUpdateContractMeta
