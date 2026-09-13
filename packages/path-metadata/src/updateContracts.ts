import type { UpdateContract } from './types'

/**
 * How a path is expected to update, declared per subtree.
 *
 * `periodic` (the default when nothing matches) means regular updates are
 * expected, so silence beyond a timeout indicates a failure. `event` means the
 * value is emitted only when it changes, so silence means unchanged and a
 * timeout is meaningless — an anchor position or an active course does not
 * become invalid because it has not been restated.
 *
 * Declared by subtree rather than per path: a contract is a property of a
 * branch of the data model, and listing every descendant would drift as paths
 * are added. Keys are dot-separated paths with the context root stripped, and
 * the longest match wins.
 */
export const updateContracts: Readonly<Record<string, UpdateContract>> =
  Object.freeze({
    notifications: 'event',
    design: 'event',
    'navigation.anchor': 'event',
    'navigation.home': 'event',
    'navigation.course': 'event',
    uuid: 'event',
    mmsi: 'event',
    url: 'event',
    name: 'event',
    flag: 'event',
    port: 'event',
    registrations: 'event',
    communication: 'event'
  })

// Longest prefix first, so `navigation.anchor` wins over `navigation`.
const byLength = Object.entries(updateContracts).sort(
  (a, b) => b[0].length - a[0].length
)

/**
 * The contract declared for a path, inherited from the nearest ancestor
 * subtree. Returns undefined when no subtree covers the path; callers treat
 * that as `periodic`.
 */
export const updateContractForPath = (
  path: string
): UpdateContract | undefined => {
  for (const [prefix, contract] of byLength) {
    if (path === prefix || path.startsWith(prefix + '.')) return contract
  }
  return undefined
}
