import { MetaValue, UpdateContract } from '@signalk/server-api'
import updateContractDefaults from './defaults/updateContracts.json'

type UpdateContractDefaults = ReadonlyArray<readonly [string, UpdateContract]>

/**
 * Build a longest-prefix-match table from the shipped updateContracts.json so a
 * single defaults lookup decides whether a path is event-driven without the
 * caller special-casing prefixes inline.
 */
const buildUpdateContractDefaults = (
  raw: Record<string, string>
): UpdateContractDefaults => {
  const entries: Array<[string, UpdateContract]> = []
  for (const prefix of Object.keys(raw)) {
    const t = raw[prefix]
    if (t === 'periodic' || t === 'event') {
      entries.push([prefix, t])
    }
  }
  entries.sort((a, b) => b[0].length - a[0].length)
  return entries
}

const DEFAULT_UPDATE_CONTRACTS = buildUpdateContractDefaults(
  updateContractDefaults as Record<string, string>
)

/** The contract the shipped classification gives a path, if it covers it. */
export const resolveUpdateContractFromDefaults = (
  path: string
): UpdateContract | undefined => {
  for (const [prefix, updateContract] of DEFAULT_UPDATE_CONTRACTS) {
    if (path === prefix || path.startsWith(prefix + '.')) return updateContract
  }
  return undefined
}

/**
 * The contract actually in force for a path: an explicit `meta.updateContract`
 * wins, then the shipped classification, and everything else is periodic.
 */
export const resolveUpdateContract = (
  path: string,
  meta: MetaValue | undefined
): UpdateContract => {
  if (meta?.updateContract) return meta.updateContract
  return resolveUpdateContractFromDefaults(path) ?? 'periodic'
}
